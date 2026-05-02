/**
 * Options page logic: load current config + secrets, save updates,
 * provide provider quick-switch chips for the base URL.
 */
import {
  DEFAULT_CONFIG,
  type Tone,
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
  save: $<HTMLButtonElement>("#save"),
  saved: $<HTMLSpanElement>("#saved"),
  chips: document.querySelectorAll<HTMLButtonElement>(".chip"),
  toneRadios: document.querySelectorAll<HTMLInputElement>(
    'input[name="tone"]',
  ),
};

const TONE_VALUES: ReadonlySet<Tone> = new Set(["formal", "neutral", "casual"]);

function getSelectedTone(): Tone {
  for (const r of Array.from(els.toneRadios)) {
    if (r.checked && TONE_VALUES.has(r.value as Tone)) {
      return r.value as Tone;
    }
  }
  return DEFAULT_CONFIG.tone;
}

function setSelectedTone(tone: Tone): void {
  for (const r of Array.from(els.toneRadios)) {
    r.checked = r.value === tone;
  }
}

async function load(): Promise<void> {
  const [cfg, sec] = await Promise.all([getConfig(), getSecrets()]);
  els.baseUrl.value = cfg.baseUrl;
  els.apiKey.value = sec.apiKey;
  els.targetLang.value = cfg.targetLang;
  els.model.value = cfg.model;
  els.premiumModel.value = cfg.premiumModel;
  setSelectedTone(cfg.tone);
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
  const apiKey = els.apiKey.value.trim();

  const tone = getSelectedTone();

  await Promise.all([
    setConfig({ baseUrl, targetLang, tone, model, premiumModel }),
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
