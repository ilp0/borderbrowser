import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { translateHtml } from "../src/index.ts";

/**
 * Tests for document-level translation coherence (overlapping context windows).
 *
 * Strategy: spin up a tiny local HTTP server that mimics the OpenRouter
 * `/v1/chat/completions` endpoint. The server captures each request body so
 * the test can inspect what messages the translator sent for each batch and
 * returns a deterministic, batch-distinct translation (e.g. "TRANSLATED-1-id3")
 * so we can prove that batch N's prompt contains a prefix of batch (N-1)'s
 * translated output.
 */

type Captured = {
  /** Sequence number assigned in receive order (1-based). */
  seq: number;
  body: {
    messages: { role: string; content: unknown }[];
    [k: string]: unknown;
  };
};

type MockServer = {
  url: string;
  captured: Captured[];
  close: () => Promise<void>;
};

/**
 * Start a fake OpenRouter server on an ephemeral port.
 *
 * The translation function takes a unit and the receive sequence and returns
 * a translated string — distinct per batch so we can detect it in the next
 * batch's prompt.
 */
async function startMockServer(
  translateFn: (unit: { id: number; kind: string; text: string }, seq: number) => string,
): Promise<MockServer> {
  const captured: Captured[] = [];
  let seqCounter = 0;

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(raw);

    const seq = ++seqCounter;
    captured.push({ seq, body });

    // Find the "Translate these N snippet(s)" message and parse the input
    // payload so we can echo back a deterministic translation per id.
    const messages = body.messages as { role: string; content: unknown }[];
    const last = messages[messages.length - 1]!;
    const lastContent = typeof last.content === "string" ? last.content : "";
    const m = lastContent.match(/Translate these \d+ snippet\(s\):\n(\[.*\])$/s);
    const inputs: { id: number; kind: string; text: string }[] = m
      ? JSON.parse(m[1]!)
      : [];

    const translations = inputs.map((u) => ({ id: u.id, text: translateFn(u, seq) }));

    const responseBody = {
      id: `chatcmpl-test-${seq}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "test-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({ translations }),
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10 + inputs.length,
        completion_tokens: 5 + inputs.length,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    };

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(responseBody));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}/v1`;

  return {
    url,
    captured,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Build an HTML doc with N <p> elements so it splits into the desired batches. */
function htmlWithParagraphs(count: number): string {
  const ps = Array.from({ length: count }, (_, i) => `<p>Source paragraph number ${i + 1}.</p>`).join(
    "",
  );
  return `<!DOCTYPE html><html><body>${ps}</body></html>`;
}

/**
 * Concatenate every text segment in a captured request's messages so we can
 * substring-search for prior context regardless of which message it was
 * placed in (system / "previous context" user / batch user).
 */
function flattenMessages(messages: { role: string; content: unknown }[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c && typeof c === "object" && "text" in c && typeof (c as { text: unknown }).text === "string") {
          parts.push((c as { text: string }).text);
        }
      }
    }
  }
  return parts.join("\n---\n");
}

describe("translator document-level coherence", () => {
  describe("multi-batch page", () => {
    let mock: MockServer;

    before(async () => {
      // Translation: "TR{seq}|id={id}|<source-text>". Distinct per batch.
      mock = await startMockServer(
        (u, seq) => `TR${seq}|id=${u.id}|${u.text}`,
      );
    });

    after(async () => {
      await mock.close();
    });

    it("injects a prefix of batch (n-1)'s translated output into batches 2 and 3", async () => {
      // 6 paragraphs, batchSize 2 → 3 batches.
      const html = htmlWithParagraphs(6);
      const result = await translateHtml(html, {
        targetLang: "Finnish",
        apiKey: "test-key",
        baseUrl: mock.url,
        batchSize: 2,
      });

      // Sanity: 3 calls, in order (sequential because overlap is on).
      assert.equal(mock.captured.length, 3, "expected exactly 3 batch calls");
      assert.equal(result.stats.batches, 3);

      // Batch 1's translation: TR1|id=1|... and TR1|id=2|...
      // Take a stable, distinctive prefix that can only have come from batch 1.
      const batch1Prefix = "TR1|id=";
      const batch2Text = flattenMessages(mock.captured[1]!.body.messages);
      assert.ok(
        batch2Text.includes(batch1Prefix),
        `batch 2 prompt should contain a prefix of batch 1's translated output (looking for "${batch1Prefix}")`,
      );

      // Batch 2's translation prefix should appear in batch 3's prompt.
      const batch2Prefix = "TR2|id=";
      const batch3Text = flattenMessages(mock.captured[2]!.body.messages);
      assert.ok(
        batch3Text.includes(batch2Prefix),
        `batch 3 prompt should contain a prefix of batch 2's translated output (looking for "${batch2Prefix}")`,
      );

      // Batch 1 itself must NOT carry any prior-batch context.
      const batch1Text = flattenMessages(mock.captured[0]!.body.messages);
      assert.ok(
        !batch1Text.includes("Previous translated context"),
        "batch 1 should not have any 'Previous translated context' message",
      );

      // Batch 2 and 3 should have the prior-context user message.
      assert.ok(
        batch2Text.includes("Previous translated context"),
        "batch 2 should contain a 'Previous translated context' user message",
      );
      assert.ok(
        batch3Text.includes("Previous translated context"),
        "batch 3 should contain a 'Previous translated context' user message",
      );
    });

    it("totals contextOverlapChars across batches in stats", async () => {
      const html = htmlWithParagraphs(6);
      const result = await translateHtml(html, {
        targetLang: "Finnish",
        apiKey: "test-key",
        baseUrl: mock.url,
        batchSize: 2,
      });

      // Batches 2 and 3 each consume some prior context. Batches each have
      // 2 short translations whose joined length is well under the default
      // 1000-char window, so the consumed amount equals the joined length.
      // The exact value depends on the mock's translation strings — assert
      // that it's >0 and equals what we'd expect by reconstructing it.
      assert.ok(
        result.stats.contextOverlapChars > 0,
        `expected stats.contextOverlapChars > 0, got ${result.stats.contextOverlapChars}`,
      );

      // Reconstruct expected: for batch 2, prevContext is the joined
      // batch-1 translations; same for batch 3 with batch-2 translations.
      // Mock translation: `TR{seq}|id={id}|Source paragraph number {i+1}.`
      const expectedBatch1Joined = ["TR1|id=1|Source paragraph number 1.", "TR1|id=2|Source paragraph number 2."].join(
        "\n",
      );
      const expectedBatch2Joined = ["TR2|id=3|Source paragraph number 3.", "TR2|id=4|Source paragraph number 4."].join(
        "\n",
      );
      const expectedTotal = expectedBatch1Joined.length + expectedBatch2Joined.length;
      assert.equal(
        result.stats.contextOverlapChars,
        expectedTotal,
        `stats.contextOverlapChars should equal the sum of injected prior-context lengths`,
      );
    });
  });

  describe("short page (one batch)", () => {
    let mock: MockServer;

    before(async () => {
      mock = await startMockServer((u, seq) => `TR${seq}|id=${u.id}|${u.text}`);
    });

    after(async () => {
      await mock.close();
    });

    it("does not inject any prior-batch context", async () => {
      // 2 paragraphs, batchSize 5 → 1 batch.
      const html = htmlWithParagraphs(2);
      const result = await translateHtml(html, {
        targetLang: "Finnish",
        apiKey: "test-key",
        baseUrl: mock.url,
        batchSize: 5,
      });

      assert.equal(mock.captured.length, 1, "expected exactly 1 batch call");
      assert.equal(result.stats.batches, 1);
      assert.equal(
        result.stats.contextOverlapChars,
        0,
        "single-batch page should consume zero overlap chars",
      );

      const batch1Text = flattenMessages(mock.captured[0]!.body.messages);
      assert.ok(
        !batch1Text.includes("Previous translated context"),
        "single-batch page should not have a 'Previous translated context' message",
      );
    });
  });

  describe("contextOverlapChars: 0 (disabled)", () => {
    let mock: MockServer;

    before(async () => {
      mock = await startMockServer((u, seq) => `TR${seq}|id=${u.id}|${u.text}`);
    });

    after(async () => {
      await mock.close();
    });

    it("never injects context and reports 0 in stats", async () => {
      const html = htmlWithParagraphs(6);
      const result = await translateHtml(html, {
        targetLang: "Finnish",
        apiKey: "test-key",
        baseUrl: mock.url,
        batchSize: 2,
        contextOverlapChars: 0,
      });

      assert.equal(mock.captured.length, 3);
      assert.equal(result.stats.contextOverlapChars, 0);

      for (let i = 0; i < mock.captured.length; i++) {
        const text = flattenMessages(mock.captured[i]!.body.messages);
        assert.ok(
          !text.includes("Previous translated context"),
          `batch ${i + 1} should not contain prior context when overlap is disabled`,
        );
      }
    });
  });

  describe("custom contextOverlapChars limits the injected window", () => {
    let mock: MockServer;

    before(async () => {
      // Make each translation deliberately long so the overlap actually
      // exceeds the small custom window.
      mock = await startMockServer(
        (u, seq) => `TR${seq}|id=${u.id}|` + "x".repeat(50),
      );
    });

    after(async () => {
      await mock.close();
    });

    it("only carries forward the last N chars of prior translations", async () => {
      const html = htmlWithParagraphs(4); // 2 batches of 2
      const result = await translateHtml(html, {
        targetLang: "Finnish",
        apiKey: "test-key",
        baseUrl: mock.url,
        batchSize: 2,
        contextOverlapChars: 20,
      });

      assert.equal(mock.captured.length, 2);
      // Batch 2 consumed at most 20 chars of overlap.
      assert.equal(result.stats.contextOverlapChars, 20);

      // Find the prior-context user message directly so we don't have to
      // dance around message-boundary delimiters that flattenMessages adds.
      const priorCtxMsg = mock.captured[1]!.body.messages.find(
        (m) =>
          typeof m.content === "string" &&
          (m.content as string).startsWith("Previous translated context"),
      );
      assert.ok(priorCtxMsg, "expected a 'Previous translated context' user message in batch 2");
      const priorCtxBody = priorCtxMsg.content as string;
      // Strip the leading label + newline so what remains is exactly the
      // injected context.
      const ctx = priorCtxBody.replace(/^Previous translated context[^\n]*\n/, "");
      assert.equal(ctx.length, 20, `prior context window should be exactly 20 chars, got ${ctx.length}`);
      assert.match(ctx, /^x+$/, `prior context should be the trailing x's of batch 1's translation`);
    });
  });
});
