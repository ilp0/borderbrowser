import { decodeText } from "../placeholders.ts";
import { isRtl } from "../rtl.ts";
import type { PlaceholderInfo } from "../types.ts";

/** Optional knobs that affect how a translated element is written back. */
export type ApplyOptions = {
  /**
   * Target language for the translation, e.g. "ar", "he-IL", "Arabic",
   * "فارسی". When this resolves to an RTL language (see `isRtl`), the
   * element gets `dir="rtl"` so punctuation, bullets, and bidi-neutral
   * characters flow the right way.
   *
   * Inline LTR runs (URLs, code spans, numbers) still appear LTR — they
   * round-trip through placeholders untouched and the Unicode bidi
   * algorithm handles the local direction inside an RTL block.
   */
  targetLang?: string;
};

/**
 * Splice a translated string back into a live DOM element.
 *
 * Decodes placeholder markers into HTML, then replaces the element's children
 * via `innerHTML`. Note: this destroys any event handlers attached to existing
 * descendants. For pure-content pages this is fine; SPAs will usually re-render
 * on next state change anyway. A future refinement can re-use the original
 * element nodes for inline placeholders to preserve handlers.
 *
 * When `targetLang` is provided, the element's `lang` attribute is set to that
 * BCP 47 code so screen readers pronounce the new text correctly.
 */
export function applyTranslation(
  element: Element,
  translatedText: string,
  placeholders: Map<number, PlaceholderInfo>,
  options?: ApplyOptions,
): void {
  const html = decodeText(translatedText, placeholders);
  element.innerHTML = html;
  if (options?.targetLang) {
    element.setAttribute("lang", options.targetLang);
    if (isRtl(options.targetLang)) {
      element.setAttribute("dir", "rtl");
    }
  }
}

/**
 * Apply many translations in one synchronous pass — important for the
 * "atomic swap" UX guarantee: the user must never see a half-translated page.
 *
 * Call this only after ALL translations for a unit batch have arrived.
 */
export function applyTranslationsBatch(
  entries: Array<{
    element: Element;
    translatedText: string;
    placeholders: Map<number, PlaceholderInfo>;
  }>,
  options?: ApplyOptions,
): void {
  // Hoist the language check out of the per-element loop.
  const setDir = !!options?.targetLang && isRtl(options.targetLang);
  const setLang = options?.targetLang;
  for (const { element, translatedText, placeholders } of entries) {
    const html = decodeText(translatedText, placeholders);
    element.innerHTML = html;
    if (setLang) element.setAttribute("lang", setLang);
    if (setDir) element.setAttribute("dir", "rtl");
  }
}
