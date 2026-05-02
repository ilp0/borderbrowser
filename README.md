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
npm run translate -- <url> --lang <lang>   # translate a real URL to <lang>
```

### `bb` CLI

The translator package ships a `bb` binary for scripting and testing. Build
it once, then invoke directly or via `npm link`:

```bash
npm install
npm run -w @borderbrowser/translator build   # writes packages/translator/dist/cli.js

# Print version
node packages/translator/dist/cli.js version

# Extract translation units (no LLM call) as JSON
node packages/translator/dist/cli.js extract ./fixtures/page.html

# Translate a URL or local file
OPENROUTER_API_KEY=sk-... node packages/translator/dist/cli.js \
  translate https://www.lemonde.fr --lang english

# Subcommands
bb translate <url|file> --lang <lang> [--model <model>] [--out <file>] [--api-key <key>]
bb extract <url|file>
bb version
bb --help
```

`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_SITE_URL`, and
`OPENROUTER_SITE_NAME` are read from the environment.

## Status

In active development. Step 1: de-risk structure-preserving translation in isolation.
