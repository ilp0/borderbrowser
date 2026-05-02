/**
 * Walk a live DOM and yield translation units for user-facing attribute strings.
 *
 * Block-level text extraction lives in `extract-live.ts`; this module covers
 * everything that text-walking misses:
 *   - HTML attributes that hold human-readable strings (alt, title, placeholder,
 *     aria-label, aria-description, and `value` on submit/button inputs).
 *   - <meta> tags that surface to users via search engines and link previews
 *     (name="description", OpenGraph, Twitter Card).
 *
 * The output is an array of `TranslationUnit`s with `kind: "attr"` and an empty
 * placeholder map — attribute strings never contain inline HTML. The companion
 * `apply-attrs.ts` writes translated values back via `setAttribute`.
 */
import type { TranslationUnit } from "../types.ts";

export type AttrRef = {
  element: Element;
  attrName: string;
  originalValue: string;
};

export type AttrExtractResult = {
  units: TranslationUnit[];
  /** Live element + attrName references, keyed by unit id, used to write translations back. */
  refs: Map<number, AttrRef>;
};

/**
 * Generic element attributes whose values are user-visible strings worth
 * translating. Order doesn't matter for correctness but is preserved for tests.
 */
const TEXT_ATTRS: readonly string[] = [
  "alt",
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
];

/**
 * `<meta name="...">` and `<meta property="...">` keys whose `content` is
 * user-facing (search snippets, link previews). Lowercased for matching.
 */
const META_NAME_KEYS = new Set([
  "description",
  "twitter:title",
  "twitter:description",
]);
const META_PROPERTY_KEYS = new Set([
  "og:title",
  "og:description",
]);

/**
 * Tags whose subtrees we never want to walk for attributes — their contents
 * aren't user-visible and walking them would be wasted work. This is narrower
 * than the text-extraction skip set: `<input>` is skipped for text but NOT for
 * attrs (we DO want to translate its `placeholder`).
 */
const ATTR_SKIP = new Set([
  "script",
  "style",
  "noscript",
  "template",
]);

export function extractAttrsFromDom(
  root: Element,
  startId = 1,
): AttrExtractResult {
  const units: TranslationUnit[] = [];
  const refs = new Map<number, AttrRef>();
  let nextId = startId;

  const visit = (el: Element): void => {
    const tag = el.tagName.toLowerCase();
    if (ATTR_SKIP.has(tag)) return;

    for (const { attrName, value } of attrsFor(el, tag)) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const id = nextId++;
      units.push({ id, kind: "attr", text: value, placeholders: new Map() });
      refs.set(id, { element: el, attrName, originalValue: value });
    }

    for (const child of Array.from(el.children)) visit(child);
  };

  visit(root);
  return { units, refs };
}

/**
 * Yield every translatable attribute on a single element. Centralised here so
 * the callers don't sprinkle tag-specific logic.
 */
function attrsFor(
  el: Element,
  tag: string,
): Array<{ attrName: string; value: string }> {
  const out: Array<{ attrName: string; value: string }> = [];

  for (const name of TEXT_ATTRS) {
    if (el.hasAttribute(name)) {
      out.push({ attrName: name, value: el.getAttribute(name) ?? "" });
    }
  }

  if (tag === "input") {
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if ((type === "submit" || type === "button") && el.hasAttribute("value")) {
      out.push({ attrName: "value", value: el.getAttribute("value") ?? "" });
    }
  }

  if (tag === "meta" && el.hasAttribute("content")) {
    const name = (el.getAttribute("name") ?? "").toLowerCase();
    const property = (el.getAttribute("property") ?? "").toLowerCase();
    if (META_NAME_KEYS.has(name) || META_PROPERTY_KEYS.has(property)) {
      out.push({ attrName: "content", value: el.getAttribute("content") ?? "" });
    }
  }

  return out;
}
