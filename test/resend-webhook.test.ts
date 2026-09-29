import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyResendWebhook } from "~/models/resend-webhook.server";

describe("verifyResendWebhook", () => {
  it("accepts a current valid Svix signature", () => {
    const key = randomBytes(32);
    const secret = `whsec_${key.toString("base64")}`;
    const id = "msg_test";
    const timestamp = "1780000000";
    const payload = '{"type":"contact.updated"}';
    const signature = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");

    expect(
      verifyResendWebhook({
        payload,
        id,
        timestamp,
        signature: `v1,${signature}`,
        secret,
        now: Number(timestamp) * 1000,
      }),
    ).toBe(true);
  });

  it("rejects stale or modified payloads", () => {
    const key = randomBytes(32);
    const secret = `whsec_${key.toString("base64")}`;
    const timestamp = "1780000000";
    const signature = createHmac("sha256", key)
      .update(`msg_test.${timestamp}.original`)
      .digest("base64");

    expect(
      verifyResendWebhook({
        payload: "modified",
        id: "msg_test",
        timestamp,
        signature: `v1,${signature}`,
        secret,
        now: (Number(timestamp) + 600) * 1000,
      }),
    ).toBe(false);
  });
});
