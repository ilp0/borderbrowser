/**
 * JSON-LD structured-data extraction & application.
 *
 * Pages often carry rich structured data inside `<script type="application/ld+json">`
 * blocks (Recipe, FAQ, Article schemas). Search engines surface the user-facing
 * fields directly — recipe steps, FAQ questions and answers — so when the user
 * translates the page we must translate those fields too, otherwise the page's
 * visible content reads in the target language while the structured-data sidebar
 * stays in the original.
 *
 * Strategy:
 *  - Whitelist a handful of well-known schema fields. URLs, ISO durations
 *    (`PT30M`), enum codes, IDs etc. must never be translated.
 *  - Each whitelisted string becomes its own `TranslationUnit` with no DOM
 *    placeholders (the value is plain text, not HTML).
 *  - Apply path bypasses `decodeText` — that function escapes `<`, `>`, `&`
 *    into HTML entities, which would corrupt JSON values like
 *    `"articleBody": "Tom & Jerry"`.
 *  - One `JSON.stringify` write per `<script>` tag (not per field), grouping
 *    all of a script's translations and mutating the parsed object in memory
 *    before serializing once.
 *
 * Errors swallowed: any JSON.parse failure on a single script is logged and
 * that script is skipped. A malformed sibling block must not break extraction
 * from a valid one.
 */

import type { TranslationUnit } from "../types.ts";

/**
 * Schema-aware field whitelist. Keys are `@type` values; values are the
 * dot-paths inside that node whose string values are user-facing prose.
 *
 * Path syntax: `.field` for an object property, `[]` to walk every entry of
 * an array of strings, `[].field` for an array of objects → field on each.
 */
const FIELD_WHITELIST: Record<string, string[]> = {
  Recipe: [
    ".name",
    ".description",
    ".recipeInstructions[]",
    ".recipeInstructions[].text",
    ".recipeInstructions[].name",
  ],
  HowToStep: [".text", ".name"],
  FAQPage: [
    ".mainEntity[].name",
    ".mainEntity[].acceptedAnswer.text",
    ".mainEntity[].suggestedAnswer.text",
  ],
  Question: [".name", ".acceptedAnswer.text", ".suggestedAnswer.text"],
  Article: [".headline", ".description", ".articleBody"],
  NewsArticle: [".headline", ".description", ".articleBody"],
  BlogPosting: [".headline", ".description", ".articleBody"],
};

/**
 * One translatable string located inside a parsed JSON-LD document. The
 * `setTranslated` callback closes over the parent object/array reference and
 * the key/index where the string lives, so applying a translation is a single
 * in-place assignment — no path-string re-parsing.
 */
type JsonLdField = {
  script: HTMLScriptElement;
  /** Mutate the parsed JSON to replace the original string with `translated`. */
  setTranslated: (translated: string) => void;
};

export type JsonLdExtractResult = {
  units: TranslationUnit[];
  /** Per-unit-id, the field record needed to write the translation back. */
  fields: Map<number, JsonLdField>;
  /**
   * For each unique script element, the parsed JSON object we're mutating.
   * The applier serializes this once per script, not once per field.
   */
  scripts: Map<HTMLScriptElement, unknown>;
};

/**
 * Walk every `<script type="application/ld+json">` block under `root` and
 * return a flat list of translation units for the whitelisted fields.
 *
 * `startId` is the next free id — the caller must pass `1 + maxDomUnitId` so
 * JSON-LD ids never collide with DOM-extraction ids when both lists are merged
 * in the LLM request.
 */
export function extractJsonLd(
  root: ParentNode,
  startId = 1,
): JsonLdExtractResult {
  const units: TranslationUnit[] = [];
  const fields = new Map<number, JsonLdField>();
  const scripts = new Map<HTMLScriptElement, unknown>();
  let nextId = startId;

  const scriptEls = root.querySelectorAll(
    'script[type="application/ld+json"]',
  );

  for (const el of Array.from(scriptEls)) {
    const script = el as HTMLScriptElement;
    const raw = script.textContent ?? "";
    if (!raw.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // Malformed JSON-LD is common on the wild web. Skip — don't break.
      console.warn("[BorderBrowser] skipping malformed JSON-LD", err);
      continue;
    }

    // Dedupe set keyed by (parent identity, child key). A nested typed node
    // like HowToStep can be reached both via the outer Recipe's
    // `.recipeInstructions[].text` AND via walking into the HowToStep itself
    // and matching its own `.text` whitelist — without dedupe we'd emit two
    // identical units for the same string. Object identity is captured via
    // a per-pass WeakMap → integer mapping (see `objIdFn`).
    const seen = new Set<string>();
    const objIdFn = createObjId();
    const before = units.length;
    visitNode(parsed, script, units, fields, () => nextId++, seen, objIdFn);
    if (units.length > before) {
      scripts.set(script, parsed);
    }
  }

  return { units, fields, scripts };
}

/**
 * Per-extraction object-identity tagger. Each unique object ref encountered
 * gets a stable integer; we use the integer (not the ref) in dedupe-set keys
 * so we can build string keys without leaking refs into the global scope.
 */
function createObjId(): (x: unknown) => number {
  const ids = new WeakMap<object, number>();
  let counter = 0;
  return (x: unknown): number => {
    if (x === null || typeof x !== "object") return -1;
    let id = ids.get(x as object);
    if (id === undefined) {
      id = ++counter;
      ids.set(x as object, id);
    }
    return id;
  };
}

/**
 * Recursive walker. Handles three top-level shapes a JSON-LD block can take:
 *  - an object with `@type`
 *  - an object with `@graph` (an array of typed nodes)
 *  - a bare array of typed nodes
 *
 * For each typed object whose `@type` is in our whitelist, we extract the
 * named fields. We also recurse into nested objects so a Recipe embedded in
 * a `mainEntityOfPage` still gets picked up.
 */
function visitNode(
  node: unknown,
  script: HTMLScriptElement,
  units: TranslationUnit[],
  fields: Map<number, JsonLdField>,
  alloc: () => number,
  seen: Set<string>,
  objId: (x: unknown) => number,
): void {
  if (Array.isArray(node)) {
    for (const item of node) visitNode(item, script, units, fields, alloc, seen, objId);
    return;
  }
  if (!isObject(node)) return;

  // `@graph` containers are passthroughs — recurse into the entries.
  const graph = (node as Record<string, unknown>)["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) visitNode(item, script, units, fields, alloc, seen, objId);
  }

  const type = typeOf(node);
  const paths = type ? FIELD_WHITELIST[type] : undefined;
  if (paths) {
    for (const path of paths) {
      walkPath(node, path, (parent, keyOrIndex, value) => {
        if (typeof value !== "string") return;
        if (!value.trim()) return;
        const dedupeKey = `${objId(parent)}::${String(keyOrIndex)}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        const id = alloc();
        units.push({ id, kind: `jsonld:${type}${path}`, text: value, placeholders: new Map() });
        fields.set(id, {
          script,
          // The closure captures `parent` and `keyOrIndex` from when we found
          // the value. Mutating the same parsed object means the script-level
          // serializer picks up every field's update in one stringify pass.
          setTranslated: (translated: string) => {
            if (Array.isArray(parent)) {
              parent[keyOrIndex as number] = translated;
            } else {
              (parent as Record<string, unknown>)[keyOrIndex as string] = translated;
            }
          },
        });
      });
    }
  }

  // Recurse into all object/array children so nested typed nodes are found
  // (e.g. a Question inside FAQPage.mainEntity).
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (key === "@graph") continue; // already handled above
    const child = (node as Record<string, unknown>)[key];
    if (isObject(child) || Array.isArray(child)) {
      visitNode(child, script, units, fields, alloc, seen, objId);
    }
  }
}

/**
 * Walk a dot-path like `.recipeInstructions[].text` against `node` and call
 * `visit` once per terminal value found. Only emits when the leaf exists and
 * is reachable — silent on missing branches.
 *
 * Path tokens, parsed left-to-right:
 *  - `.field`  → step into `obj[field]`
 *  - `[]`      → for each array entry, continue with the rest
 *  - bare leaf → visit(parent, key, parent[key])
 */
function walkPath(
  node: unknown,
  path: string,
  visit: (parent: unknown, keyOrIndex: string | number, value: unknown) => void,
): void {
  // Tokenize: split on '.' and '[]', preserving order.
  const tokens: Array<{ kind: "field"; name: string } | { kind: "array" }> = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") {
      let j = i + 1;
      while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
      tokens.push({ kind: "field", name: path.slice(i + 1, j) });
      i = j;
    } else if (path.startsWith("[]", i)) {
      tokens.push({ kind: "array" });
      i += 2;
    } else {
      // Malformed path; bail out to avoid surprising behavior.
      return;
    }
  }

  // Walk the token stream and emit at the leaf. We carry `parent` + `key`
  // so the visitor can mutate in place.
  const recurse = (
    cur: unknown,
    parent: unknown,
    key: string | number,
    rest: typeof tokens,
  ): void => {
    if (rest.length === 0) {
      visit(parent, key, cur);
      return;
    }
    const [head, ...tail] = rest;
    if (!head) return;
    if (head.kind === "field") {
      if (!isObject(cur)) return;
      const next = (cur as Record<string, unknown>)[head.name];
      if (next === undefined) return;
      recurse(next, cur, head.name, tail);
    } else {
      if (!Array.isArray(cur)) return;
      for (let idx = 0; idx < cur.length; idx++) {
        recurse(cur[idx], cur, idx, tail);
      }
    }
  };

  // Initial call: the "parent" of the root is the root itself; we don't visit
  // the root anyway because every path starts with a step.
  recurse(node, node, "", tokens);
}

/**
 * Apply a batch of translations back to JSON-LD scripts in one synchronous
 * pass. This is the JSON-LD analog of `applyTranslationsBatch` and must be
 * called from inside the same atomic-swap section of the content script.
 *
 * Mutates the parsed objects in `result.scripts`, then writes one
 * `script.textContent = JSON.stringify(parsed)` per script — never re-parses.
 */
export function applyJsonLdTranslations(
  result: JsonLdExtractResult,
  translations: Map<number, string>,
): void {
  let touched = 0;
  for (const [id, field] of result.fields) {
    const t = translations.get(id);
    if (t === undefined) continue;
    field.setTranslated(t);
    touched++;
  }
  if (touched === 0) return;

  for (const [script, parsed] of result.scripts) {
    try {
      script.textContent = JSON.stringify(parsed);
    } catch (err) {
      // Should not happen — we just parsed it — but JSON.stringify can fail
      // on circular refs introduced by some weird mutation. Don't break.
      console.warn("[BorderBrowser] failed to stringify JSON-LD", err);
    }
  }
}

/**
 * Capture the original textContent of every JSON-LD script we touched, so the
 * "show original" toggle can restore them. Returned as a list of pairs
 * (`script` + original string); apply by reassigning `textContent`.
 */
export function snapshotJsonLdOriginals(
  result: JsonLdExtractResult,
): Array<{ script: HTMLScriptElement; original: string }> {
  const out: Array<{ script: HTMLScriptElement; original: string }> = [];
  for (const script of result.scripts.keys()) {
    out.push({ script, original: script.textContent ?? "" });
  }
  return out;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Read the schema type from a JSON-LD node. `@type` may be a single string
 * or an array; we only care that one of the listed types matches our
 * whitelist, so return whichever entry has whitelist coverage.
 */
function typeOf(node: Record<string, unknown>): string | undefined {
  const t = node["@type"];
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    for (const candidate of t) {
      if (typeof candidate === "string" && candidate in FIELD_WHITELIST) return candidate;
    }
    if (typeof t[0] === "string") return t[0];
  }
  return undefined;
}
