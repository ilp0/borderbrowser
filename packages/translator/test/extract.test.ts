import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { extractUnits } from "../src/extract.ts";

function units(html: string): { kind: string; text: string }[] {
  const $ = cheerio.load(html);
  return extractUnits($).units.map((u) => ({ kind: u.kind, text: u.text }));
}

describe("extractUnits", () => {
  it("returns no units for an empty document", () => {
    assert.deepEqual(units("<html><body></body></html>"), []);
  });

  it("extracts each leaf-block element as a unit", () => {
    const u = units(`
      <html><body>
        <h1>Title</h1>
        <p>First para.</p>
        <p>Second <a href="/x">link</a>.</p>
      </body></html>
    `);
    assert.deepEqual(u, [
      { kind: "h1", text: "Title" },
      { kind: "p", text: "First para." },
      { kind: "p", text: "Second [1]link[/1]." },
    ]);
  });

  it("descends into block containers without translating them as one unit", () => {
    // <article> contains block children, so recurse; only h1 and p are units.
    const u = units(`<article><h1>T</h1><p>Body.</p></article>`);
    assert.deepEqual(u, [
      { kind: "h1", text: "T" },
      { kind: "p", text: "Body." },
    ]);
  });

  it("treats a nav with only inline children as a single unit", () => {
    const u = units(`<nav><a href="/a">Home</a> <a href="/b">About</a></nav>`);
    assert.equal(u.length, 1);
    assert.equal(u[0]!.kind, "nav");
    assert.match(u[0]!.text, /\[1\]Home\[\/1\] \[2\]About\[\/2\]/);
  });

  it("extracts the document title", () => {
    const u = units(`<html><head><title>Hello</title></head><body><p>x</p></body></html>`);
    const titles = u.filter((x) => x.kind === "title");
    assert.equal(titles.length, 1);
    assert.equal(titles[0]!.text, "Hello");
  });

  it("ignores script, style, and other skip elements", () => {
    const u = units(`
      <html><body>
        <script>console.log("skip")</script>
        <style>.x { color: red; }</style>
        <p>visible</p>
      </body></html>
    `);
    assert.deepEqual(u, [{ kind: "p", text: "visible" }]);
  });

  it("ignores whitespace-only elements", () => {
    const u = units(`<p>   </p><p>  real  </p>`);
    assert.deepEqual(u, [{ kind: "p", text: "  real  " }]);
  });

  it("preserves code spans as opaque placeholders inside a paragraph", () => {
    const u = units(`<p>use <code>fn()</code> instead</p>`);
    assert.equal(u.length, 1);
    assert.equal(u[0]!.text, "use [1/] instead");
  });
});
