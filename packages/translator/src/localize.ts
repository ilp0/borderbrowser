/**
 * Post-translation localization pass.
 *
 * Runs on translated text BEFORE placeholder decoding. Operates as a pure
 * function on a string that may contain `[N]`, `[/N]`, `[N/]` markers — those
 * markers are never touched; only the literal text segments between them are
 * transformed.
 *
 * Conventions (intentionally narrow — see VISION.md "Localization, not just
 * translation"):
 *
 * - Numbers: assume en-style source (`,` thousands, `.` decimal). Reformat
 *   per target locale via `Intl.NumberFormat`. Numbers that don't match the
 *   en pattern are left alone, so re-running the pass is safe (idempotent on
 *   already-localized output).
 * - Dates: `YYYY-MM-DD` ISO is preserved verbatim (the spec calls it
 *   "preserved when ambiguous"). `MM/DD/YYYY` slash dates are treated as
 *   en-US source and reformatted via `Intl.DateTimeFormat` for the target
 *   locale.
 * - Units: only convert when the user has explicitly set `unitSystem`. No
 *   automatic flip otherwise. Conversion is rounded to 1 decimal.
 * - Currency: NO conversion. When `currencyAnnotate: true` AND `rates` are
 *   supplied, append `(~$45)` style. Without rates the annotation is skipped
 *   silently — keeps the module dep-free and unit-testable.
 */

export type UnitSystem = "metric" | "imperial";

export type LocalizeOptions = {
  /** When set, °C↔°F, km↔mi, kg↔lbs are converted toward this system. */
  unitSystem?: UnitSystem;
  /** When true AND `rates` is supplied, append `(~$45)`-style annotations. */
  currencyAnnotate?: boolean;
  /**
   * Optional FX rates keyed by ISO currency code, expressed as the value of
   * 1 unit of that currency in USD (e.g. `{ EUR: 1.08, GBP: 1.27 }`). Only
   * consulted when `currencyAnnotate` is true. Without rates the annotation
   * pass is a silent no-op (we don't fetch rates from the network — that is
   * the caller's responsibility).
   */
  rates?: Record<string, number>;
  /** ISO currency code used for the annotation (defaults to "USD"). */
  annotateAs?: string;
};

// Source pattern for translation placeholder markers — `[1]`, `[/1]`, `[1/]`.
// Stored as a string so each user gets a fresh /g regex without lastIndex state.
// Must stay in sync with `decodeText`'s marker regex in placeholders.ts.
const MARKER_PATTERN = String.raw`\[\d+\/?\]|\[\/\d+\]`;

/**
 * Apply the localization pass to translated text. The text may contain
 * placeholder markers; markers are passed through verbatim and only the
 * segments between them are transformed.
 *
 * Number and date reformatting always run (driven by `targetLang`); unit
 * conversion and currency annotation only run when their respective options
 * are set.
 */
export function localizeText(
  text: string,
  targetLang: string,
  options: LocalizeOptions,
): string {
  return transformSegments(text, (segment) => {
    let s = segment;
    s = transformNumbers(s, targetLang);
    s = transformDates(s, targetLang);
    if (options.unitSystem !== undefined) {
      s = transformUnits(s, options.unitSystem);
    }
    if (options.currencyAnnotate && options.rates) {
      s = annotateCurrencies(s, options.rates, options.annotateAs ?? "USD");
    }
    return s;
  });
}

/**
 * Run `fn` over each non-marker segment of `text`. Markers are kept verbatim,
 * preserving their exact form (`[1]`, `[/1]`, `[1/]`).
 */
function transformSegments(text: string, fn: (segment: string) => string): string {
  let out = "";
  let lastIdx = 0;
  const re = new RegExp(MARKER_PATTERN, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out += fn(text.slice(lastIdx, match.index));
    out += match[0];
    lastIdx = match.index + match[0].length;
  }
  out += fn(text.slice(lastIdx));
  return out;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

// Matches en-style numbers: optional sign, integer part (with optional
// thousands separators every 3 digits), optional decimal. Requires either a
// thousands separator OR a decimal point so we don't reformat bare digits
// like room numbers, ids, "1000" addresses etc.
//
// Examples that match: 1,234   1,234.56   12,345,678   .5   0.5   -1,000.25
// Examples that don't:  1234   42   2025   1,23 (FR-style)   1.234 (DE-style)
const EN_NUMBER_RE = /(?<![A-Za-z0-9.,])(-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+))(?![A-Za-z0-9.,])/g;

function transformNumbers(text: string, targetLang: string): string {
  return text.replace(EN_NUMBER_RE, (raw) => {
    const numeric = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(numeric)) return raw;
    const decimals = decimalDigits(raw);
    try {
      return new Intl.NumberFormat(targetLang, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: true,
      }).format(numeric);
    } catch {
      return raw;
    }
  });
}

function decimalDigits(raw: string): number {
  const dot = raw.indexOf(".");
  return dot === -1 ? 0 : raw.length - dot - 1;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

// Matches `MM/DD/YYYY` (en-US slash date). We deliberately do NOT match
// `YYYY-MM-DD` ISO — the spec says ISO is preserved when ambiguous.
const EN_SLASH_DATE_RE = /(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/g;

function transformDates(text: string, targetLang: string): string {
  return text.replace(EN_SLASH_DATE_RE, (raw, mm: string, dd: string, yyyy: string) => {
    const month = Number(mm);
    const day = Number(dd);
    const year = Number(yyyy);
    if (month < 1 || month > 12 || day < 1 || day > 31) return raw;
    // Build a UTC date to avoid TZ surprises.
    const d = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(d.getTime())) return raw;
    try {
      return new Intl.DateTimeFormat(targetLang, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC",
      }).format(d);
    } catch {
      return raw;
    }
  });
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

// One decimal of precision is enough for the user-facing nudge use case; if
// callers need exact roundtrips they can disable the unit pass.
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Each rule has a regex with one numeric capture group, and a converter that
// yields `{ value, unit }` for the target system. Order matters slightly —
// `°F` comes before `°C` so the `F` literal isn't shadowed by something else.
type UnitRule = {
  /** Re must have exactly one capture group around the number. */
  re: RegExp;
  /** Direction this rule fires in. */
  toSystem: UnitSystem;
  convert: (n: number) => string;
};

const UNIT_RULES: UnitRule[] = [
  // °F → °C  (when target is metric)
  {
    re: /(-?\d+(?:\.\d+)?)\s*°\s*F\b/g,
    toSystem: "metric",
    convert: (f) => `${round1((f - 32) * 5 / 9)}°C`,
  },
  // °C → °F  (when target is imperial)
  {
    re: /(-?\d+(?:\.\d+)?)\s*°\s*C\b/g,
    toSystem: "imperial",
    convert: (c) => `${round1((c * 9) / 5 + 32)}°F`,
  },
  // mi → km  (metric)
  {
    re: /(-?\d+(?:\.\d+)?)\s*mi\b/g,
    toSystem: "metric",
    convert: (mi) => `${round1(mi * 1.609344)} km`,
  },
  // km → mi  (imperial). Negative lookahead to avoid eating "kmh" etc.
  {
    re: /(-?\d+(?:\.\d+)?)\s*km\b(?!\/)/g,
    toSystem: "imperial",
    convert: (km) => `${round1(km / 1.609344)} mi`,
  },
  // lbs → kg  (metric)
  {
    re: /(-?\d+(?:\.\d+)?)\s*lbs?\b/g,
    toSystem: "metric",
    convert: (lbs) => `${round1(lbs * 0.45359237)} kg`,
  },
  // kg → lbs  (imperial)
  {
    re: /(-?\d+(?:\.\d+)?)\s*kg\b/g,
    toSystem: "imperial",
    convert: (kg) => `${round1(kg / 0.45359237)} lbs`,
  },
];

function transformUnits(text: string, target: UnitSystem): string {
  let s = text;
  for (const rule of UNIT_RULES) {
    if (rule.toSystem !== target) continue;
    s = s.replace(rule.re, (match, num: string) => {
      const n = Number(num);
      if (!Number.isFinite(n)) return match;
      return rule.convert(n);
    });
  }
  return s;
}

// ---------------------------------------------------------------------------
// Currency annotation
// ---------------------------------------------------------------------------

// Matches `€42`, `£1,234.56`, `$99`, plus the ISO 3-letter form `EUR 42`.
// Only used when the caller opted into annotation AND supplied rates.
const SYMBOL_TO_CODE: Record<string, string> = {
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "$": "USD",
  "₽": "RUB",
  "₹": "INR",
  "₩": "KRW",
};

const SYMBOL_RE = /([€£¥$₽₹₩])\s*(-?\d+(?:[,.]\d+)*(?:\.\d+)?)/g;
const CODE_RE = /\b([A-Z]{3})\s+(-?\d+(?:[,.]\d+)*(?:\.\d+)?)/g;

function annotateCurrencies(
  text: string,
  rates: Record<string, number>,
  annotateAs: string,
): string {
  let s = text.replace(SYMBOL_RE, (match, sym: string, num: string) => {
    const code = SYMBOL_TO_CODE[sym];
    if (!code) return match;
    return appendAnnotation(match, code, num, rates, annotateAs);
  });
  s = s.replace(CODE_RE, (match, code: string, num: string) => {
    return appendAnnotation(match, code, num, rates, annotateAs);
  });
  return s;
}

function appendAnnotation(
  original: string,
  fromCode: string,
  rawNum: string,
  rates: Record<string, number>,
  toCode: string,
): string {
  if (fromCode === toCode) return original;
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (fromRate === undefined || toRate === undefined) return original;
  // Normalize en-style number for parsing; if it looks non-en, give up.
  const normalized = rawNum.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return original;
  const usdValue = value * fromRate;
  const targetValue = usdValue / toRate;
  const sym = symbolFor(toCode);
  const rounded = Math.round(targetValue);
  return `${original} (~${sym}${rounded})`;
}

function symbolFor(code: string): string {
  for (const [sym, c] of Object.entries(SYMBOL_TO_CODE)) {
    if (c === code) return sym;
  }
  return code + " ";
}
