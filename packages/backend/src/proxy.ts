/**
 * OpenAI-compatible /v1/chat/completions proxy.
 *
 * Auth:    Authorization: Bearer bb_live_… (our issued key)
 * Forward: → https://openrouter.ai/api/v1/chat/completions with our master key
 * Account: deduct (upstream cost × margin) from balance after the call
 *
 * Streaming responses pass through unchanged. We only inspect usage for
 * non-streaming responses; streaming usage is read from the final SSE
 * `data: {usage: …}` chunk emitted by OpenRouter.
 */

import { Hono } from "hono";
import { cacheGet, cacheKey, cachePut, type ChatMessage } from "./cache.ts";
import {
  db,
  deductCredits,
  findKeyByHash,
  logUsage,
} from "./db.ts";
import { hashKey, isWellFormed } from "./keys.ts";
import {
  PRICES,
  upstreamCostMicros,
  withMargin,
  type Usage,
} from "./pricing.ts";
import type { Env } from "./types.ts";

export const proxy = new Hono<{ Bindings: Env }>();

proxy.post("/v1/chat/completions", async (c) => {
  const auth = c.req.header("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return jsonError(c, 401, "missing_authorization", "Set Authorization: Bearer …");
  if (!isWellFormed(bearer)) {
    return jsonError(c, 401, "invalid_key_format", "Not a BorderBrowser key.");
  }

  const sql = db(c.env.DATABASE_URL);
  const keyHash = await hashKey(bearer);
  const key = await findKeyByHash(sql, keyHash);
  if (!key) return jsonError(c, 401, "key_not_found", "Unknown API key.");
  if (key.revoked) return jsonError(c, 403, "key_revoked", "This key has been revoked.");
  if (key.credits_remaining <= 0) {
    return jsonError(
      c,
      402,
      "insufficient_credits",
      "Out of credits. Top up at " + c.env.HOMEPAGE_URL + "/topup",
    );
  }

  const body = await c.req.json<{ model?: string; stream?: boolean; messages?: ChatMessage[] }>();
  const model = body.model ?? "";
  if (!(model in PRICES)) {
    return jsonError(c, 400, "model_not_supported", `Model "${model}" is not enabled on BorderBrowser.`);
  }

  // Edge cache (Vision §8). Opt-in per request via header. Streaming is not
  // cached: the upside is small (the body is consumed once) and the wiring
  // would either buffer the stream or replay it as SSE — both ugly.
  const cacheOptIn = c.req.header("x-bb-cache") === "1" && !body.stream;
  const targetLang = c.req.header("x-bb-target-lang") ?? "";
  let bbCacheKey: string | null = null;
  if (cacheOptIn) {
    bbCacheKey = await cacheKey(model, targetLang, body.messages ?? []);
    const cached = await cacheGet(c.env, bbCacheKey);
    if (cached) {
      // Hit. Charge nothing; record the event so we can measure hit rate.
      c.executionCtx.waitUntil(
        logUsage(sql, {
          apiKeyId: key.id,
          model,
          usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
          upstreamCostMicros: 0,
          creditsCharged: 0,
          cacheHit: true,
        }),
      );
      return new Response(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-BB-Cache": "HIT",
        },
      });
    }
  }

  // Forward to OpenRouter. We keep their streaming behavior intact.
  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": c.env.PUBLIC_BASE_URL,
      "X-Title": "BorderBrowser",
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }

  if (body.stream) {
    // Wrap the stream so we can extract the final usage chunk and deduct
    // credits after the client finishes reading.
    const [forClient, forUs] = upstream.body!.tee();
    c.executionCtx.waitUntil(
      meterStream(forUs, model, c.env, key.id, parseInt(c.env.MARGIN_BPS, 10)),
    );
    return new Response(forClient, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  // Non-streaming: inspect JSON body, deduct, then forward.
  const json = (await upstream.json()) as {
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const usage = readUsage(json);
  const upstreamMicros = upstreamCostMicros(model, usage);
  const charge = withMargin(upstreamMicros, parseInt(c.env.MARGIN_BPS, 10));
  const responseBody = JSON.stringify(json);

  c.executionCtx.waitUntil(
    (async () => {
      await deductCredits(sql, { apiKeyId: key.id, creditsToDeduct: charge });
      await logUsage(sql, {
        apiKeyId: key.id,
        model,
        usage,
        upstreamCostMicros: upstreamMicros,
        creditsCharged: charge,
      });
      if (bbCacheKey) {
        await cachePut(c.env, bbCacheKey, responseBody);
      }
    })(),
  );

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...(bbCacheKey ? { "X-BB-Cache": "MISS" } : {}),
    },
  });
});

proxy.get("/v1/credits", async (c) => {
  const auth = c.req.header("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer || !isWellFormed(bearer)) {
    return jsonError(c, 401, "missing_authorization", "Set Authorization: Bearer …");
  }
  const sql = db(c.env.DATABASE_URL);
  const key = await findKeyByHash(sql, await hashKey(bearer));
  if (!key) return jsonError(c, 401, "key_not_found", "Unknown API key.");
  return c.json({
    credits_remaining_micros: key.credits_remaining,
    credits_remaining_usd: key.credits_remaining / 1_000_000,
    total_purchased_micros: key.total_credits_purchased,
    revoked: key.revoked,
  });
});

function readUsage(json: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}): Usage {
  const u = json.usage;
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    cachedInputTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

async function meterStream(
  body: ReadableStream<Uint8Array>,
  model: string,
  env: Env,
  apiKeyId: number,
  marginBps: number,
): Promise<void> {
  // OpenRouter streams SSE; the final chunk before [DONE] carries usage when
  // `stream_options: { include_usage: true }` is set. We scan for it.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let usage: Usage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload) as { usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
          if (obj.usage) {
            usage = {
              inputTokens: obj.usage.prompt_tokens ?? 0,
              outputTokens: obj.usage.completion_tokens ?? 0,
              cachedInputTokens: obj.usage.prompt_tokens_details?.cached_tokens ?? 0,
            };
          }
        } catch {
          // not JSON; ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!usage) return; // no usage emitted — don't charge
  const sql = db(env.DATABASE_URL);
  const upstreamMicros = upstreamCostMicros(model, usage);
  const charge = withMargin(upstreamMicros, marginBps);
  await deductCredits(sql, { apiKeyId, creditsToDeduct: charge });
  await logUsage(sql, {
    apiKeyId,
    model,
    usage,
    upstreamCostMicros: upstreamMicros,
    creditsCharged: charge,
  });
}

function jsonError(
  c: { json: (body: object, status: number) => Response },
  status: number,
  code: string,
  message: string,
): Response {
  return c.json(
    { error: { code, message, type: "borderbrowser_error" } },
    status,
  );
}
