/**
 * Hover-peek original.
 *
 * After translation, hovering a translated leaf-block for 400ms fades in the
 * original text in subdued type just below the translation. Move away → fades
 * out. No click required, no DOM mutation of the translated element itself
 * (atomic-swap is sacred — peek lives in a sibling overlay anchored by
 * getBoundingClientRect, not nested in the translated node).
 *
 * The peek uses a single `<bb-peek>` web component with a closed shadow root
 * so the host page's CSS can never reach in.
 */
const HOVER_DELAY_MS = 400;
const FADE_MS = 180;
const PEEK_TAG = "bb-peek-host";

/** Per-element original innerHTML, used to render the peek panel. */
const originals: WeakMap<Element, string> = new WeakMap();
/** Per-element listener bookkeeping so we can remove cleanly on detach. */
const tracked: WeakMap<Element, { onEnter: (e: Event) => void; onLeave: (e: Event) => void }> = new WeakMap();

let peekHost: HTMLElement | null = null;
let peekShadow: ShadowRoot | null = null;
let peekPanel: HTMLElement | null = null;
let activeFor: Element | null = null;
let pendingTimer: number | null = null;
let scrollListenerAttached = false;

/** Attach hover-peek to a translated leaf-block. Idempotent per element. */
export function attachPeek(el: Element, originalHtml: string): void {
  originals.set(el, originalHtml);
  if (tracked.has(el)) return;

  const onEnter = (): void => scheduleShow(el);
  const onLeave = (): void => cancelOrHide(el);
  el.addEventListener("mouseenter", onEnter);
  el.addEventListener("mouseleave", onLeave);
  tracked.set(el, { onEnter, onLeave });
}

/** Remove hover-peek listeners (e.g. when toggling back to original view). */
export function detachAll(elements: Iterable<Element>): void {
  for (const el of elements) {
    const t = tracked.get(el);
    if (!t) continue;
    el.removeEventListener("mouseenter", t.onEnter);
    el.removeEventListener("mouseleave", t.onLeave);
    tracked.delete(el);
  }
  hidePeek();
}

function scheduleShow(el: Element): void {
  if (!originals.has(el)) return;
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  // If the peek is already showing for a different element, hide first so the
  // user sees the new one fade in cleanly.
  if (activeFor && activeFor !== el) hidePeek();

  const delay = isReducedMotion() ? 0 : HOVER_DELAY_MS;
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    showPeek(el);
  }, delay);
}

function cancelOrHide(el: Element): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (activeFor === el) hidePeek();
}

function showPeek(el: Element): void {
  const original = originals.get(el);
  if (!original) return;
  ensurePeekHost();
  if (!peekPanel || !peekShadow) return;

  const content = peekShadow.getElementById("content");
  if (content) content.innerHTML = original;

  positionPeek(el);
  activeFor = el;
  peekPanel.classList.add("show");
  attachScrollListener();
}

function hidePeek(): void {
  if (!peekPanel) return;
  peekPanel.classList.remove("show");
  activeFor = null;
}

function positionPeek(el: Element): void {
  if (!peekPanel) return;
  const rect = el.getBoundingClientRect();
  // Anchor below the translated block, left-aligned with it. Width matches
  // the host element so subdued text reads at the same measure as the
  // translation above it.
  const top = rect.bottom + window.scrollY + 4;
  const left = rect.left + window.scrollX;
  peekPanel.style.top = `${Math.round(top)}px`;
  peekPanel.style.left = `${Math.round(left)}px`;
  peekPanel.style.width = `${Math.round(rect.width)}px`;
}

function attachScrollListener(): void {
  if (scrollListenerAttached) return;
  // Hide on scroll/resize — the absolute-positioned anchor would otherwise
  // drift away from the translated block. Cheaper than re-positioning on
  // every scroll tick, and the user will re-hover to bring it back.
  window.addEventListener("scroll", hidePeek, { passive: true });
  window.addEventListener("resize", hidePeek, { passive: true });
  scrollListenerAttached = true;
}

function ensurePeekHost(): void {
  if (peekHost) return;
  peekHost = document.createElement(PEEK_TAG);
  // Host element itself is an anchor we never style; the panel inside the
  // shadow root carries the position and styles.
  document.documentElement.appendChild(peekHost);
  peekShadow = peekHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel {
      position: absolute;
      z-index: 2147483646;
      box-sizing: border-box;
      padding: 6px 10px;
      margin-top: 2px;
      border-left: 2px solid rgba(120,120,120,0.35);
      background: transparent;
      color: rgba(60,60,60,0.78);
      font-style: italic;
      font-size: 0.85em;
      line-height: 1.4;
      pointer-events: none;
      opacity: 0;
      transition: opacity ${FADE_MS}ms ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", Roboto, sans-serif;
    }
    .panel.show { opacity: 1; }
    @media (prefers-reduced-motion: reduce) {
      .panel { transition: none; }
    }
    @media (prefers-color-scheme: dark) {
      .panel {
        color: rgba(220,220,220,0.78);
        border-left-color: rgba(180,180,180,0.35);
      }
    }
  `;

  const panel = document.createElement("div");
  panel.className = "panel";
  const content = document.createElement("div");
  content.id = "content";
  panel.append(content);
  peekShadow.append(style, panel);
  peekPanel = panel;
}

function isReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
