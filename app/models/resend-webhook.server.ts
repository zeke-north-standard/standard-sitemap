import { createHmac, timingSafeEqual } from "node:crypto";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhook({
  payload,
  id,
  timestamp,
  signature,
  secret,
  now = Date.now(),
}: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: number;
}) {
  if (!id || !timestamp || !signature || !secret.startsWith("whsec_")) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(now / 1000 - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest();

  return signature.split(" ").some((part) => {
    const [version, encoded] = part.split(",", 2);
    if (version !== "v1" || !encoded) return false;

    try {
      const candidate = Buffer.from(encoded, "base64");
      return (
        candidate.length === expected.length &&
        timingSafeEqual(candidate, expected)
      );
    } catch {
      return false;
    }
  });
}
