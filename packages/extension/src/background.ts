/**
 * Background service worker.
 *
 * Holds the API key (lives in chrome.storage.local, fetched on demand).
 * Receives translation requests from content scripts, calls the user's
 * configured OpenAI-compatible endpoint via the translator package,
 * returns translations.
 *
 * MV3 service workers sleep after ~30s idle, so we keep no in-memory state —
 * every message handler reads config fresh.
 */

import { translateUnits } from "@borderbrowser/translator/browser";
import {
  getConfig,
  getRuntimeConfig,
  getSecrets,
  setConfig,
  setSecrets,
} from "./lib/config.ts";
import type { BgRequest, BgResponse } from "./lib/messages.ts";

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Open options page on first install so the user can paste their API key.
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener(
  (req: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
    handleMessage(req)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({
          kind: "error",
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return true; // keep channel open for async response
  },
);

async function handleMessage(req: BgRequest): Promise<BgResponse> {
  switch (req.kind) {
    case "bg.translate": {
      if (!req.apiKey) {
        return {
          kind: "error",
          ok: false,
          message: "No API key configured. Open BorderBrowser options and paste a key.",
        };
      }
      const result = await translateUnits(
        req.units.map((u) => ({
          ...u,
          placeholders: new Map(),
        })),
        {
          targetLang: req.targetLang,
          tone: req.tone,
          model: req.model,
          apiKey: req.apiKey,
          baseUrl: req.baseUrl,
          siteName: "BorderBrowser",
        },
      );

      const translations: { id: number; text: string }[] = [];
      for (const [id, text] of result.translated) translations.push({ id, text });
      return {
        kind: "bg.translateResult",
        ok: true,
        translations,
        stats: {
          units: req.units.length,
          batches: result.stats.batches,
          inputTokens: result.stats.inputTokens,
          outputTokens: result.stats.outputTokens,
          cachedInputTokens: result.stats.cachedInputTokens,
          elapsedMs: 0,
        },
      };
    }

    case "bg.getConfig": {
      const config = await getConfig();
      return { kind: "bg.config", ok: true, config };
    }

    case "bg.setConfig": {
      const config = await setConfig(req.patch);
      return { kind: "bg.config", ok: true, config };
    }

    case "bg.getSecrets": {
      const secrets = await getSecrets();
      return { kind: "bg.secrets", ok: true, secrets };
    }

    case "bg.setSecrets": {
      const secrets = await setSecrets(req.patch);
      return { kind: "bg.secrets", ok: true, secrets };
    }
  }

  // Unreachable — exhaustiveness check
  const _exhaustive: never = req;
  void _exhaustive;
  return { kind: "error", ok: false, message: "Unknown message kind" };
}

// Keep TS happy about the runtime config helper being used somewhere.
void getRuntimeConfig;
