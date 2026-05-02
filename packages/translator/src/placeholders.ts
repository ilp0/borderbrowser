import type { AnyNode, Element } from "domhandler";
import type { CheerioAPI } from "cheerio";
import type { PlaceholderInfo } from "./types.ts";
import {
  attrsToString,
  escapeText,
  isSkip,
  isVoid,
} from "./dom.ts";

/**
 * Encode an element's children into a flat string with placeholder markers,
 * suitable for sending to a translation LLM.
 *
 * Example:
 *   <p>Read <a href="/x">more</a> here</p>
 *   →  text: "Read [1]more[/1] here"
 *      placeholders: { 1 → { kind:"inline", tag:"a", attrs:{href:"/x"} } }
 */
export function encodeChildren(
  $: CheerioAPI,
  el: Element,
): { text: string; placeholders: Map<number, PlaceholderInfo> } {
  const placeholders = new Map<number, PlaceholderInfo>();
  let nextId = 1;

  const visit = (node: AnyNode): string => {
    if (node.type === "text") {
      return node.data;
    }
    if (node.type !== "tag") {
      return "";
    }

    const tag = node.name.toLowerCase();

    if (isSkip(tag)) {
      const id = nextId++;
      placeholders.set(id, { kind: "opaque", html: $.html(node) });
      return `[${id}/]`;
    }

    if (isVoid(tag)) {
      const id = nextId++;
      placeholders.set(id, { kind: "void", tag, attrs: getAttribs(node) });
      return `[${id}/]`;
    }

    const id = nextId++;
    placeholders.set(id, { kind: "inline", tag, attrs: getAttribs(node) });
    let inner = "";
    for (const child of node.children) {
      inner += visit(child);
    }
    return `[${id}]${inner}[/${id}]`;
  };

  let text = "";
  for (const child of el.children) {
    text += visit(child);
  }
  return { text, placeholders };
}

/**
 * Decode a translated string (containing `[N]`, `[/N]`, `[N/]` markers) back
 * into HTML, using the placeholder map produced by `encodeChildren`.
 *
 * If the LLM dropped or duplicated a marker, missing placeholders are silently
 * skipped — preferring partial output over a hard failure.
 */
export function decodeText(
  text: string,
  placeholders: Map<number, PlaceholderInfo>,
): string {
  const markerRe = /\[(\d+)\/\]|\[(\d+)\]|\[\/(\d+)\]/g;
  let out = "";
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRe.exec(text)) !== null) {
    out += escapeText(text.slice(lastIdx, match.index));

    if (match[1] !== undefined) {
      const ph = placeholders.get(+match[1]);
      if (ph) {
        if (ph.kind === "opaque") {
          out += ph.html;
        } else if (ph.kind === "void") {
          out += `<${ph.tag}${attrsToString(ph.attrs)}>`;
        } else {
          out += `<${ph.tag}${attrsToString(ph.attrs)}></${ph.tag}>`;
        }
      }
    } else if (match[2] !== undefined) {
      const ph = placeholders.get(+match[2]);
      if (ph?.kind === "inline") {
        out += `<${ph.tag}${attrsToString(ph.attrs)}>`;
      } else if (ph?.kind === "void") {
        out += `<${ph.tag}${attrsToString(ph.attrs)}>`;
      }
    } else if (match[3] !== undefined) {
      const ph = placeholders.get(+match[3]);
      if (ph?.kind === "inline") {
        out += `</${ph.tag}>`;
      }
    }

    lastIdx = match.index + match[0].length;
  }
  out += escapeText(text.slice(lastIdx));
  return out;
}

function getAttribs(node: Element): Record<string, string> {
  const a = node.attribs;
  const out: Record<string, string> = {};
  if (a) {
    for (const k of Object.keys(a)) {
      out[k.toLowerCase()] = a[k]!;
    }
  }
  return out;
}
