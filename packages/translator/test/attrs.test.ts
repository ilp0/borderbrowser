import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractAttrsFromDom } from "../src/browser/extract-attrs.ts";
import { applyAttrTranslationsBatch } from "../src/browser/apply-attrs.ts";

/**
 * Tests for the attribute & meta-tag translation path.
 *
 * Mirrors the structure of `extract-live.test.ts`: JSDOM gives us a real DOM,
 * we extract, optionally apply, and assert the live attribute values.
 */

function dom(html: string): { root: Element; window: typeof globalThis & Window } {
  const j = new JSDOM(`<!DOCTYPE html><html>${html}</html>`);
  // The translator's extract code uses Node.ELEMENT_NODE / Node.TEXT_NODE — make
  // them available on the global Node so the module's references resolve.
  // @ts-expect-error: globalThis is fine in Node test runtime
  globalThis.Node = j.window.Node;
  return {
    root: j.window.document.documentElement,
    window: j.window as unknown as typeof globalThis & Window,
  };
}

describe("extractAttrsFromDom", () => {
  it("returns no units when there are no translatable attrs", () => {
    const { root } = dom("<body><p>hello</p></body>");
    const { units } = extractAttrsFromDom(root);
    assert.deepEqual(units, []);
  });

  it("extracts alt, title, placeholder, aria-label, aria-description", () => {
    const { root } = dom(`
      <body>
        <img src="/x.png" alt="A photo">
        <a href="/x" title="Hover text">link</a>
        <input type="text" placeholder="Search">
        <button aria-label="Close dialog">x</button>
        <div aria-description="Form help">field</div>
      </body>
    `);
    const { units } = extractAttrsFromDom(root);
    const got = units.map((u) => ({ kind: u.kind, text: u.text }));
    assert.deepEqual(got, [
      { kind: "attr", text: "A photo" },
      { kind: "attr", text: "Hover text" },
      { kind: "attr", text: "Search" },
      { kind: "attr", text: "Close dialog" },
      { kind: "attr", text: "Form help" },
    ]);
  });

  it("extracts value on <input type=submit> and <input type=button>", () => {
    const { root } = dom(`
      <body>
        <input type="submit" value="Send">
        <input type="button" value="Cancel">
        <input type="text" value="don't translate">
      </body>
    `);
    const texts = extractAttrsFromDom(root).units.map((u) => u.text);
    assert.deepEqual(texts, ["Send", "Cancel"]);
  });

  it("extracts meta description, OpenGraph, and Twitter Card content", () => {
    const { root } = dom(`
      <head>
        <meta name="description" content="Page summary">
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Description">
        <meta name="twitter:title" content="Tweet Title">
        <meta name="twitter:description" content="Tweet Description">
        <meta name="generator" content="should-skip">
        <meta charset="utf-8">
      </head>
      <body><p>x</p></body>
    `);
    const texts = extractAttrsFromDom(root).units.map((u) => u.text);
    assert.deepEqual(texts, [
      "Page summary",
      "OG Title",
      "OG Description",
      "Tweet Title",
      "Tweet Description",
    ]);
  });

  it("ignores empty or whitespace-only attribute values", () => {
    const { root } = dom(`
      <body>
        <img alt="">
        <input type="submit" value="   ">
        <a title="real" href="/">x</a>
      </body>
    `);
    const texts = extractAttrsFromDom(root).units.map((u) => u.text);
    assert.deepEqual(texts, ["real"]);
  });

  it("does not walk into <script>, <style>, <noscript>, <template>", () => {
    const { root } = dom(`
      <body>
        <script><img alt="hidden"></script>
        <style>/* <img alt="hidden2"> */</style>
        <noscript><img alt="hidden3"></noscript>
        <template><img alt="hidden4"></template>
        <img alt="visible">
      </body>
    `);
    const texts = extractAttrsFromDom(root).units.map((u) => u.text);
    assert.deepEqual(texts, ["visible"]);
  });

  it("descends into <input> for placeholder even though text-walk skips it", () => {
    // <input> is in the text-extract SKIP set; but its placeholder still needs
    // translating — guard against accidentally inheriting that skip set here.
    const { root } = dom(`<body><input type="search" placeholder="Recherche"></body>`);
    const { units } = extractAttrsFromDom(root);
    assert.equal(units.length, 1);
    assert.equal(units[0]!.text, "Recherche");
  });

  it("starts numbering from the supplied startId", () => {
    const { root } = dom(`<body><img alt="x"><img alt="y"></body>`);
    const { units } = extractAttrsFromDom(root, 100);
    assert.deepEqual(
      units.map((u) => u.id),
      [100, 101],
    );
  });

  it("returns refs that can be used to write translations back", () => {
    const { root, window } = dom(`
      <body>
        <img id="im" alt="Photo">
        <input id="search" type="search" placeholder="Search">
        <meta id="m" name="description" content="Old">
      </body>
    `);
    const { units, refs } = extractAttrsFromDom(root);
    const translatedById = new Map<number, string>([
      [units[0]!.id, "Valokuva"],
      [units[1]!.id, "Hae"],
      [units[2]!.id, "Uusi"],
    ]);
    const entries = Array.from(refs.entries()).map(([id, ref]) => ({
      ref,
      translatedValue: translatedById.get(id)!,
    }));
    applyAttrTranslationsBatch(entries);

    const doc = window.document;
    assert.equal(doc.getElementById("im")!.getAttribute("alt"), "Valokuva");
    assert.equal(doc.getElementById("search")!.getAttribute("placeholder"), "Hae");
    assert.equal(doc.getElementById("m")!.getAttribute("content"), "Uusi");
  });

  it("uses kind 'attr' and an empty placeholder map", () => {
    const { root } = dom(`<body><img alt="hi"></body>`);
    const { units } = extractAttrsFromDom(root);
    assert.equal(units[0]!.kind, "attr");
    assert.equal(units[0]!.placeholders.size, 0);
  });
});
