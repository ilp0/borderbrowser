# BorderBrowser

Browse other countries' internet in their original languages, translated in real time by an LLM.

## Architecture

- **`packages/translator`** — Core HTML translation library + CLI. Inline-tag placeholder protocol for structure-preserving translation. Used by both the worker and the extension's BYOK direct-to-OpenRouter path.
- **`packages/worker`** *(coming)* — Cloudflare Worker. Auth, KV-cached translation proxy, Stripe billing.
- **`packages/extension`** *(coming)* — Chrome MV3 / Firefox extension. Atomic-swap page translation with original ↔ translated toggle.
- **`packages/homepage`** *(coming)* — Astro site. Country link directory, install guide, credit purchase, account.

## Development

```bash
npm install
```

### Translator

```bash
cd packages/translator
cp .env.example .env.local      # add OPENROUTER_API_KEY
npm test                        # unit tests for placeholder protocol
npm run translate -- <url> <lang>   # translate a real URL to <lang>
```

### Extension

```bash
npm run -w @borderbrowser/extension build
```

This emits two parallel builds from a single source tree:

- `packages/extension/dist/` — Chrome MV3. Load via `chrome://extensions` → "Load unpacked".
- `packages/extension/dist-firefox/` — Firefox MV3. Load via `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → pick `dist-firefox/manifest.json`.

`webextension-polyfill` is bundled into both so the same source uses the unified `browser.*` namespace at runtime.

## Status

In active development. Step 1: de-risk structure-preserving translation in isolation.
