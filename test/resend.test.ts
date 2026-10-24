import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendMarketingWelcomeEmail,
  deleteResendContact,
  getResendContact,
  RESEND_TIMEOUT_MS,
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
    delete process.env.RESEND_REPLY_TO;
    vi.restoreAllMocks();
  });

  it("updates an existing contact", async () => {
    const response = () => new Response(JSON.stringify({ id: "contact_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi.fn().mockImplementation(async () => response());

    await expect(
      upsertResendContact("owner@example.com", fetchMock),
    ).resolves.toEqual({ id: "contact_1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/contacts/owner%40example.com",
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.resend.com/contacts/contact_1");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
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
      unsubscribeResendContact("gone-id", fetchMock),
    ).resolves.toBeUndefined();
  });

  it("deletes by immutable ID and rejects email-based destructive requests", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    await deleteResendContact("retired-contact-id", fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/contacts/retired-contact-id");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
    await expect(deleteResendContact("owner@example.com", fetchMock)).rejects.toThrow("valid contact ID");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats already-deleted IDs and missing email lookups idempotently", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    await expect(deleteResendContact("gone-id", fetchMock)).resolves.toBeUndefined();
    await expect(getResendContact("gone@example.com", fetchMock)).resolves.toBeNull();
  });

  it("bounds provider requests with an abort signal", async () => {
    const abort = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(abort.signal);
    const fetchMock = vi.fn(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("Provider timeout")), { once: true });
    }));
    const deletion = deleteResendContact("retired-id", fetchMock);
    abort.abort();
    await expect(deletion).rejects.toThrow("Provider timeout");
    expect(AbortSignal.timeout).toHaveBeenCalledWith(RESEND_TIMEOUT_MS);
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

  it("uses the current app name and support reply-to address", async () => {
    process.env.NORTH_STANDARD_POSTAL_ADDRESS = "123 Test St";
    process.env.RESEND_REPLY_TO = "";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await sendMarketingWelcomeEmail({
      email: "owner@example.com",
      shop: "example.myshopify.com",
      unsubscribeToken: "token",
      fetchImpl: fetchMock,
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.reply_to).toBe("support@northstandard.co");
    expect(payload.html).toContain("North Standard Sitemap Creator");
    expect(payload.text).toContain("North Standard Sitemap Creator");
  });
});
