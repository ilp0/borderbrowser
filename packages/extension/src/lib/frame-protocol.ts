/**
 * Cross-frame postMessage protocol stub for BorderBrowser.
 *
 * Same-origin iframes are handled by the content script being injected
 * into every frame (`all_frames: true` in the manifest); each frame runs
 * an independent instance and talks to the background SW directly.
 *
 * Cross-origin iframes can't share a chrome.runtime port that the parent
 * controls — the same-origin policy keeps frames apart, so the parent
 * cannot reach into the child to mutate its DOM, and the child can't see
 * the parent's. Eventually we'll coordinate via window.postMessage: the
 * parent broadcasts a translate request, each child frame that has the
 * extension installed handles its own DOM and reports back when its swap
 * is complete. That coordination layer is future work; this file is the
 * type-stable wire format and a strict-targetOrigin sender/listener pair
 * so we can wire it in without re-shaping the protocol later.
 *
 * Privacy: page content NEVER travels through postMessage. Only control
 * signals (a translate request, a status acknowledgement) cross the frame
 * boundary. Each frame extracts and translates its own DOM, so cross-
 * origin iframes never leak content to their parents (and vice versa).
 *
 * The `targetOrigin` argument to postMessage MUST be set to the specific
 * origin the message is intended for — never `"*"` — so a malicious frame
 * (or one navigated mid-flight) cannot intercept the signal.
 */

export const BB_FRAME_MSG_VERSION = 1;

/** Translate-request signal sent parent → child. */
export type FrameTranslateRequest = {
  type: "bb-translate-request";
  v: typeof BB_FRAME_MSG_VERSION;
  /** Target language (display name, e.g. "English", "Suomi"). */
  lang: string;
  /** Whether the user clicked the premium button. */
  usePremium?: boolean;
  /** Opaque correlation id; the response echoes it back. */
  requestId: string;
};

/** Acknowledgement signal sent child → parent. */
export type FrameTranslateResponse = {
  type: "bb-translate-response";
  v: typeof BB_FRAME_MSG_VERSION;
  requestId: string;
  /** Did the child frame complete its swap? */
  ok: boolean;
  /** Optional human-readable reason when ok === false. */
  reason?: string;
};

export type FrameMessage = FrameTranslateRequest | FrameTranslateResponse;

export function isFrameMessage(data: unknown): data is FrameMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as { type?: unknown; v?: unknown };
  if (d.v !== BB_FRAME_MSG_VERSION) return false;
  return d.type === "bb-translate-request" || d.type === "bb-translate-response";
}

export function isFrameTranslateRequest(
  data: unknown,
): data is FrameTranslateRequest {
  return isFrameMessage(data) && data.type === "bb-translate-request";
}

/**
 * Post a translate request to a child frame. `targetOrigin` MUST be the
 * exact origin of the iframe (read from the iframe element's `src`).
 * Passing `"*"` is rejected — that would broadcast intent to any origin
 * the iframe might have been navigated to, defeating the privacy goal.
 */
export function postFrameRequest(
  target: Window,
  targetOrigin: string,
  msg: FrameTranslateRequest,
): void {
  if (!targetOrigin || targetOrigin === "*") {
    throw new Error(
      "[BorderBrowser] frame-protocol: targetOrigin must be a specific origin",
    );
  }
  target.postMessage(msg, targetOrigin);
}

/**
 * Fan a translate request out to direct child iframes whose origin
 * differs from the parent's. Same-origin children already receive the
 * runtime `tab.translatePage` because the content script is registered
 * with `all_frames: true`; cross-origin children need this postMessage
 * path because the runtime bus does still reach them but a future
 * version may want explicit parent-orchestrated coordination (cancel
 * cascade, shared progress reporting).
 *
 * Today this is a stub: it constructs valid messages, skips frames
 * without a parseable src or matching origin, and never throws on a
 * single bad frame. The receiving side is the listener in `content.ts`.
 */
export function fanOutToCrossOriginIframes(args: {
  parentOrigin: string;
  iframes: Iterable<HTMLIFrameElement>;
  lang: string;
  usePremium?: boolean;
}): void {
  for (const iframe of args.iframes) {
    const src = iframe.getAttribute("src");
    if (!src) continue;
    let origin: string;
    try {
      origin = new URL(src, args.parentOrigin).origin;
    } catch {
      continue;
    }
    // Same-origin frames already get the runtime message via all_frames.
    if (origin === args.parentOrigin) continue;
    const cw = iframe.contentWindow;
    if (!cw) continue;
    try {
      postFrameRequest(cw, origin, {
        type: "bb-translate-request",
        v: BB_FRAME_MSG_VERSION,
        lang: args.lang,
        ...(args.usePremium !== undefined ? { usePremium: args.usePremium } : {}),
        requestId: `bb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
    } catch (err) {
      console.warn("[BorderBrowser] frame-protocol fan-out failed", err);
    }
  }
}

/**
 * Listen for incoming frame messages on the current window.
 *
 * Filters by:
 *   1. `event.source` is a Window we trust (caller decides — typically
 *      `window.parent` for child frames, or the iframe's contentWindow
 *      for parents).
 *   2. `event.origin` matches the `expectedOrigin` argument exactly.
 *      Wildcards are not allowed.
 *   3. The payload shape passes `isFrameMessage`.
 *
 * Returns an unsubscribe function.
 */
export function onFrameMessage(
  expectedOrigin: string,
  expectedSource: MessageEventSource | null,
  handler: (msg: FrameMessage, event: MessageEvent) => void,
): () => void {
  if (!expectedOrigin || expectedOrigin === "*") {
    throw new Error(
      "[BorderBrowser] frame-protocol: expectedOrigin must be a specific origin",
    );
  }
  const listener = (event: MessageEvent): void => {
    if (event.origin !== expectedOrigin) return;
    if (expectedSource && event.source !== expectedSource) return;
    if (!isFrameMessage(event.data)) return;
    handler(event.data, event);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
