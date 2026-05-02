import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildSystemPrompt,
  formatGlossaryForPrompt,
  parseGlossaryText,
  formatGlossaryText,
  translateUnits,
} from "../src/index.ts";
import type { Glossary } from "../src/index.ts";
import type { TranslationUnit } from "../src/types.ts";

describe("formatGlossaryForPrompt", () => {
  it("returns empty string for undefined glossary", () => {
    assert.equal(formatGlossaryForPrompt(undefined), "");
  });

  it("returns empty string for empty glossary", () => {
    assert.equal(formatGlossaryForPrompt({}), "");
  });

  it("ignores entries with empty term or translation", () => {
    assert.equal(formatGlossaryForPrompt({ "": "x", y: "" }), "");
  });

  it("renders entries as a labelled block", () => {
    const out = formatGlossaryForPrompt({
      Helsinki: "Helsinki, not Helsingfors",
      Turku: "Turku, not Åbo",
    });
    assert.match(out, /GLOSSARY \(always use these exact translations\):/);
    assert.match(out, /"Helsinki" → "Helsinki, not Helsingfors"/);
    assert.match(out, /"Turku" → "Turku, not Åbo"/);
  });
});

describe("parseGlossaryText / formatGlossaryText", () => {
  it("parses one term=translation per line, trimming whitespace", () => {
    const g = parseGlossaryText(
      `  Helsinki = Helsinki, not Helsingfors\nTurku=Turku, not Åbo\n`,
    );
    assert.deepEqual(g, {
      Helsinki: "Helsinki, not Helsingfors",
      Turku: "Turku, not Åbo",
    });
  });

  it("ignores blank, comment, and malformed lines", () => {
    const g = parseGlossaryText(
      `\n# a comment\nHelsinki=Helsinki\nno-equals-here\n=missingterm\nterm=\n`,
    );
    assert.deepEqual(g, { Helsinki: "Helsinki" });
  });

  it("later entries override earlier ones for the same term", () => {
    const g = parseGlossaryText(`X=one\nX=two\n`);
    assert.deepEqual(g, { X: "two" });
  });

  it("round-trips parse → format → parse", () => {
    const original: Glossary = { Helsinki: "Helsinki", Turku: "Turku, not Åbo" };
    const text = formatGlossaryText(original);
    assert.deepEqual(parseGlossaryText(text), original);
  });

  it("formats empty glossary as empty string", () => {
    assert.equal(formatGlossaryText(undefined), "");
    assert.equal(formatGlossaryText({}), "");
  });
});

describe("buildSystemPrompt", () => {
  it("contains the target language", () => {
    const p = buildSystemPrompt("Finnish");
    assert.match(p, /Translate web page content into Finnish\./);
  });

  it("omits the GLOSSARY block when no glossary is given", () => {
    assert.doesNotMatch(buildSystemPrompt("English"), /GLOSSARY/);
    assert.doesNotMatch(buildSystemPrompt("English", {}), /GLOSSARY/);
  });

  it("includes glossary entries when provided (assertion a)", () => {
    const glossary: Glossary = {
      Helsinki: "Helsinki, not Helsingfors",
      Turku: "Turku, not Åbo",
    };
    const prompt = buildSystemPrompt("English", glossary);
    assert.match(prompt, /GLOSSARY/);
    assert.match(prompt, /"Helsinki" → "Helsinki, not Helsingfors"/);
    assert.match(prompt, /"Turku" → "Turku, not Åbo"/);
  });
});

/**
 * Spin up a fake OpenRouter-compatible server that echoes the user-message
 * payload back as the translation list. We use it to verify the end-to-end
 * plumbing: the system-prompt block is built from `options.glossary`, and
 * encoded text containing glossary terms round-trips unchanged through the
 * pipeline.
 */
type EchoCapture = {
  systemText: string;
};

async function withEchoServer<T>(
  fn: (baseUrl: string, capture: EchoCapture) => Promise<T>,
): Promise<T> {
  const capture: EchoCapture = { systemText: "" };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const parsed = JSON.parse(body) as {
        messages: Array<{
          role: string;
          content: string | Array<{ type: string; text?: string }>;
        }>;
      };

      const sys = parsed.messages.find((m) => m.role === "system");
      if (sys && Array.isArray(sys.content)) {
        capture.systemText = sys.content
          .map((p) => (p.type === "text" ? p.text ?? "" : ""))
          .join("");
      } else if (sys && typeof sys.content === "string") {
        capture.systemText = sys.content;
      }

      const user = parsed.messages.find((m) => m.role === "user");
      const userText = typeof user?.content === "string" ? user.content : "";
      // The user message is "Translate these N snippet(s):\n[…json…]" —
      // pull the JSON tail out and echo each {id, text} back unchanged.
      const jsonStart = userText.indexOf("[");
      const jsonText = jsonStart >= 0 ? userText.slice(jsonStart) : "[]";
      const inputs = JSON.parse(jsonText) as Array<{ id: number; text: string }>;
      const translations = inputs.map((u) => ({ id: u.id, text: u.text }));

      const responseBody = {
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({ translations }),
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
        },
      };

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(responseBody));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    return await fn(baseUrl, capture);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("translateUnits with glossary (mock LLM)", () => {
  it("(a) injects glossary entries into the system prompt", async () => {
    await withEchoServer(async (baseUrl, capture) => {
      const units: TranslationUnit[] = [
        { id: 1, kind: "p", text: "Welcome to Helsinki", placeholders: new Map() },
      ];
      await translateUnits(units, {
        targetLang: "Finnish",
        apiKey: "test-key",
        baseUrl,
        glossary: { Helsinki: "Helsinki, not Helsingfors" },
      });
      assert.match(capture.systemText, /GLOSSARY/);
      assert.match(
        capture.systemText,
        /"Helsinki" → "Helsinki, not Helsingfors"/,
      );
    });
  });

  it("(b) round-trip preserves glossary terms in encoded output", async () => {
    await withEchoServer(async (baseUrl) => {
      const units: TranslationUnit[] = [
        {
          id: 1,
          kind: "p",
          text: "Visit [1]Helsinki[/1] today",
          placeholders: new Map([
            [1, { kind: "inline", tag: "a", attrs: { href: "/hki" } }],
          ]),
        },
        {
          id: 2,
          kind: "h1",
          text: "Helsinki and Turku",
          placeholders: new Map(),
        },
      ];
      const { translated } = await translateUnits(units, {
        targetLang: "Finnish",
        apiKey: "test-key",
        baseUrl,
        glossary: {
          Helsinki: "Helsinki, not Helsingfors",
          Turku: "Turku, not Åbo",
        },
      });
      // Echo server returns input verbatim → glossary terms (and placeholders)
      // survive intact.
      assert.equal(translated.get(1), "Visit [1]Helsinki[/1] today");
      assert.equal(translated.get(2), "Helsinki and Turku");
    });
  });
});
