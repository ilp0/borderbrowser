import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { isRtl } from "../src/rtl.ts";
import { applyTranslation, applyTranslationsBatch } from "../src/browser/apply.ts";
import type { PlaceholderInfo } from "../src/types.ts";

/**
 * Unit tests for the RTL detection helper and the side-effect it has on
 * `applyTranslation`. JSDOM gives us a real DOM so we can verify that the
 * `dir` attribute is actually set on the element after a swap — the same
 * style as `extract-live.test.ts`.
 */

describe("isRtl", () => {
  it("returns true for RTL primary subtags", () => {
    assert.equal(isRtl("ar"), true);
    assert.equal(isRtl("he"), true);
    assert.equal(isRtl("fa"), true);
    assert.equal(isRtl("ur"), true);
    assert.equal(isRtl("ps"), true);
    assert.equal(isRtl("yi"), true);
  });

  it("returns true for BCP-47 tags with region/script subtags", () => {
    assert.equal(isRtl("ar-SA"), true);
    assert.equal(isRtl("ar_EG"), true);
    assert.equal(isRtl("he-IL"), true);
    assert.equal(isRtl("fa-IR"), true);
    assert.equal(isRtl("ur-PK"), true);
  });

  it("is case-insensitive on ASCII codes", () => {
    assert.equal(isRtl("AR"), true);
    assert.equal(isRtl("He"), true);
    assert.equal(isRtl("Fa-IR"), true);
  });

  it("returns true for legacy Hebrew/Yiddish codes", () => {
    assert.equal(isRtl("iw"), true); // legacy Hebrew
    assert.equal(isRtl("ji"), true); // legacy Yiddish
  });

  it("returns true for English language names", () => {
    assert.equal(isRtl("Arabic"), true);
    assert.equal(isRtl("hebrew"), true);
    assert.equal(isRtl("Persian"), true);
    assert.equal(isRtl("Farsi"), true);
    assert.equal(isRtl("Urdu"), true);
  });

  it("returns true for native-script names", () => {
    assert.equal(isRtl("العربية"), true);
    assert.equal(isRtl("עברית"), true);
    assert.equal(isRtl("فارسی"), true);
    assert.equal(isRtl("اردو"), true);
  });

  it("returns false for LTR languages", () => {
    assert.equal(isRtl("en"), false);
    assert.equal(isRtl("en-US"), false);
    assert.equal(isRtl("fi"), false);
    assert.equal(isRtl("fr"), false);
    assert.equal(isRtl("de"), false);
    assert.equal(isRtl("es"), false);
    assert.equal(isRtl("ja"), false);
    assert.equal(isRtl("zh"), false);
    assert.equal(isRtl("English"), false);
    assert.equal(isRtl("Finnish"), false);
  });

  it("returns false for empty / null / whitespace input", () => {
    assert.equal(isRtl(""), false);
    assert.equal(isRtl("   "), false);
    assert.equal(isRtl(undefined), false);
    assert.equal(isRtl(null), false);
  });

  it("returns false for unknown / nonsense tags", () => {
    assert.equal(isRtl("xx"), false);
    assert.equal(isRtl("not-a-language"), false);
  });
});

describe("applyTranslation (RTL dir attribute)", () => {
  function makeElement(initialHtml: string): Element {
    const j = new JSDOM(`<!DOCTYPE html><html><body><p>${initialHtml}</p></body></html>`);
    return j.window.document.querySelector("p")!;
  }

  it("sets dir=rtl when the target language is Arabic", () => {
    const el = makeElement("Hello");
    applyTranslation(el, "مرحبا", new Map<number, PlaceholderInfo>(), {
      targetLang: "ar",
    });
    assert.equal(el.getAttribute("dir"), "rtl");
    assert.equal(el.innerHTML, "مرحبا");
  });

  it("sets dir=rtl when the target language is Hebrew with a region tag", () => {
    const el = makeElement("Hello");
    applyTranslation(el, "שלום", new Map<number, PlaceholderInfo>(), {
      targetLang: "he-IL",
    });
    assert.equal(el.getAttribute("dir"), "rtl");
  });

  it("sets dir=rtl for the free-form name 'Persian'", () => {
    const el = makeElement("Hello");
    applyTranslation(el, "سلام", new Map<number, PlaceholderInfo>(), {
      targetLang: "Persian",
    });
    assert.equal(el.getAttribute("dir"), "rtl");
  });

  it("does NOT set dir for LTR target languages", () => {
    const el = makeElement("Hello");
    applyTranslation(el, "Bonjour", new Map<number, PlaceholderInfo>(), {
      targetLang: "fr",
    });
    assert.equal(el.getAttribute("dir"), null);
  });

  it("does NOT set dir when no targetLang option is supplied", () => {
    const el = makeElement("Hello");
    applyTranslation(el, "Hej", new Map<number, PlaceholderInfo>());
    assert.equal(el.getAttribute("dir"), null);
  });

  it("preserves placeholder content (URLs, code) inside an RTL block", () => {
    const el = makeElement("Visit <a href=\"/x\">site</a>");
    const placeholders = new Map<number, PlaceholderInfo>([
      [1, { kind: "inline", tag: "a", attrs: { href: "/x" } }],
    ]);
    applyTranslation(el, "زر [1]الموقع[/1]", placeholders, { targetLang: "ar" });
    assert.equal(el.getAttribute("dir"), "rtl");
    // href stays verbatim; URLs/code/numbers are inside placeholders so they're never translated.
    assert.equal(el.innerHTML, "زر <a href=\"/x\">الموقع</a>");
  });

  it("applyTranslationsBatch applies dir=rtl to every entry", () => {
    const j = new JSDOM(
      `<!DOCTYPE html><html><body><h1>A</h1><p>B</p></body></html>`,
    );
    const h1 = j.window.document.querySelector("h1")!;
    const p = j.window.document.querySelector("p")!;
    applyTranslationsBatch(
      [
        { element: h1, translatedText: "أ", placeholders: new Map() },
        { element: p, translatedText: "ب", placeholders: new Map() },
      ],
      { targetLang: "ar" },
    );
    assert.equal(h1.getAttribute("dir"), "rtl");
    assert.equal(p.getAttribute("dir"), "rtl");
  });

  it("applyTranslationsBatch leaves dir alone for LTR targets", () => {
    const j = new JSDOM(
      `<!DOCTYPE html><html><body><h1>A</h1><p>B</p></body></html>`,
    );
    const h1 = j.window.document.querySelector("h1")!;
    const p = j.window.document.querySelector("p")!;
    applyTranslationsBatch(
      [
        { element: h1, translatedText: "Eins", placeholders: new Map() },
        { element: p, translatedText: "Zwei", placeholders: new Map() },
      ],
      { targetLang: "de" },
    );
    assert.equal(h1.getAttribute("dir"), null);
    assert.equal(p.getAttribute("dir"), null);
  });
});
