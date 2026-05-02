import * as cheerio from "cheerio";
import { extractUnits } from "./extract.ts";
import { decodeText } from "./placeholders.ts";
import { translateUnits } from "./translate.ts";
import type { TranslateOptions, TranslateResult } from "./types.ts";

export type { TranslateOptions, TranslateResult } from "./types.ts";
export type { Glossary } from "./glossary.ts";
export {
  formatGlossaryForPrompt,
  parseGlossaryText,
  formatGlossaryText,
} from "./glossary.ts";
export { encodeChildren, decodeText } from "./placeholders.ts";
export { extractUnits } from "./extract.ts";
export { translateUnits, DEFAULT_MODEL, buildSystemPrompt } from "./translate.ts";

/**
 * Translate a full HTML document.
 *
 * Pipeline: parse → extract leaf-block translation units (with inline-tag
 * placeholders) → batch them through the LLM → splice translated children
 * back into the DOM → serialize.
 */
export async function translateHtml(
  html: string,
  options: TranslateOptions,
): Promise<TranslateResult> {
  const start = Date.now();
  const $ = cheerio.load(html);
  const { units, refs } = extractUnits($);

  if (units.length === 0) {
    return {
      html: $.html(),
      stats: {
        units: 0,
        batches: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        elapsedMs: Date.now() - start,
      },
    };
  }

  const { translated, stats } = await translateUnits(units, options);

  for (const u of units) {
    const newText = translated.get(u.id);
    if (newText === undefined) continue;
    const el = refs.get(u.id);
    if (!el) continue;
    const html = decodeText(newText, u.placeholders);
    $(el).html(html);
  }

  return {
    html: $.html(),
    stats: {
      units: units.length,
      batches: stats.batches,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      cachedInputTokens: stats.cachedInputTokens,
      elapsedMs: Date.now() - start,
    },
  };
}
