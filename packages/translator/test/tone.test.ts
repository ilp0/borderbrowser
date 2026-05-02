import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/translate.ts";

const FORMAL_SENTENCE =
  "Use a formal register: avoid contractions, prefer precise nouns, and use respectful, polished phrasing.";
const CASUAL_SENTENCE =
  "Use a casual register: prefer contractions, conversational phrasing, and approachable everyday vocabulary.";

describe("buildSystemPrompt — tone preference", () => {
  it("default (no tone) yields the neutral prompt with no tone sentence", () => {
    const prompt = buildSystemPrompt("English");
    assert.ok(prompt.startsWith("You are a professional translator."));
    assert.ok(
      !prompt.includes(FORMAL_SENTENCE),
      "neutral default must not include the formal sentence",
    );
    assert.ok(
      !prompt.includes(CASUAL_SENTENCE),
      "neutral default must not include the casual sentence",
    );
  });

  it("explicit \"neutral\" matches the default (no tone sentence appended)", () => {
    const explicitNeutral = buildSystemPrompt("English", "neutral");
    const defaultPrompt = buildSystemPrompt("English");
    assert.equal(explicitNeutral, defaultPrompt);
  });

  it("\"formal\" appends the formal-register sentence", () => {
    const prompt = buildSystemPrompt("English", "formal");
    assert.ok(
      prompt.includes(FORMAL_SENTENCE),
      "formal prompt must include the formal sentence",
    );
    assert.ok(
      !prompt.includes(CASUAL_SENTENCE),
      "formal prompt must NOT include the casual sentence",
    );
    assert.ok(
      prompt.endsWith(FORMAL_SENTENCE),
      "the tone sentence is appended at the end of the prompt",
    );
  });

  it("\"casual\" appends the casual-register sentence", () => {
    const prompt = buildSystemPrompt("English", "casual");
    assert.ok(
      prompt.includes(CASUAL_SENTENCE),
      "casual prompt must include the casual sentence",
    );
    assert.ok(
      !prompt.includes(FORMAL_SENTENCE),
      "casual prompt must NOT include the formal sentence",
    );
    assert.ok(
      prompt.endsWith(CASUAL_SENTENCE),
      "the tone sentence is appended at the end of the prompt",
    );
  });

  it("targetLang appears in the prompt body across tones", () => {
    for (const tone of ["formal", "neutral", "casual"] as const) {
      const prompt = buildSystemPrompt("Suomi", tone);
      assert.ok(
        prompt.includes("Suomi"),
        `targetLang must appear regardless of tone (${tone})`,
      );
    }
  });

  it("each tone yields a distinct system prompt", () => {
    const formal = buildSystemPrompt("English", "formal");
    const neutral = buildSystemPrompt("English", "neutral");
    const casual = buildSystemPrompt("English", "casual");
    assert.notEqual(formal, neutral);
    assert.notEqual(neutral, casual);
    assert.notEqual(formal, casual);
  });
});
