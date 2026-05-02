import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { localizeText } from "../src/localize.ts";

// `Intl.NumberFormat` and `Intl.DateTimeFormat` use locale-specific separators
// that may render as NBSP, NNBSP, or thin-space depending on ICU version. We
// normalize spaces in assertions to keep tests robust across Node versions.
function ws(s: string): string {
  return s.replace(/[   ]/g, " ");
}

describe("localizeText - numbers", () => {
  it("reformats en number to fr (space thousands, comma decimal)", () => {
    const out = localizeText("Total: 1,234.56 items", "fr", {});
    assert.equal(ws(out), "Total: 1 234,56 items");
  });

  it("reformats en number to de (dot thousands, comma decimal)", () => {
    const out = localizeText("Total: 1,234.56 items", "de", {});
    assert.equal(ws(out), "Total: 1.234,56 items");
  });

  it("reformats large en number with multiple thousands separators", () => {
    const out = localizeText("It cost 1,234,567.89 dollars.", "fr", {});
    assert.equal(ws(out), "It cost 1 234 567,89 dollars.");
  });

  it("leaves bare integers like 2025 alone (no thousands separator)", () => {
    const out = localizeText("In 2025 the count was 42.", "fr", {});
    // Must not gain a separator; "2025" stays "2025", "42" stays "42".
    assert.equal(out, "In 2025 the count was 42.");
  });

  it("is idempotent on already-fr-formatted output (no en match)", () => {
    const input = "Total: 1 234,56 items";
    const out = localizeText(input, "fr", {});
    assert.equal(ws(out), "Total: 1 234,56 items");
  });

  it("is a passthrough when target is already en", () => {
    const out = localizeText("Total: 1,234.56 items", "en", {});
    // en formatting equals input shape
    assert.equal(out, "Total: 1,234.56 items");
  });

  it("does not touch text inside translation placeholder markers", () => {
    // Markers must be preserved exactly; the number outside still localizes.
    const out = localizeText("[1]Read[/1] 1,234.56 items", "fr", {});
    assert.equal(ws(out), "[1]Read[/1] 1 234,56 items");
  });

  it("preserves placeholders even when they sit between two numbers", () => {
    const out = localizeText("1,000.5 [1/]2,000.25", "de", {});
    assert.equal(ws(out), "1.000,5 [1/]2.000,25");
  });
});

describe("localizeText - dates", () => {
  it("preserves ISO YYYY-MM-DD verbatim (treated as ambiguous-safe)", () => {
    const out = localizeText("Posted on 2025-03-12 at noon.", "fr", {});
    assert.equal(out, "Posted on 2025-03-12 at noon.");
  });

  it("reformats MM/DD/YYYY for fr target (DD/MM/YYYY-style)", () => {
    const out = localizeText("Posted on 03/12/2025 today.", "fr", {});
    // fr: dd/mm/yyyy
    assert.equal(ws(out), "Posted on 12/03/2025 today.");
  });

  it("reformats MM/DD/YYYY for de target (DD.MM.YYYY)", () => {
    const out = localizeText("Posted on 03/12/2025 today.", "de", {});
    assert.equal(ws(out), "Posted on 12.03.2025 today.");
  });

  it("leaves invalid dates alone", () => {
    const out = localizeText("Code 13/45/2025 isn't a date.", "fr", {});
    assert.equal(out, "Code 13/45/2025 isn't a date.");
  });
});

describe("localizeText - units (metric target)", () => {
  it("converts °F to °C", () => {
    const out = localizeText("It's 100°F outside.", "fr", { unitSystem: "metric" });
    assert.equal(out, "It's 37.8°C outside.");
  });

  it("converts mi to km", () => {
    const out = localizeText("Trail is 5 mi long.", "fr", { unitSystem: "metric" });
    assert.equal(out, "Trail is 8 km long.");
  });

  it("converts lbs to kg", () => {
    const out = localizeText("Weighs 10 lbs.", "fr", { unitSystem: "metric" });
    assert.equal(out, "Weighs 4.5 kg.");
  });
});

describe("localizeText - units (imperial target)", () => {
  it("converts °C to °F", () => {
    const out = localizeText("It's 0°C outside.", "en", { unitSystem: "imperial" });
    assert.equal(out, "It's 32°F outside.");
  });

  it("converts km to mi", () => {
    const out = localizeText("Trail is 10 km long.", "en", { unitSystem: "imperial" });
    assert.equal(out, "Trail is 6.2 mi long.");
  });

  it("converts kg to lbs", () => {
    const out = localizeText("Weighs 10 kg.", "en", { unitSystem: "imperial" });
    assert.equal(out, "Weighs 22 lbs.");
  });
});

describe("localizeText - units (no flip when unitSystem absent)", () => {
  it("does NOT convert units when unitSystem is omitted", () => {
    const out = localizeText("It's 100°F and 5 mi.", "fr", {});
    // Number "100" has no thousands separator so it survives; the unit text
    // must not be rewritten.
    assert.match(out, /100\s*°\s*F/);
    assert.match(out, /5\s*mi/);
  });
});

describe("localizeText - currency annotation", () => {
  it("is OFF by default (no annotation appended)", () => {
    const out = localizeText("Costs €42.", "en", {});
    assert.equal(out, "Costs €42.");
  });

  it("is OFF when currencyAnnotate=true but no rates supplied", () => {
    const out = localizeText("Costs €42.", "en", { currencyAnnotate: true });
    assert.equal(out, "Costs €42.");
  });

  it("annotates when rates supplied and currencyAnnotate=true", () => {
    const out = localizeText("Costs €42.", "en", {
      currencyAnnotate: true,
      rates: { EUR: 1.08, USD: 1 },
      annotateAs: "USD",
    });
    assert.equal(out, "Costs €42 (~$45).");
  });

  it("does NOT annotate when source currency equals target currency", () => {
    const out = localizeText("Costs $42.", "en", {
      currencyAnnotate: true,
      rates: { USD: 1 },
      annotateAs: "USD",
    });
    assert.equal(out, "Costs $42.");
  });
});

describe("localizeText - skip when absent", () => {
  it("returns text unchanged when target is en and no opts", () => {
    const input = "Hello world, 1,234.56 and 03/12/2025.";
    // en target: number reformat is a no-op; date stays MM/DD/YYYY in en.
    const out = localizeText(input, "en", {});
    assert.equal(out, input);
  });
});
