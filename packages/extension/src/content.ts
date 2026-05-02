/**
 * Content script.
 *
 * One module per tab. Owns:
 *   - the live DOM extraction
 *   - the loading overlay
 *   - per-element original/translated cache for the toggle
 *   - the atomic swap on translation completion
 *
 * Calls the background SW for the actual LLM round-trip — never makes the
 * fetch itself, so the API key never leaves chrome.storage.local + the SW.
 */
import "./lib/browser.ts"; // Cross-browser polyfill (Chrome + Firefox MV3).
import {
  applyJsonLdTranslations,
  decodeText,
  extractFromDom,
  extractJsonLd,
  snapshotJsonLdOriginals,
} from "@borderbrowser/translator/browser/dom";
import {
  computeContentHash,
  getCached,
  putCached,
} from "./lib/cache.ts";
import { getConfig, getRuntimeConfig, setConfig } from "./lib/config.ts";
import { attachPeek, detachAll as detachPeek } from "./lib/hover-peek.ts";
import {
  BB_FRAME_MSG_VERSION,
  type FrameTranslateResponse,
  isFrameTranslateRequest,
} from "./lib/frame-protocol.ts";
import {
  type TabRequest,
  type TabResponse,
  type TabStatus,
  sendToBg,
} from "./lib/messages.ts";
import * as readingMode from "./lib/reading-mode.ts";

// Each frame the content script lives in runs an independent instance:
// own DOM, own translate cycle, own atomic swap. The top-frame guard is
// only used to keep automation hooks (the `#bb-translate` URL trigger)
// from double-firing when the iframe also matches the URL pattern.
const isTopFrame = window.top === window;

type CacheEntry = { original: string; translated: string };
const cache: WeakMap<Element, CacheEntry> = new WeakMap();
const translatedElements = new Set<Element>();
/**
 * Per-script original/translated text for `<script type="application/ld+json">`
 * blocks we rewrote. Tracked separately from the inline element cache because
 * the apply path is different (textContent assignment, no decodeText).
 */
const jsonLdCache = new Map<HTMLScriptElement, { original: string; translated: string }>();
let pageState: "original" | "translated" = "original";
let busy = false;
let lastStats: TabStatus["lastStats"];

chrome.runtime.onMessage.addListener(
  (req: TabRequest, _sender, sendResponse: (r: TabResponse) => void) => {
    handleMessage(req)
      .then(sendResponse)
      .catch((err: unknown) =>
        sendResponse({
          kind: "error",
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    return true;
  },
);

async function handleMessage(req: TabRequest): Promise<TabResponse> {
  switch (req.kind) {
    case "tab.translatePage":
      await translatePage(req.usePremium ?? false);
      return { kind: "tab.ack", ok: true };
    case "tab.showOriginal":
      showState("original");
      return { kind: "tab.ack", ok: true };
    case "tab.showTranslated":
      showState("translated");
      return { kind: "tab.ack", ok: true };
    case "tab.toggleReadingMode":
      await handleToggleReadingMode(req.enabled);
      return { kind: "tab.ack", ok: true };
    case "tab.toggleOriginal":
      // No-op when nothing has been translated yet — leave the page alone so
      // the keyboard shortcut doesn't surprise users on un-translated pages.
      if (translatedElements.size > 0) {
        showState(pageState === "translated" ? "original" : "translated");
      }
      return { kind: "tab.ack", ok: true };
    case "tab.getStatus":
      return {
        kind: "tab.status",
        ok: true,
        status: {
          translated: translatedElements.size > 0 || jsonLdCache.size > 0,
          showing: pageState,
          ...(lastStats ? { lastStats } : {}),
          busy,
          readingMode: readingMode.isEnabled(),
        },
      };
  }
}

async function handleToggleReadingMode(explicit?: boolean): Promise<void> {
  const shouldEnable =
    explicit === undefined ? !readingMode.isEnabled() : explicit;

  // If enable() couldn't find an article we don't persist — would auto-fail
  // again next load.
  const ok = shouldEnable ? readingMode.enable() : (readingMode.disable(), true);
  if (!ok) return;

  const host = location.hostname;
  if (!host) return;
  try {
    const cfg = await getConfig();
    const set = new Set(cfg.readingModeDomains);
    if (shouldEnable) set.add(host);
    else set.delete(host);
    await setConfig({ readingModeDomains: Array.from(set) });
  } catch (err) {
    console.warn("[BorderBrowser] failed to persist reading mode pref", err);
  }
}

async function translatePage(usePremium: boolean): Promise<void> {
  if (busy) return;
  // Defensive: at document_start a popup-driven translate could race the
  // page parse and hit a half-built DOM. Every entry point funnels here,
  // so this single gate guards the whole flow.
  await whenDomReady();
  busy = true;
  showOverlay("Translating page…");
  debug("start", { usePremium });

  try {
    const cfg = await getRuntimeConfig();
    debug("config", {
      hasKey: !!cfg.apiKey,
      keyLen: cfg.apiKey?.length ?? 0,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      targetLang: cfg.targetLang,
    });
    if (!cfg.apiKey) {
      showOverlayMessage("No API key set. Open BorderBrowser settings.", "error");
      await sleep(2200);
      hideOverlay();
      return;
    }

    // Source-language guard: if the page declares the same language as the
    // user's target, we'd burn tokens for the LLM to return identical text.
    // Match on the primary subtag only ("en-US" → "en"). Map a few common
    // free-form names ("Finnish", "Suomi" → "fi") so the user's display name
    // matches the page's lang attribute.
    const pageLang = (document.documentElement.lang || "").toLowerCase().split("-")[0];
    const targetLangCode = LANG_NAME_TO_CODE[cfg.targetLang.toLowerCase()] ?? cfg.targetLang.toLowerCase().slice(0, 2);
    if (pageLang && pageLang === targetLangCode) {
      debug("same-lang", { pageLang, targetLang: cfg.targetLang });
      showOverlayMessage(`This page is already in ${cfg.targetLang}.`, "info");
      await sleep(1800);
      hideOverlay();
      return;
    }

    // Yield once so the overlay paints before we hammer the DOM.
    await nextFrame();

    const root = document.documentElement;
    const { units, refs } = extractFromDom(root);

    // Extract JSON-LD structured-data fields too. Recipe / FAQ / Article
    // schemas often carry user-facing prose (recipe steps, FAQ answers) that
    // search engines surface in their result cards; if we leave them in the
    // source language the page reads bilingual.
    //
    // ID-space: continue numbering from where DOM units left off so the LLM
    // gets a single flat list with no collisions. Results are demuxed back
    // out by id at apply time.
    const maxDomId = units.reduce((m, u) => Math.max(m, u.id), 0);
    const jsonLd = extractJsonLd(document, maxDomId + 1);

    debug("extracted", {
      domUnits: units.length,
      jsonLdUnits: jsonLd.units.length,
      jsonLdScripts: jsonLd.scripts.size,
      totalChars:
        units.reduce((n, u) => n + u.text.length, 0) +
        jsonLd.units.reduce((n, u) => n + u.text.length, 0),
    });

    if (units.length === 0 && jsonLd.units.length === 0) {
      showOverlayMessage("Nothing translatable on this page.", "info");
      await sleep(1400);
      hideOverlay();
      return;
    }

    // Snapshot originals so we can toggle later. DOM elements use a WeakMap
    // keyed on the element; JSON-LD scripts get their textContent captured up
    // front because we'll overwrite it in the atomic pass below.
    for (const u of units) {
      const el = refs.get(u.id);
      if (!el) continue;
      if (!cache.has(el)) cache.set(el, { original: el.innerHTML, translated: "" });
    }
    for (const { script, original } of snapshotJsonLdOriginals(jsonLd)) {
      if (!jsonLdCache.has(script)) {
        jsonLdCache.set(script, { original, translated: "" });
      }
    }

    const model = usePremium ? cfg.premiumModel : cfg.model;
    const modelTier = usePremium ? "premium" : "standard";
    const startMs = performance.now();

    const allUnits = [...units, ...jsonLd.units];
    // Persistent-cache lookup keyed on the combined unit set so we don't
    // skip JSON-LD translation on a cache hit.
    const contentHash = await computeContentHash(allUnits);
    const cacheKey = {
      url: location.href,
      contentHash,
      targetLang: cfg.targetLang,
      modelTier,
    };
    const cached = await getCached(cacheKey);

    let translationList: { id: number; text: string }[];
    let stats: NonNullable<TabStatus["lastStats"]>;

    if (cached) {
      debug("cache-hit", { units: allUnits.length });
      translationList = cached;
      stats = {
        units: allUnits.length,
        elapsedMs: Math.round(performance.now() - startMs),
        inputTokens: 0,
        outputTokens: 0,
      };
    } else {
      const response = await sendToBg({
        kind: "bg.translate",
        targetLang: cfg.targetLang,
        model,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        units: allUnits.map((u) => ({ id: u.id, kind: u.kind, text: u.text })),
      });

      debug("bg-response", { ok: response.ok, kind: response.kind });

      if (!response.ok || response.kind !== "bg.translateResult") {
        const msg = response.kind === "error" ? response.message : "Translation failed.";
        debug("bg-error", { msg });
        showOverlayMessage(msg, "error");
        await sleep(2400);
        hideOverlay();
        return;
      }

      translationList = response.translations;
      stats = {
        units: allUnits.length,
        elapsedMs: Math.round(performance.now() - startMs),
        inputTokens: response.stats.inputTokens,
        outputTokens: response.stats.outputTokens,
      };

      // Fire-and-forget: persist for next visit. Don't block the swap.
      void putCached(cacheKey, translationList).catch(() => {});
    }

    const elapsedMs = stats.elapsedMs;
    const translations = new Map(translationList.map((t) => [t.id, t.text]));

    // Pre-compute everything BEFORE we touch the DOM, so the swap is atomic.
    // The JSON-LD path uses a separate applier (no decodeText — JSON values
    // are plain text, not HTML; running them through decodeText would
    // entity-escape `<`, `>`, `&` and corrupt strings like "Tom & Jerry").
    const updates: { el: Element; html: string }[] = [];
    for (const u of units) {
      const t = translations.get(u.id);
      if (t === undefined) continue;
      const el = refs.get(u.id);
      if (!el) continue;
      const html = decodeText(t, u.placeholders);
      updates.push({ el, html });
    }

    // Demux JSON-LD translations back out of the flat response.
    const jsonLdTranslations = new Map<number, string>();
    for (const u of jsonLd.units) {
      const t = translations.get(u.id);
      if (t !== undefined) jsonLdTranslations.set(u.id, t);
    }

    await nextFrame();
    // Atomic swap: DOM writes + JSON-LD writes happen in the same pass so the
    // user never sees a half-translated page (the project's UX contract).
    for (const { el, html } of updates) {
      const entry = cache.get(el);
      if (entry) entry.translated = html;
      el.innerHTML = html;
      // `lang` lets screen readers pronounce the swapped-in text correctly.
      el.setAttribute("lang", targetLangCode);
      translatedElements.add(el);
    }
    applyJsonLdTranslations(jsonLd, jsonLdTranslations);
    // Capture each rewritten script's new textContent so the toggle can flip
    // back to translated state after a "show original".
    for (const script of jsonLd.scripts.keys()) {
      const entry = jsonLdCache.get(script);
      if (entry) entry.translated = script.textContent ?? "";
    }
    pageState = "translated";
    if (cfg.hoverPeek) attachAllPeeks();
    lastStats = stats;
    debug("done", {
      domUnits: units.length,
      jsonLdUnits: jsonLd.units.length,
      elapsedMs,
      applied: updates.length + jsonLdTranslations.size,
    });

    announce(`Page translated to ${cfg.targetLang}`);
    hideOverlay();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[BorderBrowser]", err);
    debug("exception", { msg, stack });
    showOverlayMessage(msg, "error");
    await sleep(2400);
    hideOverlay();
  } finally {
    busy = false;
  }
}

/**
 * Surface internal state to the page so it can be observed via DevTools or
 * an automation harness. Both a console.log (visible in the page console
 * because content scripts share the page's DevTools), and a CustomEvent on
 * `document` so page JS can listen.
 */
function debug(phase: string, data: unknown): void {
  console.log("[BorderBrowser]", phase, data);
  document.dispatchEvent(
    new CustomEvent("borderbrowser:debug", { detail: { phase, data } }),
  );
}

function showState(s: "original" | "translated"): void {
  for (const el of translatedElements) {
    const entry = cache.get(el);
    if (!entry) continue;
    if (s === "original") el.innerHTML = entry.original;
    else el.innerHTML = entry.translated;
  }
  // Mirror the toggle on JSON-LD scripts. Scripts that were captured but had
  // no translatable fields (e.g. an Organization-only block) still appear in
  // the cache but their `translated` is empty — skip those.
  for (const [script, entry] of jsonLdCache) {
    if (s === "original") script.textContent = entry.original;
    else if (entry.translated) script.textContent = entry.translated;
  }
  pageState = s;
  // Peek would point at original-shown text, so detach on the way back.
  if (s === "original") {
    detachPeek(translatedElements);
  } else {
    void (async () => {
      const cfg = await getRuntimeConfig();
      if (cfg.hoverPeek) attachAllPeeks();
    })();
  }
}

function attachAllPeeks(): void {
  for (const el of translatedElements) {
    const entry = cache.get(el);
    if (entry) attachPeek(el, entry.original);
  }
}

// ---------- Overlay (lives in a Shadow DOM so the host page's CSS can't touch it) ----------

let overlayHost: HTMLElement | null = null;
let overlayRoot: HTMLElement | null = null;
let overlayText: HTMLElement | null = null;
let overlayLive: HTMLElement | null = null;

function ensureOverlay(): HTMLElement {
  if (overlayRoot) return overlayRoot;
  overlayHost = document.createElement("div");
  overlayHost.id = "__borderbrowser_overlay__";
  document.documentElement.appendChild(overlayHost);
  const shadow = overlayHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .root {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(255, 255, 255, 0.78);
      backdrop-filter: blur(10px) saturate(1.05);
      -webkit-backdrop-filter: blur(10px) saturate(1.05);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", Roboto, sans-serif;
      opacity: 0; pointer-events: none;
    }
    /* Reduced-motion users get an instant swap — no fade, no spinner spin. */
    @media (prefers-reduced-motion: no-preference) {
      .root { transition: opacity 220ms ease; }
      .spinner { animation: spin 720ms linear infinite; }
    }
    .root.show { opacity: 1; pointer-events: auto; }
    .card {
      padding: 18px 24px; border-radius: 14px;
      background: rgba(255,255,255,0.96);
      box-shadow: 0 16px 48px rgba(0,0,0,0.16), 0 1px 2px rgba(0,0,0,0.06);
      display: flex; align-items: center; gap: 14px;
      font-size: 14px; color: #111; max-width: 360px;
    }
    .spinner {
      width: 18px; height: 18px;
      border: 2px solid rgba(0,0,0,0.10); border-top-color: #2563eb;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .icon-error { color: #dc2626; font-size: 18px; line-height: 1; }
    .icon-info  { color: #2563eb; font-size: 18px; line-height: 1; }
    .text { font-weight: 500; line-height: 1.4; }
    /* Visually hidden but accessible to screen readers. */
    .live {
      position: absolute; width: 1px; height: 1px;
      padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  const root = document.createElement("div");
  root.className = "root";
  const card = document.createElement("div");
  card.className = "card";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  const text = document.createElement("div");
  text.className = "text";
  card.append(spinner, text);
  root.append(card);

  // ARIA live region — sits in the shadow root alongside the overlay so the
  // host page's CSS can't suppress it. Visually hidden via `.live`. We push
  // one announcement per translation pass (not per element) so screen-reader
  // users hear "Page translated to Finnish" once, not 200 times.
  const live = document.createElement("div");
  live.className = "live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");

  shadow.append(style, root, live);

  overlayRoot = root;
  overlayText = text;
  overlayLive = live;
  return root;
}

function announce(message: string): void {
  ensureOverlay();
  if (overlayLive) overlayLive.textContent = message;
}

function setOverlayIcon(icon: "spinner" | "info" | "error"): void {
  ensureOverlay();
  const card = overlayRoot?.querySelector(".card");
  if (!card) return;
  const first = card.firstElementChild;
  if (first) first.remove();
  const newEl = document.createElement("div");
  if (icon === "spinner") {
    newEl.className = "spinner";
  } else if (icon === "info") {
    newEl.className = "icon-info";
    newEl.textContent = "ℹ";
  } else {
    newEl.className = "icon-error";
    newEl.textContent = "✕";
  }
  card.prepend(newEl);
}

function showOverlay(message: string): void {
  const root = ensureOverlay();
  if (overlayText) overlayText.textContent = message;
  setOverlayIcon("spinner");
  root.classList.add("show");
}

function showOverlayMessage(message: string, kind: "info" | "error"): void {
  const root = ensureOverlay();
  if (overlayText) overlayText.textContent = message;
  setOverlayIcon(kind);
  root.classList.add("show");
}

function hideOverlay(): void {
  overlayRoot?.classList.remove("show");
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Test/automation hooks ----------
//
// `#bb-translate` in the URL → auto-translate after DOMContentLoaded.
// `document.dispatchEvent(new CustomEvent("borderbrowser:translate"))` from
// page JS → trigger a translation cycle. Both are useful for driving the
// extension from outside the popup (e.g. when iterating with a debugger).
// `translatePage` itself awaits the DOM gate, so dispatching this event
// before DOMContentLoaded is safe.

document.addEventListener("borderbrowser:translate", (e: Event) => {
  const detail = (e as CustomEvent<{ usePremium?: boolean; targetLang?: string }>).detail;
  void (async () => {
    if (detail?.targetLang) {
      await setConfig({ targetLang: detail.targetLang });
    }
    await translatePage(detail?.usePremium ?? false);
  })();
});

/**
 * Free-form display name → BCP-47 primary subtag, for the source-language
 * guard. The user types "Suomi"/"Finnish"; the page declares lang="fi".
 */
const LANG_NAME_TO_CODE: Record<string, string> = {
  english: "en",
  suomi: "fi",
  finnish: "fi",
  svenska: "sv",
  swedish: "sv",
  norsk: "no",
  norwegian: "no",
  dansk: "da",
  danish: "da",
  deutsch: "de",
  german: "de",
  français: "fr",
  francais: "fr",
  french: "fr",
  español: "es",
  espanol: "es",
  spanish: "es",
  italiano: "it",
  italian: "it",
  português: "pt",
  portugues: "pt",
  portuguese: "pt",
  nederlands: "nl",
  dutch: "nl",
  polski: "pl",
  polish: "pl",
  русский: "ru",
  russian: "ru",
  українська: "uk",
  ukrainian: "uk",
  türkçe: "tr",
  turkce: "tr",
  turkish: "tr",
  日本語: "ja",
  japanese: "ja",
  한국어: "ko",
  korean: "ko",
  简体中文: "zh",
  繁體中文: "zh",
  chinese: "zh",
  العربية: "ar",
  arabic: "ar",
  हिन्दी: "hi",
  hindi: "hi",
};

console.log("[BorderBrowser] content script loaded", {
  url: location.href,
  hash: location.hash,
  topFrame: isTopFrame,
  readyState: document.readyState,
});

/**
 * Resolves once the DOM is parsed enough that `document.body` exists.
 *
 * The content script registers at `document_start` so we can prep state
 * before paint. At that point the body is null and `extractFromDom` would
 * explode. Every code path that touches the DOM funnels through this gate.
 */
function whenDomReady(): Promise<void> {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

/**
 * Snapshot of the `<head>` captured as soon as it's parsed.
 */
type HeadSnapshot = {
  title: string;
  metas: { name: string; content: string }[];
  jsonLd: string[];
};
let headSnapshot: HeadSnapshot | null = null;

function captureHead(): void {
  if (headSnapshot) return;
  const head = document.head;
  if (!head) return;
  const metas: { name: string; content: string }[] = [];
  for (const m of head.querySelectorAll("meta")) {
    const name = m.getAttribute("name") ?? m.getAttribute("property") ?? "";
    const content = m.getAttribute("content") ?? "";
    if (name && content) metas.push({ name, content });
  }
  const jsonLd: string[] = [];
  for (const s of head.querySelectorAll('script[type="application/ld+json"]')) {
    if (s.textContent) jsonLd.push(s.textContent);
  }
  headSnapshot = {
    title: document.title,
    metas,
    jsonLd,
  };
  debug("head-captured", { title: headSnapshot.title, metas: metas.length, jsonLd: jsonLd.length });
}

// Surface frame context to the page so e2e harnesses can verify the script
// is running in BOTH the parent and the iframe.
document.dispatchEvent(
  new CustomEvent("borderbrowser:frame-loaded", {
    detail: {
      topFrame: isTopFrame,
      url: location.href,
    },
  }),
);

void whenDomReady().then(() => {
  captureHead();
  // Top-frame guard: an iframe sharing the parent's hash would otherwise
  // double-fire its own translation cycle at load time.
  if (isTopFrame && location.hash.includes("bb-translate")) {
    setTimeout(() => void translatePage(false), 800);
  }
});

// Auto-enable reading mode if this domain is in the user's saved list.
void (async () => {
  try {
    const cfg = await getConfig();
    const host = location.hostname;
    if (host && cfg.readingModeDomains?.includes(host)) {
      readingMode.enable();
    }
  } catch {
    // chrome.storage may be unavailable in odd contexts; non-fatal.
  }
})();

// Cross-origin parent → child translate stub. Page content never crosses
// the frame boundary — only a control signal in, an ack out. We accept
// messages from `window.parent` only.
if (!isTopFrame) {
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    if (!isFrameTranslateRequest(event.data)) return;
    const req = event.data;
    void (async () => {
      let ok = true;
      let reason: string | undefined;
      try {
        if (req.lang) await setConfig({ targetLang: req.lang });
        await translatePage(req.usePremium ?? false);
      } catch (err) {
        ok = false;
        reason = err instanceof Error ? err.message : String(err);
      }
      const response: FrameTranslateResponse = {
        type: "bb-translate-response",
        v: BB_FRAME_MSG_VERSION,
        requestId: req.requestId,
        ok,
        ...(reason ? { reason } : {}),
      };
      event.source?.postMessage(response, {
        targetOrigin: event.origin,
      });
    })();
  });
}
