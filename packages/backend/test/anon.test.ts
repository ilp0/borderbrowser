/**
 * Anonymous-key flow validation tests.
 *
 * We don't spin up Stripe or a Worker here — the validator is exported pure so
 * we can assert that `{ anonymous: true, amountUsdCents: 1000 }` passes
 * without requiring an email, and that omitting both still fails.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateBuy } from "../src/billing.ts";

describe("validateBuy", () => {
  it("accepts an anonymous purchase without email", () => {
    const v = validateBuy({ anonymous: true, amountUsdCents: 1000 });
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.isAnon, true);
      assert.equal(v.email, null);
      assert.equal(v.amountUsdCents, 1000);
    }
  });

  it("accepts a regular purchase with a valid email", () => {
    const v = validateBuy({ email: "user@example.com", amountUsdCents: 500 });
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.isAnon, false);
      assert.equal(v.email, "user@example.com");
    }
  });

  it("rejects a non-anonymous purchase missing the email", () => {
    const v = validateBuy({ amountUsdCents: 1000 });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.error, "invalid_email");
  });

  it("rejects a non-anonymous purchase with a malformed email", () => {
    const v = validateBuy({ email: "not-an-email", amountUsdCents: 1000 });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.error, "invalid_email");
  });

  it("rejects an anonymous purchase with an unsupported amount", () => {
    const v = validateBuy({ anonymous: true, amountUsdCents: 1234 });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.error, "invalid_amount");
  });

  it("rejects an anonymous purchase missing the amount", () => {
    const v = validateBuy({ anonymous: true });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.error, "invalid_amount");
  });
});
