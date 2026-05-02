import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractFromDom } from "../src/browser/extract-live.ts";
import { applyTranslation } from "../src/browser/apply.ts";

/**
 * Shadow-DOM piercing tests for the live extract/apply pair.
 *
 * Scope:
 * - extractFromDom must descend through open shadow roots and yield units for
 *   text inside them.
 * - applyTranslation must write back into elements that live inside an open
 *   shadow root (the refs from extract already point there, so this is just a
 *   smoke test that innerHTML works correctly through the boundary).
 * - Closed shadow roots are inaccessible (el.shadowRoot is null), so they are
 *   silently skipped — no crash, no units.
 */

function setupDom(buildBody: (doc: Document) => void): {
  root: Element;
  document: Document;
  window: Window;
} {
  const j = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`);
  // The translator's extract code uses Node.ELEMENT_NODE / Node.TEXT_NODE —
  // make them resolvable on the global Node so the module's references work.
  // @ts-expect-error: globalThis is fine in Node test runtime
  globalThis.Node = j.window.Node;
  buildBody(j.window.document);
  return {
    root: j.window.document.documentElement,
    document: j.window.document,
    window: j.window as unknown as Window,
  };
}

describe("extractFromDom — shadow DOM piercing", () => {
  it("extracts a <p> from inside an open shadow root attached to a custom element", () => {
    const { root } = setupDom((doc) => {
      const host = doc.createElement("my-widget");
      const shadow = host.attachShadow({ mode: "open" });
      const p = doc.createElement("p");
      p.textContent = "foreign text";
      shadow.appendChild(p);
      doc.body.appendChild(host);
    });

    const { units } = extractFromDom(root);
    const ps = units.filter((u) => u.kind === "p");
    assert.equal(ps.length, 1, "expected exactly one <p> unit from inside the shadow root");
    assert.equal(ps[0]!.text, "foreign text");
  });

  it("does not pierce closed shadow roots (graceful skip)", () => {
    const { root } = setupDom((doc) => {
      const host = doc.createElement("my-widget");
      // Closed mode: host.shadowRoot will be null from outside.
      const shadow = host.attachShadow({ mode: "closed" });
      const p = doc.createElement("p");
      p.textContent = "hidden text";
      shadow.appendChild(p);
      doc.body.appendChild(host);

      // Sanity: a sibling <p> in the light DOM should still be extracted.
      const visible = doc.createElement("p");
      visible.textContent = "visible text";
      doc.body.appendChild(visible);
    });

    const { units } = extractFromDom(root);
    const texts = units.filter((u) => u.kind === "p").map((u) => u.text);
    assert.deepEqual(texts, ["visible text"]);
  });

  it("apply writes back into an element living inside an open shadow root", () => {
    const { root } = setupDom((doc) => {
      const host = doc.createElement("my-widget");
      const shadow = host.attachShadow({ mode: "open" });
      const p = doc.createElement("p");
      p.textContent = "foreign text";
      shadow.appendChild(p);
      doc.body.appendChild(host);
    });

    const { units, refs } = extractFromDom(root);
    const unit = units.find((u) => u.kind === "p" && u.text === "foreign text");
    assert.ok(unit, "did not find the shadow-root <p> unit");
    const target = refs.get(unit!.id);
    assert.ok(target, "did not get an element ref for the shadow-root <p>");

    applyTranslation(target!, "vieras teksti", unit!.placeholders);
    assert.equal(target!.innerHTML, "vieras teksti");
  });

  it("extracts both light-DOM and open-shadow content from the same host", () => {
    const { root } = setupDom((doc) => {
      const host = doc.createElement("my-card");
      const shadow = host.attachShadow({ mode: "open" });
      const shadowP = doc.createElement("p");
      shadowP.textContent = "inside shadow";
      shadow.appendChild(shadowP);

      // A light-DOM <p> sibling at body level — the host itself stays empty in
      // the light tree, which is the typical custom-element pattern.
      const lightP = doc.createElement("p");
      lightP.textContent = "outside shadow";
      doc.body.appendChild(host);
      doc.body.appendChild(lightP);
    });

    const texts = extractFromDom(root)
      .units.filter((u) => u.kind === "p")
      .map((u) => u.text)
      .sort();
    assert.deepEqual(texts, ["inside shadow", "outside shadow"]);
  });

  it("handles a host element nested inside another open shadow root", () => {
    const { root } = setupDom((doc) => {
      const outer = doc.createElement("outer-widget");
      const outerShadow = outer.attachShadow({ mode: "open" });
      const inner = doc.createElement("inner-widget");
      const innerShadow = inner.attachShadow({ mode: "open" });
      const p = doc.createElement("p");
      p.textContent = "deeply nested";
      innerShadow.appendChild(p);
      outerShadow.appendChild(inner);
      doc.body.appendChild(outer);
    });

    const texts = extractFromDom(root)
      .units.filter((u) => u.kind === "p")
      .map((u) => u.text);
    assert.deepEqual(texts, ["deeply nested"]);
  });
});
