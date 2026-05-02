import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { decodeText, encodeChildren } from "../src/placeholders.ts";
import type { Element } from "domhandler";

function loadFragment(html: string): { $: cheerio.CheerioAPI; el: Element } {
  const $ = cheerio.load(`<root>${html}</root>`);
  const el = $("root").get(0)!;
  return { $, el };
}

describe("encodeChildren", () => {
  it("encodes plain text with no placeholders", () => {
    const { $, el } = loadFragment("Hello world");
    const { text, placeholders } = encodeChildren($, el);
    assert.equal(text, "Hello world");
    assert.equal(placeholders.size, 0);
  });

  it("encodes a single inline tag with paired markers", () => {
    const { $, el } = loadFragment(`Read <a href="/x">more</a> here`);
    const { text, placeholders } = encodeChildren($, el);
    assert.equal(text, "Read [1]more[/1] here");
    assert.equal(placeholders.size, 1);
    const ph = placeholders.get(1)!;
    assert.equal(ph.kind, "inline");
    if (ph.kind === "inline") {
      assert.equal(ph.tag, "a");
      assert.equal(ph.attrs.href, "/x");
    }
  });

  it("encodes nested inline tags with sequential ids", () => {
    const { $, el } = loadFragment(`<a href="/x">I <strong>love</strong> you</a>`);
    const { text } = encodeChildren($, el);
    assert.equal(text, "[1]I [2]love[/2] you[/1]");
  });

  it("encodes self-closing void elements", () => {
    const { $, el } = loadFragment(`Line A<br>Line B<img src="/p.png" alt="pic">`);
    const { text, placeholders } = encodeChildren($, el);
    assert.equal(text, "Line A[1/]Line B[2/]");
    assert.equal(placeholders.get(1)?.kind, "void");
    assert.equal(placeholders.get(2)?.kind, "void");
  });

  it("encodes skip elements as opaque self-closing placeholders", () => {
    const { $, el } = loadFragment(`see <code>x = 1</code> for syntax`);
    const { text, placeholders } = encodeChildren($, el);
    assert.equal(text, "see [1/] for syntax");
    const ph = placeholders.get(1)!;
    assert.equal(ph.kind, "opaque");
    if (ph.kind === "opaque") {
      assert.match(ph.html, /<code>x = 1<\/code>/);
    }
  });
});

describe("decodeText", () => {
  it("returns plain text unchanged when there are no markers", () => {
    const out = decodeText("Hello world", new Map());
    assert.equal(out, "Hello world");
  });

  it("escapes <, >, & in plain text segments", () => {
    const out = decodeText("a < b & c > d", new Map());
    assert.equal(out, "a &lt; b &amp; c &gt; d");
  });

  it("expands [N]…[/N] back into the original inline tag", () => {
    const { $, el } = loadFragment(`Read <a href="/x">more</a> here`);
    const { text, placeholders } = encodeChildren($, el);
    const out = decodeText(text, placeholders);
    assert.equal(out, `Read <a href="/x">more</a> here`);
  });

  it("expands self-closing void placeholders", () => {
    const { $, el } = loadFragment(`A<br>B`);
    const { text, placeholders } = encodeChildren($, el);
    const out = decodeText(text, placeholders);
    assert.equal(out, "A<br>B");
  });

  it("expands opaque placeholders verbatim", () => {
    const { $, el } = loadFragment(`see <code>x = 1</code> here`);
    const { text, placeholders } = encodeChildren($, el);
    const out = decodeText(text, placeholders);
    assert.equal(out, "see <code>x = 1</code> here");
  });

  it("handles translated reordering of placeholders", () => {
    const { $, el } = loadFragment(`Read <a href="/x">more</a> here`);
    const { placeholders } = encodeChildren($, el);
    // Simulate the LLM moving the bracketed phrase
    const out = decodeText("Tästä [1]lisää[/1]", placeholders);
    assert.equal(out, `Tästä <a href="/x">lisää</a>`);
  });

  it("silently drops unknown placeholder ids", () => {
    const out = decodeText("hello [99]world[/99]!", new Map());
    assert.equal(out, "hello world!");
  });
});
