import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  applyTranslation,
  applyTranslationsBatch,
} from "../src/browser/apply.ts";
import type { PlaceholderInfo } from "../src/types.ts";

/**
 * Tests for the live-DOM apply path.
 *
 * The accessibility polish (Unit 7) extends `applyTranslation` to set
 * `lang="<targetLang>"` on every translated element so screen readers
 * pronounce the swapped-in text in the right language.
 */
function dom(html: string): { window: typeof globalThis & Window; el: Element } {
  const j = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  // @ts-expect-error: globalThis is fine in Node test runtime
  globalThis.Node = j.window.Node;
  return {
    window: j.window as unknown as typeof globalThis & Window,
    el: j.window.document.body.firstElementChild as Element,
  };
}

describe("applyTranslation", () => {
  it("replaces innerHTML and sets the lang attribute when targetLang is given", () => {
    const { el } = dom("<p>Hello world</p>");
    const placeholders = new Map<number, PlaceholderInfo>();
    applyTranslation(el, "Bonjour le monde", placeholders, "fr");
    assert.equal(el.innerHTML, "Bonjour le monde");
    assert.equal(el.getAttribute("lang"), "fr");
  });

  it("leaves the lang attribute alone when targetLang is omitted", () => {
    const { el } = dom('<p lang="en">Hello</p>');
    const placeholders = new Map<number, PlaceholderInfo>();
    applyTranslation(el, "Bonjour", placeholders);
    assert.equal(el.innerHTML, "Bonjour");
    // Pre-existing lang stays untouched.
    assert.equal(el.getAttribute("lang"), "en");
  });

  it("overwrites a stale lang attribute on the translated element", () => {
    const { el } = dom('<p lang="en">Hello</p>');
    const placeholders = new Map<number, PlaceholderInfo>();
    applyTranslation(el, "Hej", placeholders, "sv");
    assert.equal(el.getAttribute("lang"), "sv");
  });
});

describe("applyTranslationsBatch", () => {
  it("propagates targetLang to every element in the batch", () => {
    const { window } = dom('<div><p id="a">A</p><p id="b">B</p></div>');
    const a = window.document.getElementById("a")!;
    const b = window.document.getElementById("b")!;
    applyTranslationsBatch(
      [
        { element: a, translatedText: "Aa", placeholders: new Map() },
        { element: b, translatedText: "Bb", placeholders: new Map() },
      ],
      "fi",
    );
    assert.equal(a.getAttribute("lang"), "fi");
    assert.equal(b.getAttribute("lang"), "fi");
  });
});
