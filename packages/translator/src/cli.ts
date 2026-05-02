#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { extractUnits } from "./extract.ts";
import { translateHtml } from "./index.ts";
import type { TranslateResult } from "./types.ts";

const DEFAULT_OUTPUT_DIR = "test/output";

const HELP = `bb — BorderBrowser CLI

Usage:
  bb translate <url|file> --lang <lang> [--model <model>] [--out <file>] [--api-key <key>]
  bb extract <url|file>
  bb version
  bb --help

Subcommands:
  translate    Translate an HTML page or local file to <lang>. Writes the
               translated HTML to --out (or test/output/ by default).
  extract      Extract translation units from an HTML page or local file and
               print them as JSON. Does not call the LLM.
  version      Print the bb version.

Environment:
  OPENROUTER_API_KEY   API key for OpenRouter (or pass --api-key).
  OPENROUTER_MODEL     Default model id (or pass --model).
  OPENROUTER_SITE_URL, OPENROUTER_SITE_NAME
                       Optional analytics headers.

Examples:
  bb translate https://www.lemonde.fr --lang english
  bb translate ./fixtures/yle.html --lang finnish --model anthropic/claude-sonnet-4.6
  bb extract ./fixtures/page.html > units.json
`;

type ParsedFlags = {
  positional: string[];
  flags: Map<string, string>;
};

/** Lightweight `--key value` / `--flag` parser. Bare flags map to "". */
function parseArgs(argv: string[]): ParsedFlags {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, "");
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function fetchSource(source: string): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (BorderBrowser dev tool; translation test)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "*",
      },
    });
    if (!res.ok)
      throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${source})`);
    return await res.text();
  }
  return await readFile(source, "utf8");
}

function slugFor(source: string): string {
  return source
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Read package.json version. Works from either src (tsx) or dist (compiled). */
export function getVersion(): string {
  const require = createRequire(import.meta.url);
  // Resolve relative to this module: src/cli.ts → ../package.json,
  // dist/cli.js → ../package.json. Same depth in both cases.
  const pkg = require("../package.json") as { version?: string };
  return pkg.version ?? "0.0.0";
}

/** Programmatic `extract` — returned as plain JSON-serializable objects. */
export type ExtractedUnit = { id: number; kind: string; text: string };

export async function runExtract(source: string): Promise<ExtractedUnit[]> {
  const html = await fetchSource(source);
  const $ = cheerio.load(html);
  const { units } = extractUnits($);
  return units.map((u) => ({ id: u.id, kind: u.kind, text: u.text }));
}

export type TranslateCliOptions = {
  source: string;
  targetLang: string;
  model?: string;
  apiKey?: string;
  outPath?: string;
};

export async function runTranslate(opts: TranslateCliOptions): Promise<{
  outPath: string;
  stats: TranslateResult["stats"];
}> {
  const html = await fetchSource(opts.source);
  const result = await translateHtml(html, {
    targetLang: opts.targetLang,
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    ...(process.env.OPENROUTER_SITE_URL !== undefined
      ? { siteUrl: process.env.OPENROUTER_SITE_URL }
      : {}),
    ...(process.env.OPENROUTER_SITE_NAME !== undefined
      ? { siteName: process.env.OPENROUTER_SITE_NAME }
      : {}),
  });

  const outPath =
    opts.outPath ??
    join(
      DEFAULT_OUTPUT_DIR,
      `${slugFor(opts.source)}.${opts.targetLang.toLowerCase()}.html`,
    );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.html, "utf8");
  return { outPath, stats: result.stats };
}

async function cmdTranslate(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const source = positional[0];
  if (!source) {
    console.error("Usage: bb translate <url|file> --lang <lang> [--model <model>] [--out <file>]");
    process.exit(2);
  }
  // Backward-compat: `bb translate <url> <lang>` (positional) still works.
  const targetLang = flags.get("lang") || positional[1];
  if (!targetLang) {
    console.error("error: --lang <target-language> is required");
    process.exit(2);
  }
  const model = flags.get("model") || process.env.OPENROUTER_MODEL;
  const apiKey = flags.get("api-key") || process.env.OPENROUTER_API_KEY;
  const outPath = flags.get("out");

  console.error(`Source:  ${source}`);
  console.error(`Target:  ${targetLang}`);
  console.error(`Model:   ${model ?? "(default)"}`);
  console.error("");
  console.error("Translating...");

  const { outPath: writtenPath, stats } = await runTranslate({
    source,
    targetLang,
    ...(model ? { model } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(outPath ? { outPath } : {}),
  });

  console.error("");
  console.error(`  units:      ${stats.units}`);
  console.error(`  batches:    ${stats.batches}`);
  console.error(
    `  tokens:     in=${stats.inputTokens.toLocaleString()} out=${stats.outputTokens.toLocaleString()} cached=${stats.cachedInputTokens.toLocaleString()}`,
  );
  console.error(`  elapsed:    ${(stats.elapsedMs / 1000).toFixed(2)}s`);
  console.error("");
  console.error(`Wrote ${writtenPath}`);
}

async function cmdExtract(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const source = positional[0];
  if (!source) {
    console.error("Usage: bb extract <url|file>");
    process.exit(2);
  }
  const units = await runExtract(source);
  console.log(JSON.stringify(units, null, 2));
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case "version":
    case "--version":
    case "-v":
      console.log(getVersion());
      return;
    case "translate":
      await cmdTranslate(rest);
      return;
    case "extract":
      await cmdExtract(rest);
      return;
    default:
      console.error(`bb: unknown command "${cmd}"`);
      console.error("");
      console.error(HELP);
      process.exit(2);
  }
}

// Only run main() when invoked as a script, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  });
}
