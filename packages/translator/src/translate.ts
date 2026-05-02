import OpenAI from "openai";
import { z } from "zod";
import { localizeText } from "./localize.ts";
import type { TranslateOptions, TranslationUnit } from "./types.ts";

export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

const ResponseSchema = z.object({
  translations: z.array(
    z.object({
      id: z.number(),
      text: z.string(),
    }),
  ),
});

export type BatchUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type TranslateUnitsResult = {
  translated: Map<number, string>;
  stats: { batches: number } & BatchUsage;
};

export async function translateUnits(
  units: TranslationUnit[],
  options: TranslateOptions,
): Promise<TranslateUnitsResult> {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set (pass options.apiKey or set the env var)");
  }

  const model = options.model ?? DEFAULT_MODEL;
  const batchSize = options.batchSize ?? 40;
  const concurrency = options.concurrency ?? 4;

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
    defaultHeaders: {
      ...(options.siteUrl ? { "HTTP-Referer": options.siteUrl } : {}),
      ...(options.siteName ? { "X-Title": options.siteName } : {}),
    },
  });

  const batches: TranslationUnit[][] = [];
  for (let i = 0; i < units.length; i += batchSize) {
    batches.push(units.slice(i, i + batchSize));
  }

  const translated = new Map<number, string>();
  const stats = { batches: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };

  let nextBatchIdx = 0;
  const workerCount = Math.min(concurrency, batches.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = nextBatchIdx++;
      if (idx >= batches.length) return;
      const batch = batches[idx]!;
      const r = await translateBatchWithRetry(client, model, batch, options.targetLang);
      for (const t of r.translations) translated.set(t.id, t.text);
      stats.batches++;
      stats.inputTokens += r.usage.inputTokens;
      stats.outputTokens += r.usage.outputTokens;
      stats.cachedInputTokens += r.usage.cachedInputTokens;
    }
  });
  await Promise.all(workers);

  // Post-translation localization pass: runs on translated text BEFORE the
  // caller decodes placeholders. Skipped entirely when no localize options
  // were provided (per spec).
  if (options.localize !== undefined) {
    for (const [id, text] of translated) {
      translated.set(id, localizeText(text, options.targetLang, options.localize));
    }
  }

  return { translated, stats };
}

async function translateBatchWithRetry(
  client: OpenAI,
  model: string,
  batch: TranslationUnit[],
  targetLang: string,
): Promise<{ translations: { id: number; text: string }[]; usage: BatchUsage }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await translateBatch(client, model, batch, targetLang);
    } catch (err) {
      lastError = err;
      // Backoff: 0.5s, 2s, 8s on retry
      const backoffMs = 500 * Math.pow(4, attempt);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  // Final fallback: don't fail the whole page for one bad batch — leave those
  // units untranslated and let the rest of the page through. Caller logs.
  console.warn(
    `[translator] batch of ${batch.length} units failed after 3 attempts; skipping. ` +
      `last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
  return {
    translations: [],
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  };
}

async function translateBatch(
  client: OpenAI,
  model: string,
  batch: TranslationUnit[],
  targetLang: string,
): Promise<{ translations: { id: number; text: string }[]; usage: BatchUsage }> {
  const inputPayload = batch.map((u) => ({ id: u.id, kind: u.kind, text: u.text }));

  // The system content uses the cache_control extension supported by OpenRouter
  // for Anthropic models. Cast as any since the OpenAI SDK types don't include it.
  const messages = [
    {
      role: "system" as const,
      content: [
        {
          type: "text",
          text: buildSystemPrompt(targetLang),
          cache_control: { type: "ephemeral" },
        },
      ],
    },
    {
      role: "user" as const,
      content: `Translate these ${batch.length} snippet(s):\n${JSON.stringify(inputPayload)}`,
    },
  ];

  const response = await client.chat.completions.create({
    model,
    messages: messages as never,
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const translations = parseTranslations(content);

  const usage = response.usage as
    | { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
    | undefined;

  return {
    translations,
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}

function parseTranslations(content: string): { id: number; text: string }[] {
  const stripped = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return ResponseSchema.parse(JSON.parse(stripped)).translations;
  } catch (firstErr) {
    // Fallback: the LLM occasionally emits almost-JSON (unescaped quote,
    // trailing comma, stray newline). Salvage what we can with a regex that
    // matches each {"id":N,"text":"…"} entry directly.
    const out: { id: number; text: string }[] = [];
    const re = /"id"\s*:\s*(\d+)\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      try {
        out.push({ id: Number(m[1]), text: JSON.parse(`"${m[2]}"`) as string });
      } catch {
        // skip individually-broken entries
      }
    }
    if (out.length > 0) return out;
    throw firstErr;
  }
}

function buildSystemPrompt(targetLang: string): string {
  return `You are a professional translator. Translate web page content into ${targetLang}.

You will receive a JSON array of text snippets, each with:
- "id": a numeric snippet id
- "kind": the HTML element type ("h1", "p", "li", "title", etc.) — use it as a hint for register and length
- "text": the source text, possibly containing placeholder markers

PLACEHOLDER RULES (critical):
- Markers like [1], [/1], [3/] represent inline HTML tags (links, emphasis, images, etc.) that surrounded text in the source.
- Preserve EVERY placeholder EXACTLY: same digits, same brackets, same opening/closing/self-closing form.
- [N] always pairs with a matching [/N] — move them together so the markup wraps the corresponding translated phrase.
- [N/] is self-closing (image, line break, etc.) and stands alone — place it where it makes sense in the translation.
- DO NOT invent new placeholders, change numbers, drop placeholders, or translate the brackets/numbers themselves.

TRANSLATION RULES:
- Translate naturally and idiomatically. Match the register of the source (formal news, casual blog, marketing copy, technical docs).
- Preserve URLs, code, numbers, dates, units, currencies, and proper nouns. Use a target-language form for proper nouns only when it is well established (e.g., "London" → "Lontoo" in Finnish).
- If a snippet is already in ${targetLang}, return it unchanged.
- A snippet that is only whitespace or only placeholders should be returned unchanged.
- Do NOT add explanations, footnotes, or any commentary.

OUTPUT:
Return a single JSON object:
{"translations":[{"id":<id>,"text":<translated text with placeholders>}, ...]}
Same order as the input. No prose, no markdown code fences. The response body must be valid JSON only.

Example:
Input:
[{"id":1,"kind":"h1","text":"Bonjour le monde"},
 {"id":2,"kind":"p","text":"Lisez [1]plus[/1] ici."}]

Output:
{"translations":[{"id":1,"text":"Hello world"},{"id":2,"text":"Read [1]more[/1] here."}]}`;
}
