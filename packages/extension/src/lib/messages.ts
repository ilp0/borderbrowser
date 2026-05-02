/**
 * Typed message protocol between content scripts, popup, options, and the
 * background service worker.
 *
 * Convention: each message has a `kind` string namespaced by the recipient
 * ("bg.*" goes to the service worker, "tab.*" goes to a tab's content script).
 * Responses always include a discriminating `ok` / `error` field.
 */

import type { Config, Secrets } from "./config.ts";

export type SerializedUnit = {
  id: number;
  kind: string;
  text: string;
};

export type BgRequest =
  | {
      kind: "bg.translate";
      targetLang: string;
      model: string;
      baseUrl: string;
      apiKey: string;
      units: SerializedUnit[];
    }
  | { kind: "bg.getConfig" }
  | { kind: "bg.setConfig"; patch: Partial<Config> }
  | { kind: "bg.getSecrets" }
  | { kind: "bg.setSecrets"; patch: Partial<Secrets> };

export type BgResponse =
  | {
      kind: "bg.translateResult";
      ok: true;
      translations: { id: number; text: string }[];
      stats: {
        units: number;
        batches: number;
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
        elapsedMs: number;
      };
    }
  | { kind: "bg.config"; ok: true; config: Config }
  | { kind: "bg.secrets"; ok: true; secrets: Secrets }
  | { kind: "error"; ok: false; message: string };

export type TabRequest =
  | { kind: "tab.translatePage"; usePremium?: boolean }
  | { kind: "tab.showOriginal" }
  | { kind: "tab.showTranslated" }
  | { kind: "tab.getStatus" };

export type TabStatus = {
  /** Has this tab been translated yet? */
  translated: boolean;
  /** Currently displaying translated text? (false = original visible) */
  showing: "original" | "translated";
  /** Last translation stats. */
  lastStats?: {
    units: number;
    elapsedMs: number;
    inputTokens: number;
    outputTokens: number;
  };
  /** Any in-progress translation? */
  busy: boolean;
};

export type TabResponse =
  | { kind: "tab.status"; ok: true; status: TabStatus }
  | { kind: "tab.ack"; ok: true }
  | { kind: "error"; ok: false; message: string };

export async function sendToBg(req: BgRequest): Promise<BgResponse> {
  return await chrome.runtime.sendMessage(req);
}

export async function sendToTab(tabId: number, req: TabRequest): Promise<TabResponse> {
  return await chrome.tabs.sendMessage(tabId, req);
}
