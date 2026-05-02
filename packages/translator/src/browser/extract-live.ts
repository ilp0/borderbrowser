/**
 * Live-DOM equivalents of `extract.ts` and the encoding side of `placeholders.ts`.
 *
 * Used inside the extension's content script, where we work on the page's
 * actual DOM (not a cheerio-parsed copy). The placeholder format is identical
 * to the Node version, so the same `decodeText()` works on both sides.
 */
import { isBlock, isSkip, isVoid } from "../dom.ts";
import type { PlaceholderInfo, TranslationUnit } from "../types.ts";

export type LiveExtractResult = {
  units: TranslationUnit[];
  /** Live element references, keyed by unit id, used to splice translations back in. */
  refs: Map<number, Element>;
};

export function extractFromDom(root: Element): LiveExtractResult {
  const units: TranslationUnit[] = [];
  const refs = new Map<number, Element>();
  let nextId = 1;

  const visit = (node: Node): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (isSkip(tag)) return;

    // Pierce open shadow roots: walk shadow children first as a separate
    // sub-tree, then continue with the host's light-DOM children. Closed shadow
    // roots are inaccessible to scripts and gracefully skipped.
    const shadow = openShadowRoot(el);
    if (shadow) {
      for (const child of Array.from(shadow.childNodes)) visit(child);
    }

    if (isContainer(el)) {
      for (const child of Array.from(el.childNodes)) visit(child);
      return;
    }

    if (!hasNonWhitespaceText(el)) return;

    const { text, placeholders } = encodeFromLiveDom(el);
    if (!text.trim()) return;

    const id = nextId++;
    units.push({ id, kind: tag, text, placeholders });
    refs.set(id, el);
  };

  for (const child of Array.from(root.childNodes)) visit(child);
  return { units, refs };
}

/**
 * Return an element's shadow root if it is open, otherwise null.
 *
 * Closed shadow roots are intentionally inaccessible from outside scripts;
 * `el.shadowRoot` is null for them, so we cannot walk into closed shadow trees.
 */
function openShadowRoot(el: Element): ShadowRoot | null {
  const shadow = el.shadowRoot;
  if (shadow && shadow.mode === "open") return shadow;
  return null;
}

export function encodeFromLiveDom(el: Element): {
  text: string;
  placeholders: Map<number, PlaceholderInfo>;
} {
  const placeholders = new Map<number, PlaceholderInfo>();
  let nextId = 1;

  const visit = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const child = node as Element;
    const tag = child.tagName.toLowerCase();

    if (isSkip(tag)) {
      const id = nextId++;
      placeholders.set(id, { kind: "opaque", html: child.outerHTML });
      return `[${id}/]`;
    }

    if (isVoid(tag)) {
      const id = nextId++;
      placeholders.set(id, { kind: "void", tag, attrs: getAttribs(child) });
      return `[${id}/]`;
    }

    const id = nextId++;
    placeholders.set(id, { kind: "inline", tag, attrs: getAttribs(child) });
    let inner = "";
    for (const grand of Array.from(child.childNodes)) inner += visit(grand);
    return `[${id}]${inner}[/${id}]`;
  };

  let text = "";
  for (const child of Array.from(el.childNodes)) text += visit(child);
  return { text, placeholders };
}

/**
 * `el` should be recursed into rather than emitted as a single unit when its
 * subtree contains either a nested block element (the existing rule) or any
 * descendant hosting an open shadow root. The shadow case is needed because
 * an inline custom-element wrapper with no light children would otherwise be
 * skipped, hiding any translatable text its shadow tree carries.
 */
function isContainer(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    if (isSkip(tag)) continue;
    if (isBlock(tag)) return true;
    if (openShadowRoot(child)) return true;
    if (isContainer(child)) return true;
  }
  return false;
}

function hasNonWhitespaceText(el: Element): boolean {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "") {
      return true;
    }
    if (child.nodeType === Node.ELEMENT_NODE && hasNonWhitespaceText(child as Element)) {
      return true;
    }
  }
  return false;
}

function getAttribs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    out[attr.name.toLowerCase()] = attr.value;
  }
  return out;
}
