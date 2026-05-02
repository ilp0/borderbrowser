/**
 * Browser-only entry point for the translator package.
 *
 * Imported from the extension content script and service worker. Excludes
 * Node-only code (cheerio, fs, the CLI). The placeholder protocol is identical
 * to the Node version so units encoded here can be sent through the same
 * `translateUnits()` LLM caller and the same `decodeText()` decoder.
 */

export { decodeText } from "../placeholders.ts";
export { extractFromDom, encodeFromLiveDom } from "./extract-live.ts";
export type { LiveExtractResult } from "./extract-live.ts";
export { applyTranslation, applyTranslationsBatch } from "./apply.ts";
export {
  extractJsonLd,
  applyJsonLdTranslations,
  snapshotJsonLdOriginals,
} from "./extract-jsonld.ts";
export type { JsonLdExtractResult } from "./extract-jsonld.ts";
export {
  translateUnits,
  DEFAULT_MODEL,
  type BatchUsage,
  type TranslateUnitsResult,
} from "../translate.ts";
export type {
  PlaceholderInfo,
  TranslationUnit,
  TranslateOptions,
  TranslateResult,
} from "../types.ts";
