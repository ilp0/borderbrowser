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
export { extractAttrsFromDom } from "./extract-attrs.ts";
export type { AttrRef, AttrExtractResult } from "./extract-attrs.ts";
export { applyAttrTranslation, applyAttrTranslationsBatch } from "./apply-attrs.ts";
export type {
  PlaceholderInfo,
  TranslationUnit,
} from "../types.ts";
