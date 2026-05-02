import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { translateHtml } from "./index.ts";

const DEFAULT_OUTPUT_DIR = "test/output";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: translate <url|file> <target-lang> [--model <model>]");
    console.error("");
    console.error("Examples:");
    console.error("  npm run translate -- https://www.lemonde.fr english");
    console.error("  npm run translate -- ./fixtures/yle.html finnish --model anthropic/claude-sonnet-4.6");
    process.exit(2);
  }

  const source = args[0]!;
  const targetLang = args[1]!;
  let model: string | undefined = process.env.OPENROUTER_MODEL;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      model = args[i + 1]!;
      i++;
    }
  }

  console.log(`Source:  ${source}`);
  console.log(`Target:  ${targetLang}`);
  console.log(`Model:   ${model ?? "(default)"}`);
  console.log("");

  console.log("Fetching...");
  const html = await fetchSource(source);
  console.log(`  ${html.length.toLocaleString()} bytes`);

  console.log("Translating...");
  const result = await translateHtml(html, {
    targetLang,
    ...(model !== undefined ? { model } : {}),
    ...(process.env.OPENROUTER_SITE_URL !== undefined
      ? { siteUrl: process.env.OPENROUTER_SITE_URL }
      : {}),
    ...(process.env.OPENROUTER_SITE_NAME !== undefined
      ? { siteName: process.env.OPENROUTER_SITE_NAME }
      : {}),
  });

  const s = result.stats;
  console.log("");
  console.log(`  units:      ${s.units}`);
  console.log(`  batches:    ${s.batches}`);
  console.log(
    `  tokens:     in=${s.inputTokens.toLocaleString()} out=${s.outputTokens.toLocaleString()} cached=${s.cachedInputTokens.toLocaleString()}`,
  );
  console.log(`  elapsed:    ${(s.elapsedMs / 1000).toFixed(2)}s`);

  const outPath = await writeOutput(source, targetLang, result.html);
  console.log("");
  console.log(`Wrote ${outPath}`);
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
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${source})`);
    return await res.text();
  }
  return await readFile(source, "utf8");
}

async function writeOutput(source: string, lang: string, html: string): Promise<string> {
  const slug = source
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const path = join(DEFAULT_OUTPUT_DIR, `${slug}.${lang.toLowerCase()}.html`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
  return path;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
