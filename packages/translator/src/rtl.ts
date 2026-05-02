/**
 * Right-to-left language detection.
 *
 * The translator emits HTML with the SAME structure as the source, just with
 * children rewritten in the target language. When that target language is RTL
 * (Arabic, Hebrew, Persian/Farsi, Urdu, …), the surrounding LTR layout is no
 * longer correct: punctuation hugs the wrong side, list bullets sit on the
 * wrong edge, and bidi-neutral characters flow the wrong way.
 *
 * Setting `dir="rtl"` on each translated element fixes all of that without
 * touching the rest of the page. Inline LTR runs (URLs, code, numbers) stay
 * LTR thanks to the Unicode bidi algorithm + the fact that those tokens are
 * preserved verbatim inside placeholders during translation.
 *
 * Input forms accepted:
 *   - BCP-47 tag, primary subtag only matters: "ar", "ar-SA", "ar_EG"
 *   - Free-form name in English ("Arabic") or in the language itself
 *     ("العربية", "עברית", "فارسی", "اردو")
 *
 * Match is case-insensitive. Anything we don't recognise is treated as LTR —
 * the worst case is layout that's slightly off, never broken.
 */

/**
 * Primary BCP-47 subtags considered RTL by Unicode CLDR.
 *
 * We err on the side of false negatives: scripts like Azerbaijani Latin or
 * Hausa Boko are LTR in modern use, so we don't list those primary tags even
 * though Arabic-script variants exist. A wrongly-LTR page is mildly ugly;
 * a wrongly-RTL page is unreadable.
 */
const RTL_LANG_CODES: ReadonlySet<string> = new Set([
  "ar", // Arabic
  "arc", // Aramaic
  "dv", // Divehi / Dhivehi
  "fa", // Persian / Farsi
  "he", // Hebrew
  "iw", // Hebrew (legacy code)
  "ji", // Yiddish (legacy code)
  "ks", // Kashmiri
  "ku", // Kurdish (Sorani)
  "ps", // Pashto
  "sd", // Sindhi
  "ug", // Uyghur
  "ur", // Urdu
  "yi", // Yiddish
]);

/**
 * Free-form display names → BCP-47 primary subtag.
 *
 * Mirrors the `LANG_NAME_TO_CODE` table in the extension's content script,
 * but only contains entries that resolve to RTL languages — keeps this
 * module self-contained and dependency-free.
 */
const RTL_NAME_TO_CODE: ReadonlyMap<string, string> = new Map([
  ["arabic", "ar"],
  ["العربية", "ar"],
  ["hebrew", "he"],
  ["עברית", "he"],
  ["ivrit", "he"],
  ["persian", "fa"],
  ["farsi", "fa"],
  ["فارسی", "fa"],
  ["urdu", "ur"],
  ["اردو", "ur"],
  ["pashto", "ps"],
  ["پښتو", "ps"],
  ["yiddish", "yi"],
  ["ייִדיש", "yi"],
  ["sindhi", "sd"],
  ["سنڌي", "sd"],
  ["uyghur", "ug"],
  ["ئۇيغۇرچە", "ug"],
  ["divehi", "dv"],
  ["dhivehi", "dv"],
  ["kurdish", "ku"], // Sorani / Central Kurdish, written in Arabic script
  ["kurdî", "ku"],
]);

/**
 * Return true if `lang` denotes a right-to-left written language.
 *
 * Empty / unknown input → false. The function is a pure lookup; it never
 * throws and is safe to call in a hot path during apply.
 */
export function isRtl(lang: string | undefined | null): boolean {
  if (!lang) return false;
  const trimmed = lang.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();

  // BCP-47: take the primary subtag (everything before the first "-" or "_").
  const primary = lower.split(/[-_]/)[0]!;
  if (RTL_LANG_CODES.has(primary)) return true;

  // Free-form name fallback. Match the raw input first (preserves non-ASCII
  // case mapping for native names), then the lowercased form.
  if (RTL_NAME_TO_CODE.has(trimmed)) return true;
  if (RTL_NAME_TO_CODE.has(lower)) return true;

  return false;
}
