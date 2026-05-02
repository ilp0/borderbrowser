/**
 * Tag classification for the placeholder protocol.
 *
 * - SKIP: never visited (script, style, technical content). Treated as opaque
 *   placeholders if encountered inside a translation unit.
 * - VOID: self-closing (br, img). Encoded as `[N/]`.
 * - BLOCK: each one is a candidate translation unit (or a container of them).
 * - everything else: inline → encoded as `[N]...[/N]` around translated children.
 */

export const SKIP_ELEMENTS = new Set([
  "script", "style", "noscript", "template",
  "code", "pre", "kbd", "samp", "var", "tt",
  "iframe", "object", "embed",
  "video", "audio", "canvas",
  "input", "textarea", "select",
  "svg", "math",
]);

export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

export const BLOCK_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "body",
  "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "html", "legend",
  "li", "main", "nav", "ol", "p", "section", "summary",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
  "title",
]);

export function isBlock(tag: string): boolean {
  return BLOCK_ELEMENTS.has(tag);
}

export function isVoid(tag: string): boolean {
  return VOID_ELEMENTS.has(tag);
}

export function isSkip(tag: string): boolean {
  return SKIP_ELEMENTS.has(tag);
}

const ATTR_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => ATTR_ESCAPE[c]!);
}

const TEXT_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => TEXT_ESCAPE[c]!);
}

export function attrsToString(attrs: Record<string, string>): string {
  const keys = Object.keys(attrs);
  if (keys.length === 0) return "";
  return keys.map((k) => ` ${k}="${escapeAttr(attrs[k]!)}"`).join("");
}
