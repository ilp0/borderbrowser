/**
 * Browser entry for code that runs in CONTENT SCRIPTS — no LLM calls.
 *
 * Content scripts only need DOM extraction + decoding; the actual LLM call
 * happens in the background service worker. Splitting these exports keeps the
 * content-script bundle small (no OpenAI SDK pulled in).
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
export type {
  PlaceholderInfo,
  TranslationUnit,
} from "../types.ts";
