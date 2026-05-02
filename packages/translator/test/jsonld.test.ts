import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  extractJsonLd,
  applyJsonLdTranslations,
} from "../src/browser/extract-jsonld.ts";

/**
 * Tests for JSON-LD structured-data extraction & application.
 *
 * Covers the three flagship schemas the unit targets (Recipe, FAQPage,
 * Article) plus the two key robustness properties: (a) only whitelisted
 * fields become units — never URLs/durations/IDs/enums — and (b) a malformed
 * sibling block must not break extraction from a valid one.
 */

function dom(html: string): { root: ParentNode; window: typeof globalThis & Window } {
  const j = new JSDOM(`<!DOCTYPE html><html>${html}</html>`);
  return {
    root: j.window.document,
    window: j.window as unknown as typeof globalThis & Window,
  };
}

describe("extractJsonLd", () => {
  it("returns no units when there is no JSON-LD on the page", () => {
    const { root } = dom(`<body><p>Hi</p></body>`);
    const result = extractJsonLd(root);
    assert.equal(result.units.length, 0);
    assert.equal(result.scripts.size, 0);
  });

  it("extracts whitelisted Recipe fields and skips URLs/durations", () => {
    const recipe = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Crêpes au sucre",
      description: "Une recette française classique.",
      image: "https://example.com/crepes.jpg",
      author: { "@type": "Person", name: "Marie" },
      datePublished: "2020-01-15",
      totalTime: "PT30M",
      recipeYield: "8",
      recipeCuisine: "French",
      recipeInstructions: [
        {
          "@type": "HowToStep",
          name: "Mélanger",
          text: "Mélanger la farine et les œufs.",
          url: "https://example.com/step-1",
        },
        {
          "@type": "HowToStep",
          text: "Cuire la pâte dans une poêle chaude.",
        },
      ],
    };

    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(recipe)}</script></body>`,
    );
    const result = extractJsonLd(root);

    const texts = result.units.map((u) => u.text).sort();
    assert.deepEqual(texts, [
      "Crêpes au sucre",
      "Cuire la pâte dans une poêle chaude.",
      "Mélanger",
      "Mélanger la farine et les œufs.",
      "Une recette française classique.",
    ]);

    // URL, ISO duration, dates, enums and the embedded Person.name (Person
    // isn't in the whitelist) must be left alone.
    for (const u of result.units) {
      assert.notEqual(u.text, "https://example.com/crepes.jpg");
      assert.notEqual(u.text, "PT30M");
      assert.notEqual(u.text, "2020-01-15");
      assert.notEqual(u.text, "French");
      assert.notEqual(u.text, "Marie");
    }
  });

  it("extracts FAQPage Question.name and acceptedAnswer.text", () => {
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Comment réinitialiser mon mot de passe ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Cliquez sur « Mot de passe oublié » sur la page de connexion.",
          },
        },
        {
          "@type": "Question",
          name: "Où puis-je télécharger l'application ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "L'application est disponible sur les principales boutiques.",
          },
        },
      ],
    };

    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(faq)}</script></body>`,
    );
    const result = extractJsonLd(root);
    assert.equal(result.units.length, 4);
    const texts = new Set(result.units.map((u) => u.text));
    assert.ok(texts.has("Comment réinitialiser mon mot de passe ?"));
    assert.ok(
      texts.has("Cliquez sur « Mot de passe oublié » sur la page de connexion."),
    );
  });

  it("extracts Article headline / description / articleBody", () => {
    const article = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: "Les nouvelles du jour",
      description: "Résumé bref.",
      articleBody: "Le contenu complet de l'article ici.",
      url: "https://example.com/article",
      image: "https://example.com/img.jpg",
    };
    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(article)}</script></body>`,
    );
    const result = extractJsonLd(root);
    const texts = result.units.map((u) => u.text).sort();
    assert.deepEqual(texts, [
      "Le contenu complet de l'article ici.",
      "Les nouvelles du jour",
      "Résumé bref.",
    ]);
  });

  it("skips a malformed JSON-LD block but still extracts a valid sibling", () => {
    const valid = {
      "@type": "Recipe",
      name: "Tarte aux pommes",
      description: "Une tarte simple.",
    };
    const { root } = dom(`
      <body>
        <script type="application/ld+json">{not valid json,</script>
        <script type="application/ld+json">${JSON.stringify(valid)}</script>
      </body>
    `);
    const result = extractJsonLd(root);
    const texts = result.units.map((u) => u.text).sort();
    assert.deepEqual(texts, ["Tarte aux pommes", "Une tarte simple."]);
  });

  it("starts at the supplied id offset to avoid colliding with DOM units", () => {
    const recipe = { "@type": "Recipe", name: "Crêpe" };
    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(recipe)}</script></body>`,
    );
    const result = extractJsonLd(root, 100);
    assert.equal(result.units.length, 1);
    assert.equal(result.units[0]!.id, 100);
  });

  it("walks @graph containers", () => {
    const block = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Recipe", name: "Croque-monsieur" },
        { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Pourquoi ?" }] },
      ],
    };
    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(block)}</script></body>`,
    );
    const result = extractJsonLd(root);
    const texts = new Set(result.units.map((u) => u.text));
    assert.ok(texts.has("Croque-monsieur"));
    assert.ok(texts.has("Pourquoi ?"));
  });

  it("handles a top-level array of nodes", () => {
    const blocks = [
      { "@type": "Recipe", name: "Tarte" },
      { "@type": "Article", headline: "Titre" },
    ];
    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(blocks)}</script></body>`,
    );
    const result = extractJsonLd(root);
    const texts = new Set(result.units.map((u) => u.text));
    assert.ok(texts.has("Tarte"));
    assert.ok(texts.has("Titre"));
  });

  it("handles plain string entries in recipeInstructions", () => {
    const recipe = {
      "@type": "Recipe",
      name: "Soupe",
      recipeInstructions: [
        "Chauffer l'eau.",
        "Ajouter les légumes.",
      ],
    };
    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(recipe)}</script></body>`,
    );
    const result = extractJsonLd(root);
    const texts = new Set(result.units.map((u) => u.text));
    assert.ok(texts.has("Chauffer l'eau."));
    assert.ok(texts.has("Ajouter les légumes."));
  });

  it("ignores empty <script> tags and unrelated script types", () => {
    const { root } = dom(`
      <body>
        <script type="application/ld+json"></script>
        <script type="application/ld+json">   </script>
        <script>console.log("ignored")</script>
        <script type="application/json">{"@type":"Recipe","name":"Ignored"}</script>
      </body>
    `);
    const result = extractJsonLd(root);
    assert.equal(result.units.length, 0);
  });
});

describe("applyJsonLdTranslations", () => {
  it("writes translations back into the JSON-LD script as one stringify per script", () => {
    const recipe = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Crêpes au sucre",
      description: "Une recette française classique.",
      recipeInstructions: [
        { "@type": "HowToStep", text: "Mélanger la farine et les œufs." },
      ],
    };
    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(recipe)}</script></body>`,
    );
    const result = extractJsonLd(root);
    const translations = new Map<number, string>();
    for (const u of result.units) {
      if (u.text === "Crêpes au sucre") translations.set(u.id, "Sugar pancakes");
      else if (u.text === "Une recette française classique.")
        translations.set(u.id, "A classic French recipe.");
      else if (u.text === "Mélanger la farine et les œufs.")
        translations.set(u.id, "Mix the flour and eggs.");
    }

    applyJsonLdTranslations(result, translations);

    const script = (root as Document).querySelector(
      'script[type="application/ld+json"]',
    )!;
    const parsed = JSON.parse(script.textContent ?? "");
    assert.equal(parsed.name, "Sugar pancakes");
    assert.equal(parsed.description, "A classic French recipe.");
    assert.equal(parsed.recipeInstructions[0].text, "Mix the flour and eggs.");
    // Non-translated fields are preserved.
    assert.equal(parsed["@type"], "Recipe");
    assert.equal(parsed["@context"], "https://schema.org");
    assert.equal(parsed.recipeInstructions[0]["@type"], "HowToStep");
  });

  it("does not HTML-escape special characters in JSON values", () => {
    // This is the primary reason JSON-LD has its own apply path: the regular
    // `decodeText` HTML-escapes <, >, & — corrupting JSON values like
    // "Tom & Jerry" into "Tom &amp; Jerry".
    const article = {
      "@type": "Article",
      headline: "Original",
      articleBody: "X",
    };
    const { root } = dom(
      `<body><script type="application/ld+json">${JSON.stringify(article)}</script></body>`,
    );
    const result = extractJsonLd(root);
    const translations = new Map<number, string>();
    for (const u of result.units) {
      if (u.text === "Original") translations.set(u.id, "A & B < C > D");
    }
    applyJsonLdTranslations(result, translations);

    const script = (root as Document).querySelector(
      'script[type="application/ld+json"]',
    )!;
    const parsed = JSON.parse(script.textContent ?? "");
    assert.equal(parsed.headline, "A & B < C > D");
  });

  it("leaves the script untouched when no translations are supplied", () => {
    const recipe = { "@type": "Recipe", name: "Tarte" };
    const original = JSON.stringify(recipe);
    const { root } = dom(
      `<body><script type="application/ld+json">${original}</script></body>`,
    );
    const result = extractJsonLd(root);
    applyJsonLdTranslations(result, new Map());

    const script = (root as Document).querySelector(
      'script[type="application/ld+json"]',
    )!;
    // Original textContent is preserved (no rewrite occurred).
    assert.equal(script.textContent, original);
  });
});
