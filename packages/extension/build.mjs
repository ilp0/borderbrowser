#!/usr/bin/env node
/**
 * Bundle the extension entry points with esbuild and copy static assets.
 *
 * Each entry is a self-contained IIFE so it can run in MV3 without the
 * cross-entry import contortions of ESM. The service worker uses
 * `type: "module"` in the manifest because it imports translateUnits which
 * pulls in the OpenAI SDK; esbuild bundles them all together so no actual
 * cross-file imports happen at runtime.
 *
 * Outputs two parallel builds:
 *   - dist/          → Chrome MV3 (manifest.json)
 *   - dist-firefox/  → Firefox MV3 (manifest.firefox.json renamed to manifest.json)
 *
 * Same JS bundles in both — webextension-polyfill handles the runtime
 * namespace differences. Only the manifest shape differs.
 */
import * as esbuild from "esbuild";
import { copyFile, cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const watch = process.argv.includes("--watch");

const targets = [
  { outdir: "dist", manifest: "manifest.json" },
  { outdir: "dist-firefox", manifest: "manifest.firefox.json" },
];

const entryPoints = {
  background: "src/background.ts",
  content: "src/content.ts",
  "popup/main": "src/popup/main.ts",
  "options/main": "src/options/main.ts",
};

/** @type {(outdir: string) => import("esbuild").BuildOptions} */
const configFor = (outdir) => ({
  entryPoints,
  bundle: true,
  platform: "browser",
  target: ["chrome120", "firefox120"],
  format: "iife",
  outdir,
  sourcemap: true,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
});

async function copyAssets(outdir, manifestSrc) {
  const assets = [
    [manifestSrc, `${outdir}/manifest.json`],
    ["src/popup/index.html", `${outdir}/popup/index.html`],
    ["src/popup/style.css", `${outdir}/popup/style.css`],
    ["src/options/index.html", `${outdir}/options/index.html`],
    ["src/options/style.css", `${outdir}/options/style.css`],
  ];
  for (const [from, to] of assets) {
    if (!existsSync(from)) continue;
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
  if (existsSync("public")) {
    await cp("public", outdir, { recursive: true });
  }
}

async function buildTarget({ outdir, manifest }) {
  await mkdir(outdir, { recursive: true });
  const config = configFor(outdir);

  if (watch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    await copyAssets(outdir, manifest);
    console.log(`[bb] watching ${Object.keys(entryPoints).length} entries → ${outdir}/`);
  } else {
    await esbuild.build(config);
    await copyAssets(outdir, manifest);
    console.log(`[bb] built ${Object.keys(entryPoints).length} entries → ${outdir}/`);
  }
}

async function main() {
  // Targets are independent — build in parallel.
  await Promise.all(targets.map(buildTarget));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
