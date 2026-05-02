import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { isBlock, isSkip } from "./dom.ts";
import { encodeChildren } from "./placeholders.ts";
import type { TranslationUnit } from "./types.ts";

/**
 * Walk a parsed document and produce a flat list of translation units, each
 * one being a leaf-block element (a block-level element with only inline
 * descendants).
 *
 * Containers (block elements with block descendants) are descended into; their
 * children are visited as separate units.
 *
 * Returns the units along with a map back to the live DOM elements, so the
 * caller can splice translated HTML back in place after calling the LLM.
 */
export function extractUnits(
  $: CheerioAPI,
): { units: TranslationUnit[]; refs: Map<number, Element> } {
  const units: TranslationUnit[] = [];
  const refs = new Map<number, Element>();
  let nextId = 1;

  const root = $.root().get(0);
  if (!root) return { units, refs };

  const visit = (node: AnyNode): void => {
    if (node.type !== "tag") return;
    const el = node as Element;
    const tag = el.name.toLowerCase();

    if (isSkip(tag)) return;

    // Container — has block-level descendants. Recurse only.
    if (hasBlockDescendant(el)) {
      for (const child of el.children) visit(child);
      return;
    }

    // Leaf — translate this element if it has any visible text.
    if (!hasNonWhitespaceText(el)) return;

    const { text, placeholders } = encodeChildren($, el);
    if (!text.trim()) return;

    const id = nextId++;
    units.push({ id, kind: tag, text, placeholders });
    refs.set(id, el);
  };

  for (const child of root.children) visit(child);

  return { units, refs };
}

function hasBlockDescendant(el: Element): boolean {
  for (const child of el.children) {
    if (child.type !== "tag") continue;
    const tag = (child as Element).name.toLowerCase();
    if (isSkip(tag)) continue;
    if (isBlock(tag)) return true;
    if (hasBlockDescendant(child as Element)) return true;
  }
  return false;
}

function hasNonWhitespaceText(el: Element): boolean {
  for (const child of el.children) {
    if (child.type === "text" && child.data.trim().length > 0) return true;
    if (child.type === "tag" && hasNonWhitespaceText(child as Element)) {
      return true;
    }
  }
  return false;
}
