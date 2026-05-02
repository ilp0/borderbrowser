/**
 * Options page logic: load current config + secrets, save updates,
 * provide provider quick-switch chips for the base URL.
 */
import { formatGlossaryText, parseGlossaryText } from "@borderbrowser/translator";
import {
  DEFAULT_CONFIG,
  getConfig,
  getSecrets,
  setConfig,
  setSecrets,
} from "../lib/config.ts";

const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector<T>(sel) as T;

const els = {
  baseUrl: $<HTMLInputElement>("#baseUrl"),
  apiKey: $<HTMLInputElement>("#apiKey"),
  revealKey: $<HTMLButtonElement>("#reveal-key"),
  targetLang: $<HTMLInputElement>("#targetLang"),
  model: $<HTMLInputElement>("#model"),
  premiumModel: $<HTMLInputElement>("#premiumModel"),
  glossary: $<HTMLTextAreaElement>("#glossary"),
  save: $<HTMLButtonElement>("#save"),
  saved: $<HTMLSpanElement>("#saved"),
  chips: document.querySelectorAll<HTMLButtonElement>(".chip"),
};

async function load(): Promise<void> {
  const [cfg, sec] = await Promise.all([getConfig(), getSecrets()]);
  els.baseUrl.value = cfg.baseUrl;
  els.apiKey.value = sec.apiKey;
  els.targetLang.value = cfg.targetLang;
  els.model.value = cfg.model;
  els.premiumModel.value = cfg.premiumModel;
  els.glossary.value = formatGlossaryText(cfg.glossary);
  syncActiveChip();
}

function syncActiveChip(): void {
  for (const c of Array.from(els.chips)) {
    c.classList.toggle("active", c.dataset.base === els.baseUrl.value.trim());
  }
}

for (const chip of Array.from(els.chips)) {
  chip.addEventListener("click", () => {
    els.baseUrl.value = chip.dataset.base ?? "";
    syncActiveChip();
  });
}

els.baseUrl.addEventListener("input", syncActiveChip);

els.revealKey.addEventListener("click", () => {
  if (els.apiKey.type === "password") {
    els.apiKey.type = "text";
    els.revealKey.textContent = "hide";
  } else {
    els.apiKey.type = "password";
    els.revealKey.textContent = "show";
  }
});

els.save.addEventListener("click", async () => {
  const baseUrl = els.baseUrl.value.trim() || DEFAULT_CONFIG.baseUrl;
  const targetLang = els.targetLang.value.trim() || DEFAULT_CONFIG.targetLang;
  const model = els.model.value.trim() || DEFAULT_CONFIG.model;
  const premiumModel = els.premiumModel.value.trim() || DEFAULT_CONFIG.premiumModel;
  const glossary = parseGlossaryText(els.glossary.value);
  const apiKey = els.apiKey.value.trim();

  await Promise.all([
    setConfig({ baseUrl, targetLang, model, premiumModel, glossary }),
    setSecrets({ apiKey }),
  ]);

  // Request host permission for the configured base URL host so the SW
  // can fetch from it. (Only relevant for non-default hosts.)
  try {
    const url = new URL(baseUrl);
    const origin = `${url.protocol}//${url.host}/*`;
    await chrome.permissions.request({ origins: [origin] }).catch(() => undefined);
  } catch {
    // ignore
  }

  els.saved.hidden = false;
  setTimeout(() => {
    els.saved.hidden = true;
  }, 1800);
});

void load();
