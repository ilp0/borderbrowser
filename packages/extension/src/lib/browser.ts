/**
 * Cross-browser namespace shim.
 *
 * Exposes a unified `browser` object backed by webextension-polyfill.
 * On Firefox MV3, `globalThis.browser` already exists natively and the
 * polyfill is a thin pass-through. On Chrome MV3, the polyfill wraps
 * `chrome.*` callbacks into Promise-returning `browser.*` calls.
 *
 * We keep the existing `chrome.*` call sites untouched (they work on both
 * Firefox MV3 and Chrome MV3 with promises), and additionally guarantee
 * `globalThis.browser` is always defined so any future code can use either
 * namespace interchangeably.
 */
import browser from "webextension-polyfill";

// Make the `browser` namespace available globally for any consumers that
// prefer it. On Firefox this is a no-op (already defined); on Chrome this
// installs the polyfilled wrapper.
if (typeof (globalThis as { browser?: unknown }).browser === "undefined") {
  (globalThis as { browser?: typeof browser }).browser = browser;
}

export { browser };
export default browser;
