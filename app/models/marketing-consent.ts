export const MARKETING_CONSENT_VERSION = "2026-08-26-v1";
export const MARKETING_CONSENT_SOURCE = "post-publication-admin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeMarketingEmail(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function validateMarketingEmail(value: unknown) {
  const email = normalizeMarketingEmail(value);

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error("Enter a valid business email address.");
  }

  return email;
}
