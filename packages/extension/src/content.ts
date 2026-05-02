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
import { getRuntimeConfig, setConfig } from "./lib/config.ts";
import {
  type TabRequest,
  type TabResponse,
  type TabStatus,
  sendToBg,
} from "./lib/messages.ts";

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
    case "tab.getStatus":
      return {
        kind: "tab.status",
        ok: true,
        status: {
          translated: translatedElements.size > 0,
          showing: pageState,
          ...(lastStats ? { lastStats } : {}),
          busy,
        },
      };
  }
}

async function translatePage(usePremium: boolean): Promise<void> {
  if (busy) return;
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
    const startMs = performance.now();

    const response = await sendToBg({
      kind: "bg.translate",
      targetLang: cfg.targetLang,
      model,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      units: units.map((u) => ({ id: u.id, kind: u.kind, text: u.text })),
    });

    const elapsedMs = Math.round(performance.now() - startMs);

    debug("bg-response", { ok: response.ok, kind: response.kind });

    if (!response.ok || response.kind !== "bg.translateResult") {
      const msg = response.kind === "error" ? response.message : "Translation failed.";
      debug("bg-error", { msg });
      showOverlayMessage(msg, "error");
      await sleep(2400);
      hideOverlay();
      return;
    }

    const translations = new Map(response.translations.map((t) => [t.id, t.text]));

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
      translatedElements.add(el);
    }
    pageState = "translated";
    lastStats = {
      units: units.length,
      elapsedMs,
      inputTokens: response.stats.inputTokens,
      outputTokens: response.stats.outputTokens,
    };
    debug("done", { units: units.length, elapsedMs, applied: updates.length });

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
}

// ---------- Overlay (lives in a Shadow DOM so the host page's CSS can't touch it) ----------

let overlayHost: HTMLElement | null = null;
let overlayRoot: HTMLElement | null = null;
let overlayText: HTMLElement | null = null;

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
      transition: opacity 220ms ease;
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
      animation: spin 720ms linear infinite;
      flex-shrink: 0;
    }
    .icon-error { color: #dc2626; font-size: 18px; line-height: 1; }
    .icon-info  { color: #2563eb; font-size: 18px; line-height: 1; }
    .text { font-weight: 500; line-height: 1.4; }
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
  shadow.append(style, root);

  overlayRoot = root;
  overlayText = text;
  return root;
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
// `#bb-translate` in the URL → auto-translate after document_idle.
// `document.dispatchEvent(new CustomEvent("borderbrowser:translate"))` from
// page JS → trigger a translation cycle. Both are useful for driving the
// extension from outside the popup (e.g. when iterating with a debugger).

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
});

if (location.hash.includes("bb-translate")) {
  setTimeout(() => void translatePage(false), 800);
}
