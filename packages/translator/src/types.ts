/**
 * Information stored for each placeholder marker in an encoded translation unit.
 *
 * - `inline`  → element whose contents we translate; emit `[N]...[/N]` around translated children.
 * - `void`    → self-closing element (br, img, hr, wbr); emit `[N/]`.
 * - `opaque`  → element whose entire markup is preserved verbatim (script, style, code, pre); emit `[N/]`.
 */
export type PlaceholderInfo =
  | { kind: "inline"; tag: string; attrs: Record<string, string> }
  | { kind: "void"; tag: string; attrs: Record<string, string> }
  | { kind: "opaque"; html: string };

/**
 * One snippet of translatable text, ready to send to the LLM.
 *
 * `text` contains placeholder markers; `placeholders` maps marker IDs back to
 * the original DOM info needed to reconstruct the element after translation.
 */
export type TranslationUnit = {
  id: number;
  /** The block-type hint passed to the LLM ("h1", "p", "li", etc.). */
  kind: string;
  /** Encoded text with `[N]`, `[/N]`, `[N/]` markers. */
  text: string;
  placeholders: Map<number, PlaceholderInfo>;
};

/** Tone register for the translation. "neutral" matches the source register; the others nudge it. */
export type Tone = "formal" | "neutral" | "casual";

export type TranslateOptions = {
  /** Target language, e.g. "English", "fi", "Spanish (Latin American)". */
  targetLang: string;
  /** Tone preference. Defaults to "neutral" (no extra instruction). */
  tone?: Tone;
  /** OpenRouter model id. Defaults to anthropic/claude-haiku-4.5. */
  model?: string;
  /** OpenRouter API key. Defaults to env OPENROUTER_API_KEY. */
  apiKey?: string;
  /** Optional analytics headers OpenRouter shows in its dashboard. */
  siteUrl?: string;
  siteName?: string;
  /** Override the OpenRouter base URL (useful for tests / proxies). */
  baseUrl?: string;
  /** Max units per batched LLM call. Defaults to 40. */
  batchSize?: number;
  /** Concurrent in-flight batches. Defaults to 4. */
  concurrency?: number;
};

export type TranslateResult = {
  html: string;
  /** Diagnostic info for the caller (cost, latency, retries). */
  stats: {
    units: number;
    batches: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    elapsedMs: number;
  };
};
