import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractFromDom } from "../src/browser/extract-live.ts";
import { decodeText } from "../src/placeholders.ts";

/**
 * Tests for the LIVE-DOM extract path used by the extension's content script.
 *
 * These mirror `extract.test.ts` (which exercises the cheerio-based path used
 * by the Node CLI). Both implementations share the placeholder format, so
 * `decodeText()` works on output from either side. JSDOM gives us a real
 * DOM to walk so we catch any divergence between the two implementations.
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

function unitsOf(html: string): { kind: string; text: string }[] {
  const { root } = dom(html);
  return extractFromDom(root).units.map((u) => ({ kind: u.kind, text: u.text }));
}

describe("extractFromDom (live DOM)", () => {
  it("returns no units for an empty body", () => {
    assert.deepEqual(unitsOf("<head></head><body></body>"), []);
  });

  it("extracts each leaf-block element as a unit", () => {
    const u = unitsOf(`
      <body>
        <h1>Title</h1>
        <p>First para.</p>
        <p>Second <a href="/x">link</a>.</p>
      </body>
    `);
    assert.deepEqual(u, [
      { kind: "h1", text: "Title" },
      { kind: "p", text: "First para." },
      { kind: "p", text: "Second [1]link[/1]." },
    ]);
  });

  it("descends into block containers without translating them as one unit", () => {
    const u = unitsOf(`<body><article><h1>T</h1><p>Body.</p></article></body>`);
    assert.deepEqual(u, [
      { kind: "h1", text: "T" },
      { kind: "p", text: "Body." },
    ]);
  });

  it("treats a nav with only inline children as a single unit", () => {
    const u = unitsOf(`<body><nav><a href="/a">Home</a> <a href="/b">About</a></nav></body>`);
    assert.equal(u.length, 1);
    assert.equal(u[0]!.kind, "nav");
    assert.match(u[0]!.text, /\[1\]Home\[\/1\] \[2\]About\[\/2\]/);
  });

  it("extracts the document title", () => {
    const u = unitsOf(`<head><title>Hello</title></head><body><p>x</p></body>`);
    const titles = u.filter((x) => x.kind === "title");
    assert.equal(titles.length, 1);
    assert.equal(titles[0]!.text, "Hello");
  });

  it("ignores script, style, and other skip elements", () => {
    const u = unitsOf(`
      <body>
        <script>console.log("skip")</script>
        <style>.x { color: red; }</style>
        <p>visible</p>
      </body>
    `);
    assert.deepEqual(u, [{ kind: "p", text: "visible" }]);
  });

  it("preserves code spans as opaque placeholders inside a paragraph", () => {
    const u = unitsOf(`<body><p>use <code>fn()</code> instead</p></body>`);
    assert.equal(u.length, 1);
    assert.equal(u[0]!.text, "use [1/] instead");
  });

  it("encodes self-closing void elements", () => {
    const u = unitsOf(`<body><p>Line A<br>Line B<img src="/p.png" alt="pic"></p></body>`);
    assert.equal(u[0]!.text, "Line A[1/]Line B[2/]");
  });

  it("round-trips through decodeText (no translation)", () => {
    // Encode → decode without LLM. Should produce HTML that re-parses to the
    // same shape as the source (modulo whitespace).
    const { root } = dom(`<body><p>Read <a href="/x">more</a> here</p></body>`);
    const { units } = extractFromDom(root);
    const u = units[0]!;
    const html = decodeText(u.text, u.placeholders);
    assert.equal(html, `Read <a href="/x">more</a> here`);
  });

  it("survives an LLM-style placeholder reordering", () => {
    const { root } = dom(`<body><p>Read <a href="/x">more</a> here</p></body>`);
    const { units } = extractFromDom(root);
    const u = units[0]!;
    // Simulate the LLM shifting the bracketed phrase like a real translation might.
    const translated = "Tästä [1]lisää[/1]";
    const html = decodeText(translated, u.placeholders);
    assert.equal(html, `Tästä <a href="/x">lisää</a>`);
  });
});
