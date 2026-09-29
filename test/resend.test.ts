import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendMarketingWelcomeEmail,
  unsubscribeResendContact,
  upsertResendContact,
} from "~/models/resend.server";

describe("Resend integration", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.NORTH_STANDARD_POSTAL_ADDRESS;
    vi.restoreAllMocks();
  });

  it("updates an existing contact", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "contact_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      upsertResendContact("owner@example.com", fetchMock),
    ).resolves.toEqual({ id: "contact_1" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/contacts/owner%40example.com",
    );
  });

  it("creates a contact when no existing contact is found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "contact_2" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      upsertResendContact("new@example.com", fetchMock),
    ).resolves.toEqual({ id: "contact_2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.resend.com/contacts");
  });

  it("treats a missing contact as already unsubscribed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      unsubscribeResendContact("gone@example.com", fetchMock),
    ).resolves.toBeUndefined();
  });

  it("does not send the welcome email without a mailing address", async () => {
    const fetchMock = vi.fn();

    await expect(
      sendMarketingWelcomeEmail({
        email: "owner@example.com",
        shop: "example.myshopify.com",
        unsubscribeToken: "token",
        fetchImpl: fetchMock,
      }),
    ).resolves.toEqual({ sent: false, reason: "POSTAL_ADDRESS_MISSING" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
