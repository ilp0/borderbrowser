/**
 * Popup logic. Reads tab status, drives the translate button, and toggles
 * between original ↔ translated. The popup talks to the active tab's content
 * script; it never makes LLM calls itself.
 */
import { getConfig, getSecrets } from "../lib/config.ts";
import { sendToTab } from "../lib/messages.ts";
import type { TabStatus } from "../lib/messages.ts";

const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector<T>(sel) as T;

const els = {
  status: $<HTMLDivElement>("#status"),
  lang: $<HTMLDivElement>("#target-lang"),
  translateBtn: $<HTMLButtonElement>("#translate-btn"),
  toggleRow: $<HTMLDivElement>("#toggle-row"),
  showOrig: $<HTMLButtonElement>("#show-orig"),
  showTrans: $<HTMLButtonElement>("#show-trans"),
  premiumBtn: $<HTMLButtonElement>("#premium-btn"),
  stats: $<HTMLDivElement>("#stats"),
  openOptions: $<HTMLAnchorElement>("#open-options"),
};

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function fetchStatus(): Promise<TabStatus | null> {
  const tabId = await activeTabId();
  if (tabId === undefined) return null;
  try {
    const r = await sendToTab(tabId, { kind: "tab.getStatus" });
    if (r.kind === "tab.status" && r.ok) return r.status;
  } catch {
    // Content script not loaded on this URL (chrome://, file://, etc.)
  }
  return null;
}

async function refresh(): Promise<void> {
  const [config, secrets, status] = await Promise.all([
    getConfig(),
    getSecrets(),
    fetchStatus(),
  ]);

  els.lang.textContent = config.targetLang;

  if (!secrets.apiKey) {
    els.status.textContent = "Set your API key in Settings to begin.";
    els.translateBtn.disabled = true;
    els.translateBtn.textContent = "Translate this page";
    els.toggleRow.hidden = true;
    els.premiumBtn.hidden = true;
    els.stats.hidden = true;
    return;
  }

  if (!status) {
    els.status.textContent = "BorderBrowser can't run on this page.";
    els.translateBtn.disabled = true;
    return;
  }

  if (status.busy) {
    els.status.textContent = "Translating…";
    els.translateBtn.disabled = true;
    els.translateBtn.textContent = "Translating…";
    return;
  }

  els.translateBtn.disabled = false;

  if (status.translated) {
    const showing = status.showing;
    els.toggleRow.hidden = false;
    els.premiumBtn.hidden = false;
    els.translateBtn.textContent = "Re-translate this page";
    els.status.textContent =
      showing === "translated"
        ? `Translated to ${config.targetLang}.`
        : `Showing original. Toggle to view ${config.targetLang}.`;
    els.showOrig.classList.toggle("active", showing === "original");
    els.showTrans.classList.toggle("active", showing === "translated");
    if (status.lastStats) {
      const s = status.lastStats;
      els.stats.hidden = false;
      els.stats.textContent =
        `${s.units} blocks · ${s.elapsedMs} ms · ` +
        `${s.inputTokens.toLocaleString()} in / ${s.outputTokens.toLocaleString()} out tokens`;
    }
  } else {
    els.toggleRow.hidden = true;
    els.premiumBtn.hidden = true;
    els.stats.hidden = true;
    els.translateBtn.textContent = "Translate this page";
    els.status.textContent = `Click below to translate to ${config.targetLang}.`;
  }
}

async function withTab(action: (tabId: number) => Promise<unknown>): Promise<void> {
  const tabId = await activeTabId();
  if (tabId === undefined) return;
  await action(tabId);
  await refresh();
}

els.translateBtn.addEventListener("click", () =>
  withTab((id) => sendToTab(id, { kind: "tab.translatePage" })),
);

els.premiumBtn.addEventListener("click", () =>
  withTab((id) => sendToTab(id, { kind: "tab.translatePage", usePremium: true })),
);

els.showOrig.addEventListener("click", () =>
  withTab((id) => sendToTab(id, { kind: "tab.showOriginal" })),
);

els.showTrans.addEventListener("click", () =>
  withTab((id) => sendToTab(id, { kind: "tab.showTranslated" })),
);

els.openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

void refresh();
