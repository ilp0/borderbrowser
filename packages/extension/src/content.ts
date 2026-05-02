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
  decodeText,
  extractFromDom,
} from "@borderbrowser/translator/browser/dom";
import {
  computeContentHash,
  getCached,
  putCached,
} from "./lib/cache.ts";
import { getConfig, getRuntimeConfig, setConfig } from "./lib/config.ts";
import { attachPeek, detachAll as detachPeek } from "./lib/hover-peek.ts";
import {
  type TabRequest,
  type TabResponse,
  type TabStatus,
  sendToBg,
} from "./lib/messages.ts";
import * as readingMode from "./lib/reading-mode.ts";

type CacheEntry = { original: string; translated: string };
const cache: WeakMap<Element, CacheEntry> = new WeakMap();
const translatedElements = new Set<Element>();
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
          translated: translatedElements.size > 0,
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
    debug("extracted", { units: units.length, totalChars: units.reduce((n, u) => n + u.text.length, 0) });

    if (units.length === 0) {
      showOverlayMessage("Nothing translatable on this page.", "info");
      await sleep(1400);
      hideOverlay();
      return;
    }

    // Snapshot originals so we can toggle later.
    for (const u of units) {
      const el = refs.get(u.id);
      if (!el) continue;
      if (!cache.has(el)) cache.set(el, { original: el.innerHTML, translated: "" });
    }

    const model = usePremium ? cfg.premiumModel : cfg.model;
    const modelTier = usePremium ? "premium" : "standard";
    const startMs = performance.now();

    // Persistent-cache lookup. If we've already translated *this exact set
    // of original units* for *this URL/language/tier*, skip the IPC entirely
    // and reuse the result. The atomic-swap pass below stays the same — we
    // just feed it the cached translations array instead of a fresh one.
    const contentHash = await computeContentHash(units);
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
      debug("cache-hit", { units: units.length });
      translationList = cached;
      stats = {
        units: units.length,
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
        units: units.map((u) => ({ id: u.id, kind: u.kind, text: u.text })),
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
        units: units.length,
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
    const updates: { el: Element; html: string }[] = [];
    for (const u of units) {
      const t = translations.get(u.id);
      if (t === undefined) continue;
      const el = refs.get(u.id);
      if (!el) continue;
      const html = decodeText(t, u.placeholders);
      updates.push({ el, html });
    }

    await nextFrame();
    for (const { el, html } of updates) {
      const entry = cache.get(el);
      if (entry) entry.translated = html;
      el.innerHTML = html;
      // `lang` lets screen readers pronounce the swapped-in text correctly.
      el.setAttribute("lang", targetLangCode);
      translatedElements.add(el);
    }
    pageState = "translated";
    if (cfg.hoverPeek) attachAllPeeks();
    lastStats = stats;
    debug("done", { units: units.length, elapsedMs, applied: updates.length });

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
  readyState: document.readyState,
});

/**
 * Resolves once the DOM is parsed enough that `document.body` exists.
 *
 * The content script registers at `document_start` so we can prep state
 * before paint (and, in future units, intercept the `<head>` to pre-cache
 * title/og:/JSON-LD before the page even draws). At that point the body
 * is null and `extractFromDom` would explode. Every code path that touches
 * the DOM funnels through this gate.
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
 * Snapshot of the `<head>` captured as soon as it's parsed. Reserved for
 * the upcoming head-pre-translate work — the next unit will hand this
 * off to the background SW so the translated title/meta are ready before
 * the body swap. We capture it here (not lazily on demand) because by
 * the time the user clicks Translate, the page's own JS may already have
 * mutated the head.
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

void whenDomReady().then(() => {
  captureHead();
  if (location.hash.includes("bb-translate")) {
    // Small delay preserved from the previous document_idle behavior so the
    // page's own bootstrap JS gets a beat to settle before we extract.
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
