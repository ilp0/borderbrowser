import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVersion, runExtract } from "../src/cli.ts";

describe("bb cli — version", () => {
  it("returns the version from package.json", () => {
    const v = getVersion();
    assert.match(v, /^\d+\.\d+\.\d+/);
  });
});

describe("bb cli — extract", () => {
  it("extracts translation units from a local fixture HTML file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-cli-test-"));
    const fixture = join(dir, "page.html");
    const html = `<!doctype html>
<html><head><title>Hello</title></head>
<body>
  <h1>Big Title</h1>
  <p>First paragraph with a <a href="/x">link</a>.</p>
  <script>console.log("skip me")</script>
</body></html>`;
    await writeFile(fixture, html, "utf8");

    const units = await runExtract(fixture);

    // JSON-shaped: each entry has id (number), kind (string), text (string).
    for (const u of units) {
      assert.equal(typeof u.id, "number");
      assert.equal(typeof u.kind, "string");
      assert.equal(typeof u.text, "string");
    }

    const kinds = units.map((u) => u.kind);
    assert.ok(kinds.includes("title"), `expected a title unit, got ${kinds.join(",")}`);
    assert.ok(kinds.includes("h1"), `expected an h1 unit, got ${kinds.join(",")}`);
    assert.ok(kinds.includes("p"), `expected a p unit, got ${kinds.join(",")}`);

    const title = units.find((u) => u.kind === "title");
    assert.equal(title?.text, "Hello");

    const h1 = units.find((u) => u.kind === "h1");
    assert.equal(h1?.text, "Big Title");

    const p = units.find((u) => u.kind === "p");
    assert.match(p?.text ?? "", /\[1\]link\[\/1\]/);

    // Script content must be skipped.
    assert.ok(
      !units.some((u) => u.text.includes("skip me")),
      "script content must not be extracted",
    );

    // Output is JSON-serializable.
    const json = JSON.stringify(units);
    assert.ok(json.length > 0);
    const parsed = JSON.parse(json) as Array<{ id: number; kind: string; text: string }>;
    assert.equal(parsed.length, units.length);
  });
});
