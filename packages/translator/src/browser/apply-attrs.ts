/**
 * Write translated attribute values back to the live DOM.
 *
 * Companion to `extract-attrs.ts`. Attribute units carry no inline placeholders,
 * so the translated text is the final value — we just call `setAttribute`.
 *
 * Like `applyTranslationsBatch` for block text, the batch variant exists so the
 * extension's content script can splice every translated attribute in one
 * synchronous pass alongside block-text updates, preserving the atomic-swap UX.
 */
import type { AttrRef } from "./extract-attrs.ts";

export function applyAttrTranslation(
  element: Element,
  attrName: string,
  translatedValue: string,
): void {
  element.setAttribute(attrName, translatedValue);
}

export function applyAttrTranslationsBatch(
  entries: Array<{ ref: AttrRef; translatedValue: string }>,
): void {
  for (const { ref, translatedValue } of entries) {
    applyAttrTranslation(ref.element, ref.attrName, translatedValue);
  }
}
