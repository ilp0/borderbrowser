/**
 * Persistent extension configuration, stored in chrome.storage.sync (so it
 * roams with the user's browser profile). Only API keys live in chrome.storage.local
 * so they don't sync across devices.
 */

export type Config = {
  /** Base URL of an OpenAI-compatible chat-completions endpoint. */
  baseUrl: string;
  /** Default model id (e.g. anthropic/claude-haiku-4.5 on OpenRouter). */
  model: string;
  /** "Upgrade this page" model id (defaults to a stronger model). */
  premiumModel: string;
  /** Target language for translation (e.g. "English", "Suomi", "日本語"). */
  targetLang: string;
  /** Per-domain auto-translate flags. Domain → bool. */
  autoTranslateDomains: Record<string, boolean>;
  /** Hover-peek the original beneath each translated paragraph. Default on. */
  hoverPeek: boolean;
};

export type Secrets = {
  /** API key for the configured baseUrl. Never synced. */
  apiKey: string;
};

const SYNC_KEY = "config";
const LOCAL_KEY = "secrets";

export const DEFAULT_CONFIG: Config = {
  baseUrl: "https://openrouter.ai/api/v1",
  model: "anthropic/claude-haiku-4.5",
  premiumModel: "anthropic/claude-sonnet-4.6",
  targetLang: "English",
  autoTranslateDomains: {},
  hoverPeek: true,
};

export const DEFAULT_SECRETS: Secrets = {
  apiKey: "",
};

export async function getConfig(): Promise<Config> {
  const stored = await chrome.storage.sync.get(SYNC_KEY);
  return { ...DEFAULT_CONFIG, ...(stored[SYNC_KEY] ?? {}) };
}

export async function setConfig(patch: Partial<Config>): Promise<Config> {
  const current = await getConfig();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set({ [SYNC_KEY]: next });
  return next;
}

export async function getSecrets(): Promise<Secrets> {
  const stored = await chrome.storage.local.get(LOCAL_KEY);
  return { ...DEFAULT_SECRETS, ...(stored[LOCAL_KEY] ?? {}) };
}

export async function setSecrets(patch: Partial<Secrets>): Promise<Secrets> {
  const current = await getSecrets();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [LOCAL_KEY]: next });
  return next;
}

/** Convenience: fetch both at once for the background SW translation call. */
export async function getRuntimeConfig(): Promise<Config & Secrets> {
  const [c, s] = await Promise.all([getConfig(), getSecrets()]);
  return { ...c, ...s };
}
