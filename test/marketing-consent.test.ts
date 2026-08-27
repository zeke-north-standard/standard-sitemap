import { describe, expect, it } from "vitest";
import {
  normalizeMarketingEmail,
  validateMarketingEmail,
} from "~/models/marketing-consent";

describe("marketing consent email validation", () => {
  it("normalizes a valid business email", () => {
    expect(normalizeMarketingEmail("  Owner@Example.COM ")).toBe(
      "owner@example.com",
    );
    expect(validateMarketingEmail("  Owner@Example.COM ")).toBe(
      "owner@example.com",
    );
  });

  it.each(["", "owner", "owner@", "@example.com", "owner @example.com"])(
    "rejects invalid address %s",
    (email) => {
      expect(() => validateMarketingEmail(email)).toThrow(
        "Enter a valid business email address.",
      );
    },
  );
});
