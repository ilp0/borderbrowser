import { decodeText } from "../placeholders.ts";
import type { PlaceholderInfo } from "../types.ts";

/**
 * Splice a translated string back into a live DOM element.
 *
 * Decodes placeholder markers into HTML, then replaces the element's children
 * via `innerHTML`. Note: this destroys any event handlers attached to existing
 * descendants. For pure-content pages this is fine; SPAs will usually re-render
 * on next state change anyway. A future refinement can re-use the original
 * element nodes for inline placeholders to preserve handlers.
 */
export function applyTranslation(
  element: Element,
  translatedText: string,
  placeholders: Map<number, PlaceholderInfo>,
): void {
  const html = decodeText(translatedText, placeholders);
  element.innerHTML = html;
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
): void {
  for (const { element, translatedText, placeholders } of entries) {
    applyTranslation(element, translatedText, placeholders);
  }
}
