/**
 * Reading mode.
 *
 * A toggleable, Readability-style mode that:
 *   - Picks the most likely article element (`<article>` → `<main>` → biggest
 *     text-density block) and tags it with `data-bb-reading-root`.
 *   - Hides the siblings of that element (and of its ancestors up to <body>),
 *     so sidebars / ads / nav chrome collapse out of view.
 *   - Injects a small stylesheet that gives the article comfortable serif
 *     typography, a centered max-width, and a generous line-height.
 *
 * We deliberately do NOT reformat the article (no DOM moves, no rewrites),
 * matching BorderBrowser's atomic-swap rule: enable() applies the styling in
 * one shot, disable() reverts it cleanly.
 */
const STYLE_ID = "__bb_reading_style__";
const ROOT_ATTR = "data-bb-reading-root";
const HIDDEN_ATTR = "data-bb-reading-hidden";

const STYLESHEET = `
  [${ROOT_ATTR}] {
    font-family: Georgia, "Iowan Old Style", "Source Serif Pro", serif !important;
    line-height: 1.7 !important;
    max-width: 38rem !important;
    margin: 2.5rem auto !important;
    padding: 0 1rem !important;
    font-size: 1.0625rem !important;
    color: #1a1a1a !important;
    background: #fffefb !important;
  }
  [${ROOT_ATTR}] p,
  [${ROOT_ATTR}] li,
  [${ROOT_ATTR}] blockquote {
    line-height: 1.7 !important;
  }
  [${ROOT_ATTR}] img,
  [${ROOT_ATTR}] figure,
  [${ROOT_ATTR}] video {
    max-width: 100% !important;
    height: auto !important;
  }
  [${HIDDEN_ATTR}] {
    display: none !important;
  }
  html:has([${ROOT_ATTR}]) {
    background: #fffefb !important;
  }
`;

/** Pick the most likely article element. */
function findArticleRoot(): Element | null {
  const article = document.querySelector("article");
  if (article && hasMeaningfulText(article)) return article;

  const main = document.querySelector("main");
  if (main && hasMeaningfulText(main)) return main;

  // Fall back to the largest text-density block: among block-level elements,
  // pick the one with the most direct paragraph text.
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "div, section, .content, .post, .article, .entry",
    ),
  );
  let best: { el: Element; score: number } | null = null;
  for (const el of candidates) {
    const score = textDensityScore(el);
    if (!best || score > best.score) best = { el, score };
  }
  if (best && best.score > 200) return best.el;

  // Last resort: the body itself (mode still applies typography, no hiding).
  return document.body;
}

function hasMeaningfulText(el: Element): boolean {
  return (el.textContent ?? "").trim().length > 200;
}

/**
 * Score = sum of (length of <p> textContent) − penalty for many links.
 * Mirrors the well-known Readability heuristic in miniature.
 */
function textDensityScore(el: Element): number {
  const ps = el.querySelectorAll("p");
  let score = 0;
  for (const p of ps) {
    const txt = (p.textContent ?? "").trim();
    if (txt.length < 25) continue;
    score += txt.length;
  }
  const links = el.querySelectorAll("a");
  const linkText = Array.from(links).reduce(
    (n, a) => n + (a.textContent ?? "").length,
    0,
  );
  const total = (el.textContent ?? "").length || 1;
  const linkDensity = linkText / total;
  if (linkDensity > 0.35) score *= 0.5;
  return score;
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
}

function removeStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
}

/**
 * Hide every sibling of `node` and its ancestors up to `<body>`. The article
 * itself, and its container chain, stay visible. This is the readability
 * "collapse the chrome" effect.
 */
function hideSiblingsOfChain(node: Element): void {
  let cur: Element = node;
  while (cur !== document.body) {
    const parent: HTMLElement | null = cur.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === cur) continue;
      if (sibling instanceof HTMLElement) {
        sibling.setAttribute(HIDDEN_ATTR, "");
      }
    }
    cur = parent;
  }
}

function unhideAll(): void {
  for (const el of Array.from(document.querySelectorAll(`[${HIDDEN_ATTR}]`))) {
    el.removeAttribute(HIDDEN_ATTR);
  }
}

/** Idempotent: enabling twice is a no-op. */
export function enable(): boolean {
  if (isEnabled()) return true;
  const root = findArticleRoot();
  if (!root) return false;

  // Compute everything before mutating, so the swap is atomic (one paint).
  ensureStyle();
  root.setAttribute(ROOT_ATTR, "");
  hideSiblingsOfChain(root);
  return true;
}

export function disable(): void {
  for (const el of Array.from(document.querySelectorAll(`[${ROOT_ATTR}]`))) {
    el.removeAttribute(ROOT_ATTR);
  }
  unhideAll();
  removeStyle();
}

export function isEnabled(): boolean {
  return document.querySelector(`[${ROOT_ATTR}]`) !== null;
}

export function toggle(): boolean {
  if (isEnabled()) {
    disable();
    return false;
  }
  return enable();
}
