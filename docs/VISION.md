# BorderBrowser — Perfect-World Spec

This is the aspirational version: what BorderBrowser becomes with infinite engineering time and budget. It exists to answer "where is this going?" — every decision in the codebase should be evaluated against whether it moves us toward this, not away.

The product is **the calmest way to read the world's internet in your language**. Calm = beautiful, fast, never jarring. Calm beats clever.

---

## 1. North star

> A reader opens any foreign-language page and within one heartbeat sees it in their language, set in proper type, behaving exactly like the original site. No flicker, no overlay, no "translation banner," no progress bar inching across the screen. The translation feels like the site was always written that way.

Concretely:

- **First translated paint ≤ 600 ms** for a typical news page on the user's second visit (cache hit) and ≤ 3 s on the first visit.
- **Zero live text-swap** on initial load. Ever. (Reaffirmed user preference.)
- **Atomic transition** — the page goes from "loading" to "fully translated" in a single render. The user does not see partial states.
- **Identical visual layout** to the original site. Type, color, spacing, image positions: untouched. Only words change.
- **The user can forget the extension exists.** The moment they want it, it surfaces; otherwise, invisible.

---

## 2. Reading experience (the part the user actually sees)

### Initial load

1. User clicks `lemonde.fr` from our directory (or types it directly).
2. Browser begins loading the page. We intercept early via the `webRequest` / `declarativeNetRequest` boundary and start streaming the HTML through our local translation pipeline in parallel with rendering.
3. The page's `<head>` arrives → we translate `<title>`, `og:` meta, JSON-LD, and any above-the-fold critical CSS-blocking text — sub-200ms.
4. Below-the-fold content is translated concurrently as it streams in. The user sees only the translated version because we hold the swap until the visible viewport is ready.
5. **Crossfade-in** (200ms ease-out) replaces the holding state with the live translated DOM. Looks like the page just loaded.

This requires a content-script architecture that runs **before** the page paints (`document_start` with `world: "ISOLATED"` + DOM mutation observers from byte zero), not the current `document_idle` approach.

### Subsequent visits

- **Edge cache hit**: translated DOM diff served in <100ms. Page appears already-translated.
- **Stale-while-revalidate**: show cached translation immediately; quietly re-translate paragraphs that changed since cache.

### In-page interactions

- **Hover-to-peek original**: hover any paragraph for 400ms → original text fades in beneath the translation in subdued type. Move away, it fades out. No click required.
- **Right-click → "Translate selection only"**: replaces just the highlighted span. Useful for partial-foreign-language pages (Wikipedia code samples in another language, etc.).
- **Inline alternatives**: alt-click a word → small popover with 2–3 alternative translations and the original. For language learners.
- **Cultural footnotes**: when the LLM detects an idiom or culture-specific reference that doesn't translate well, a tiny inline marker appears; hover for context. Off by default; on for "Reading mode."
- **Reading mode**: collapses sidebar/ads, applies comfortable serif typography, language-appropriate line-height. Toggle via keyboard or icon. The translated text *deserves* to be read.

### Toggle behavior

- A floating glass pill in the bottom-right shows current state: `🌐 Translated · EN` or `📄 Original · FI`.
- Clicking it crossfades between original and translated in 180ms (not innerHTML swap — preserved DOM with cached content).
- Long-press or right-click for: "Stop translating this domain", "Always translate this domain", "Re-translate with premium model", "Report a bad translation."

### When something goes wrong

- API key invalid → tiny non-modal toast, links to settings.
- Out of credit → toast with one-tap top-up.
- LLM fails on one batch → that paragraph stays in original language with a subtle dotted underline; click to retry.
- Whole page fails → full restoration to original, single toast saying so. Never leave the user staring at a half-baked translation.

---

## 3. Translation quality (where the LLM earns its keep)

### Document-level coherence

- The LLM sees the **entire article** in one call (using extended context windows: 200K+ tokens), not 40-unit batches. Names stay consistent, pronouns resolve correctly, tone holds across paragraphs.
- Long pages > context window: translate in overlapping chunks (last 1K tokens of previous chunk repeated as context for the next).

### Tier escalation

- **Default**: fast model (Haiku-class) for navigation, listings, comments.
- **Auto-promote**: article body content → mid-tier (Sonnet-class).
- **User-triggered**: "re-translate with the best" → top-tier (Opus-class). Saved per-domain after one click.

### Personalization

- **Glossary**: user maintains a list — *"Helsinki" → keep as "Helsinki", not "Helsingfors"*. Persists across pages.
- **Tone preference**: formal / neutral / casual. Applied across all translation calls.
- **Domain expertise**: power users can add a domain prompt — *"Translate this site's medical terminology with US clinical vocabulary"* — for sites they read often.

### Localization, not just translation

- **Number formats**: `1,234.56` → `1 234,56` for FR, `1.234,56` for DE.
- **Date formats**: ISO when ambiguous; locale-appropriate when clear.
- **Units**: °C ↔ °F, km ↔ mi, kg ↔ lbs based on user locale, with original in subscript on hover.
- **Currency**: live FX rate appended in subscript: *"€42 (~$45)"*. Off by default; on for shopping/travel domains.

### Right-to-left handling

- When translating LTR → RTL (e.g. English → Arabic), set `dir="rtl"` per translated block, mirror layout where appropriate, preserve original LTR for code/numbers/URLs.

### Typography per language

- Bundle Noto family + a curated SF/Inter set. When the translation language differs from the page's, swap the font stack on translated nodes for proper coverage of CJK, Cyrillic, Devanagari, Arabic.
- Respect the original site's font *intent* (sans, serif, mono) — pick the matching variant of the target-language font, don't force one global override.

---

## 4. Coverage (everything that has text)

The current extension translates leaf-block elements with text. The perfect version translates **every meaningful piece of language on the page**:

- ✅ Block-level text (current)
- 🆕 Inline attributes: `alt`, `title`, `placeholder`, `aria-label`, `aria-description`, `value` on submit buttons
- 🆕 `<meta>` description, OpenGraph, Twitter Card content (so shared links preview in user's language)
- 🆕 JSON-LD structured data (recipe instructions, FAQ Q&A, etc.)
- 🆕 Shadow DOM (pierce open shadow roots; closed roots gracefully ignored)
- 🆕 Same-origin iframes (full content script in iframe context)
- 🆕 Cross-origin iframes (best-effort: translate via parent → child postMessage protocol when both sides have the extension)
- 🆕 PDF documents rendered in-browser (intercept PDF.js, translate text layer)
- 🆕 Images with text (OCR via local model for memes/screenshots; translate the OCR text and overlay translucent caption)
- 🆕 Video subtitles (`<track>` elements; YouTube via API; live caption translation for streams)
- 🆕 Form labels and validation messages
- 🆕 Tooltips and toast/snackbar notifications that appear after first paint
- 🆕 Dynamically inserted SPA content (MutationObserver pipeline with debounce + atomic swap per insertion batch)

---

## 5. The directory homepage

### Discovery surfaces

- **Country grid**: current. With real screenshots (Cloudflare Browser Rendering or similar), refreshed weekly. Hover to expand.
- **Trending globally**: pulls top stories from each country's leading paper, summarized (1 sentence each), in user's language. Updated hourly.
- **Same story, many countries**: identifies major news events (BBC vs. Le Monde vs. Asahi vs. RT vs. Al Jazeera covering the same thing) and presents side-by-side. *This is the killer feature.* No other tool offers this.
- **Topic feeds**: "Climate from 8 countries", "Tech from JP/KR/CN/DE", "Elections from anywhere." Curated, opinionated.
- **Personalized recommendations**: based on what the user reads (locally-computed, never sent to us).

### Sections

- `/` — directory + trending
- `/install` — extension install + setup, beautifully designed
- `/buy` — Stripe Checkout, $5/$10/$25/$50 with sliders for custom amounts
- `/topup` — paste key, top up
- `/learn` — for language learners: side-by-side reading mode, frequency-based vocabulary, spaced repetition export
- `/atlas` — interactive world map showing news velocity per country, click to drill in
- `/digest` — daily email: "What 8 countries' front pages led with today" (opt-in, free for paid users)

### Editorial integrity

- The directory is **editorially curated**, not algorithmic. Real humans (us) make decisions about what's worth including. State media is labeled. Independent-in-exile outlets (Meduza, etc.) are flagged. We don't take affiliate money to influence rankings.
- A brief description per source for non-natives: *"Sweden's largest tabloid, center-right" / "Russia's leading independent paper, currently published from Latvia."*

---

## 6. Privacy & trust (the unfair advantage)

The current architecture is already privacy-respecting (browser → LLM direct, we never see content). The perfect version makes that **provable** and **enforceable**.

- **Reproducible builds**. Source on GitHub; CI publishes signed builds; user can verify the Chrome Store version matches commit X.
- **No telemetry**. Period. Not "anonymized telemetry." None.
- **Public audit log** of any code change that touches network calls.
- **Self-hostable backend**. Anyone uncomfortable with our hosted proxy can run their own with a single Docker container. We give them the dashboard, the schema, the Stripe wiring.
- **Local-LLM mode** via WebGPU. Quantized 7B–14B model running in-browser, slower but completely offline. No network call leaves the device.
- **Anonymous keys** option: pay with Bitcoin/Monero, get a key with no email tied to it.
- **Tor-friendly**: backend reachable over .onion; no IP logs.

This isn't a feature list — it's a positioning statement. We are *the* trust-first translation tool.

---

## 7. Performance budgets (non-negotiable)

| Metric | Budget |
|---|---|
| Time to first translated paint, cache hit | ≤ 600 ms |
| Time to first translated paint, cold | ≤ 3.0 s |
| Time to full-page translation, cold (1MB page) | ≤ 6.0 s |
| Toggle original↔translated | ≤ 200 ms |
| Hover-peek original | 400 ms hover delay, < 50 ms render |
| Bundle size, content script | ≤ 30 KB gzipped |
| Bundle size, background SW | ≤ 200 KB gzipped |
| Memory overhead per tab | ≤ 12 MB |
| Battery impact, idle | < 0.1% CPU |

If a feature blows a budget, the feature gets cut, not the budget.

---

## 8. Caching layers

1. **Per-tab in-memory** — the original/translated DOM cache for instant toggling.
2. **Per-browser IndexedDB** — translations keyed by `(url, content-hash, target-lang, model-tier)`. Survives across tabs and restarts. LRU-evicted at 500 MB cap.
3. **Edge cache (optional, opt-in)** — for paid users, an optional shared cache: anonymous content hashes only, no URLs, no user identity. If 100 users translate `lemonde.fr` to English in a day, only the first one pays the LLM cost.
4. **Differential translations** — when revisiting a page, send only the diff vs. last visit's content hash. The cache returns the unchanged paragraphs verbatim.

---

## 9. Cross-platform reality

- **Chromium** (Chrome, Edge, Brave, Arc, Vivaldi, Opera) — primary target, MV3.
- **Firefox** — MV3 with `browser.*` namespace via webextension-polyfill. Day-one.
- **Safari** — both desktop (Web Extension) and iOS Safari extension. Same codebase, different packaging.
- **Mobile Firefox** (Android) — supported.
- **Standalone reader app** (Tauri or Electron) — for users who want a dedicated reading environment. Imports articles from RSS, Pocket, Instapaper.
- **CLI** — `bb translate <url> --lang en` for scripting and testing.
- **API** (paid plans) — programmatic access to the proxy with rate limits.

---

## 10. Accessibility, non-negotiable

- All translated nodes carry the correct `lang` attribute so screen readers pronounce them correctly.
- `prefers-reduced-motion` respected for all animations.
- High-contrast mode supported.
- Keyboard navigation: every interaction has a shortcut (`⌘T translate`, `⌘O original`, `⌘⇧T premium retry`).
- Translated content announced to screen readers as a single completion event, not a hundred mutations.

---

## 11. Business model

- **Free tier**: BYOK (your own OpenRouter/OpenAI/Anthropic key). Zero cost to us, zero data to us. The product works perfectly.
- **Paid prepaid keys**: $5–$50, current plan. Margin = 30%.
- **Pro subscription** ($8/mo): unlimited translations within fair-use, premium model by default, edge cache access, daily digest, glossary sync across devices.
- **Enterprise**: SSO, audit logs, compliance attestations, custom prompts, SLA. Annual contracts.

The free tier is real, not crippled. The pro tier is "better defaults + nicer surfaces," not "you're locked out without it."

---

## 12. What we will not do

- We will not insert ads into translated pages.
- We will not log page content, ever, under any circumstance.
- We will not introduce visual chrome (banners, watermarks) into the translated page.
- We will not "improve" the original site's content, reorder it, or summarize without explicit user request.
- We will not sell aggregated reading data, even anonymized.
- We will not require a login for the free tier.
- We will not auto-translate content without explicit per-domain or per-session user consent (auto-translate is opt-in, never default).

---

## 13. Roadmap to here from where we are

This is what we have now (sound foundation):

- Inline-tag placeholder protocol with 0% marker leakage on real pages
- Atomic-swap content script, original ↔ translated toggle
- BYOK architecture, billing scaffolding, country directory

This is what each layer above adds, in priority order:

1. **Same-language guard + glossary v1** (1 week)
2. **MutationObserver SPA pipeline + iframe support** (2–3 weeks)
3. **IndexedDB cache layer + diff translations** (2 weeks)
4. **Hover-peek original + reading mode** (2 weeks)
5. **Real screenshots in directory + side-by-side same-story view** (4 weeks; the killer feature)
6. **Document-level coherence + tier escalation + glossary v2** (3 weeks)
7. **Edge cache for paid users** (3 weeks)
8. **Firefox + Safari ports** (4 weeks)
9. **Local LLM via WebGPU** (8+ weeks)
10. **Mobile Safari iOS extension** (4 weeks)

Total ~9 months of focused work to reach the spec, assuming a small team. The shape is right today. The depth is what's missing.
