/**
 * Glossary support for the translator.
 *
 * A `Glossary` is a user-curated mapping from source-text terms to required
 * target-language renderings (e.g. "Helsinki" → "Helsinki, not Helsingfors").
 * The translator injects these as a section of the system prompt so the LLM
 * preserves the user's preferred names verbatim.
 *
 * Glossary entries live in `chrome.storage.sync` (via the extension options
 * page) so they roam with the user's profile.
 */

/** Plain map of source term → required translation. */
export type Glossary = Record<string, string>;

/**
 * Render the glossary as a system-prompt block. Returns an empty string when
 * the glossary is missing or has no entries — callers can concatenate the
 * result unconditionally.
 */
export function formatGlossaryForPrompt(glossary: Glossary | undefined): string {
  if (!glossary) return "";
  const entries = Object.entries(glossary).filter(
    ([term, translation]) => term.trim() !== "" && translation.trim() !== "",
  );
  if (entries.length === 0) return "";

  const lines = entries.map(([term, translation]) => `- "${term}" → "${translation}"`);
  return `GLOSSARY (always use these exact translations):\n${lines.join("\n")}`;
}

/**
 * Parse a textarea's contents (one `term=translation` per line) into a
 * `Glossary`. Whitespace around term and translation is trimmed; lines that
 * are empty, comment-style (`# …`), or missing the `=` separator are
 * silently ignored. If the same term appears twice the later entry wins.
 */
export function parseGlossaryText(text: string): Glossary {
  const out: Glossary = {};
  if (!text) return out;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const term = line.slice(0, eq).trim();
    const translation = line.slice(eq + 1).trim();
    if (term === "" || translation === "") continue;
    out[term] = translation;
  }
  return out;
}

/**
 * Inverse of `parseGlossaryText` — render a `Glossary` back into the
 * `term=translation` line format used by the options-page textarea. Stable
 * insertion order is preserved.
 */
export function formatGlossaryText(glossary: Glossary | undefined): string {
  if (!glossary) return "";
  return Object.entries(glossary)
    .filter(([term, translation]) => term.trim() !== "" && translation.trim() !== "")
    .map(([term, translation]) => `${term}=${translation}`)
    .join("\n");
}
