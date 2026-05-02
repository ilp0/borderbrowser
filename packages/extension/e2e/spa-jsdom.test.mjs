/**
 * SPA pipeline — JSDOM substitute for the Chrome MCP recipe in UNIT 11.
 *
 * Exercises `startSpaObserver` end-to-end in a real DOM (via JSDOM): loads
 * the fixture HTML, wires a stub translator, fires the click that appends
 * a French paragraph, and asserts the new paragraph is translated within
 * ~500ms.
 *
 * Runs as a Node test (`node --test`) so it sits alongside the existing
 * test infrastructure with no Playwright dep. The Chrome MCP path is the
 * production verification when an actual extension load is available.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));

describe("SPA MutationObserver pipeline (JSDOM)", () => {
  let html;
  let bundle;
  before(async () => {
    html = await readFile(resolve(here, "fixtures/spa.html"), "utf8");
    bundle = await readFile(
      resolve(here, "fixtures/mutation-observer.bundle.js"),
      "utf8",
    );
  });

  it("translates a paragraph appended after the observer starts", async () => {
    // `runScripts: "dangerously"` enables the inline <script> in the fixture,
    // including the click handler. We strip the harness <script src=...> tag
    // and inline the bundle so we don't need a file-server.
    const harnessFreeHtml = html.replace(
      /<script src="\.\/mutation-observer\.bundle\.js"><\/script>/,
      `<script>${bundle}</script>`,
    );
    const dom = new JSDOM(harnessFreeHtml, {
      url: "http://localhost/?test=spa",
      runScripts: "dangerously",
      pretendToBeVisual: true,
    });

    const win = dom.window;
    // Wait for the harness to wire up the observer.
    await waitFor(() => win.__bbObserverReady === true, win, 1000);

    // The harness pre-marks the initial paragraph; only newly-inserted ones
    // should pick up data-bb-translated="1" via the observer pipeline.
    const initial = win.document.getElementById("bb-spa-initial");
    assert.equal(initial.getAttribute("data-bb-translated"), "1");

    // Simulate the user clicking the button — appends a French <p>.
    win.document.getElementById("bb-spa-add").click();
    win.document.getElementById("bb-spa-add").click();

    // Poll for both paragraphs to be translated. Recipe target: ~500ms.
    const deadline = Date.now() + 1500;
    let translated;
    while (Date.now() < deadline) {
      translated = Array.from(
        win.document.querySelectorAll(".bb-spa-added[data-bb-translated='1']"),
      );
      if (translated.length === 2) break;
      await sleep(20);
    }

    assert.equal(translated.length, 2, "both new paragraphs should be translated");
    for (const p of translated) {
      // Stub translator uppercases the unit text.
      assert.equal(p.textContent, p.textContent.toUpperCase());
      assert.match(p.textContent, /[A-Z]/);
    }
  });

  it("does not lose mutations inserted while a batch is in flight", async () => {
    // Regression: the observer must stay connected during runBatch so that
    // SPA inserts arriving mid-await are captured and translated by the
    // following pass. Without this, infinite-scroll items inserted while
    // the previous batch is talking to the LLM would be silently dropped.
    const harnessFreeHtml = html.replace(
      /<script src="\.\/mutation-observer\.bundle\.js"><\/script>/,
      `<script>${bundle}</script>`,
    );
    const dom = new JSDOM(harnessFreeHtml, {
      url: "http://localhost/?test=spa",
      runScripts: "dangerously",
      pretendToBeVisual: true,
    });
    const win = dom.window;
    await waitFor(() => win.__bbObserverReady === true, win, 1000);

    // 250ms artificial delay simulates a real bg round-trip.
    win.__bbStubDelayMs = 250;

    const btn = win.document.getElementById("bb-spa-add");
    btn.click(); // first insertion arms the debounce
    await sleep(150); // first batch is now in flight (debounce 80 + spinning up)
    btn.click(); // second insertion arrives DURING the await

    // Both must be translated by the time the second batch settles.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const done = win.document.querySelectorAll(
        ".bb-spa-added[data-bb-translated='1']",
      );
      if (done.length === 2) break;
      await sleep(20);
    }
    const done = win.document.querySelectorAll(
      ".bb-spa-added[data-bb-translated='1']",
    );
    assert.equal(done.length, 2, "both paragraphs must be translated");
  });

  it("debounces a burst of insertions into a single batch", async () => {
    const harnessFreeHtml = html.replace(
      /<script src="\.\/mutation-observer\.bundle\.js"><\/script>/,
      `<script>${bundle}</script>`,
    );
    const dom = new JSDOM(harnessFreeHtml, {
      url: "http://localhost/?test=spa",
      runScripts: "dangerously",
      pretendToBeVisual: true,
    });
    const win = dom.window;
    await waitFor(() => win.__bbObserverReady === true, win, 1000);

    // Fire 5 inserts in rapid succession; debounce window is 80ms in the
    // harness so they should coalesce.
    const btn = win.document.getElementById("bb-spa-add");
    for (let i = 0; i < 5; i++) btn.click();

    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const done = win.document.querySelectorAll(
        ".bb-spa-added[data-bb-translated='1']",
      );
      if (done.length === 5) break;
      await sleep(20);
    }
    const done = win.document.querySelectorAll(
      ".bb-spa-added[data-bb-translated='1']",
    );
    assert.equal(done.length, 5);
  });
});

function waitFor(check, win, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (check()) return resolve(undefined);
      } catch {
        // ignore — try again
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("waitFor timed out"));
      }
      win.setTimeout(tick, 10);
    };
    tick();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
