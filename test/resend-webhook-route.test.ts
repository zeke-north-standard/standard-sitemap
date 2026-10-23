import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ markUnsubscribed: vi.fn() }));
vi.mock("~/models/marketing-consent.server", () => ({ markMarketingUnsubscribedByEmail: mocks.markUnsubscribed }));
import { action } from "../app/routes/webhooks.resend";

const key = Buffer.from("local-test-key-for-resend-webhooks");
function signed(payload: string, signature?: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const id = "msg-local-fixture";
  return new Request("https://app.example.com/webhooks/resend", {
    method: "POST", body: payload,
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature ?? `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64")}` },
  });
}

describe("Resend contact webhook", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${key.toString("base64")}`); });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects an invalid signature before any contact update", async () => {
    const response = await action({ request: signed('{"type":"contact.deleted","data":{"email":"owner@example.com"}}', "v1,invalid") } as never);
    expect(response.status).toBe(400);
    expect(mocks.markUnsubscribed).not.toHaveBeenCalled();
  });

  it.each(["not-json", "null", "[]", "42"])("returns a controlled error for signed invalid payload %s", async (payload) => {
    expect((await action({ request: signed(payload) } as never)).status).toBe(400);
    expect(mocks.markUnsubscribed).not.toHaveBeenCalled();
  });

  it.each(["contact.deleted", "contact.updated"])("records authenticated opt-out %s", async (type) => {
    const response = await action({ request: signed(JSON.stringify({ type, data: { email: "owner@example.com", unsubscribed: true } })) } as never);
    expect(response.status).toBe(200);
    expect(mocks.markUnsubscribed).toHaveBeenCalledWith("owner@example.com");
  });

  it("does not create consent from a provider resubscription or unknown event", async () => {
    const response = await action({ request: signed(JSON.stringify({ type: "contact.updated", data: { email: "owner@example.com", unsubscribed: false } })) } as never);
    expect(response.status).toBe(200);
    expect(mocks.markUnsubscribed).not.toHaveBeenCalled();
  });

  it("ignores invalid email values without crashing the route", async () => {
    const response = await action({ request: signed(JSON.stringify({ type: "contact.deleted", data: { email: { attacker: true } } })) } as never);
    expect(response.status).toBe(200);
    expect(mocks.markUnsubscribed).not.toHaveBeenCalled();
  });
});
