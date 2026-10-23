import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  upsertContact: vi.fn(),
  unsubscribeContact: vi.fn(),
  welcome: vi.fn(),
  deleteContact: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("~/db.server", () => ({ default: { marketingSubscription: { findUnique: mocks.findUnique, update: mocks.update, deleteMany: mocks.deleteMany } } }));
vi.mock("~/models/resend.server", () => ({
  upsertResendContact: mocks.upsertContact,
  unsubscribeResendContact: mocks.unsubscribeContact,
  sendMarketingWelcomeEmail: mocks.welcome,
  deleteResendContact: mocks.deleteContact,
}));

import { deleteMarketingSubscription, syncMarketingSubscription } from "~/models/marketing-consent.server";

describe("marketing consent synchronization", () => {
  beforeEach(() => vi.resetAllMocks());

  it("retries a saved opt-out without resubscribing or sending email", async () => {
    const subscription = { shop: "example.myshopify.com", email: "owner@example.com", status: "UNSUBSCRIBED", resendSyncStatus: "FAILED" };
    mocks.findUnique.mockResolvedValue(subscription);
    mocks.unsubscribeContact.mockResolvedValue(undefined);
    await expect(syncMarketingSubscription(subscription.shop)).resolves.toEqual({ welcomeSent: false, welcomeSkipped: false });

    expect(mocks.unsubscribeContact).toHaveBeenCalledWith(subscription.email);
    expect(mocks.upsertContact).not.toHaveBeenCalled();
    expect(mocks.welcome).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resendSyncStatus: "SYNCED" }) }));
  });

  it("keeps an opt-out authoritative when a provider retry fails", async () => {
    const shop = "example.myshopify.com";
    mocks.findUnique.mockResolvedValue({ shop, email: "owner@example.com", status: "UNSUBSCRIBED" });
    mocks.unsubscribeContact.mockRejectedValue(new Error("Provider unavailable"));
    await expect(syncMarketingSubscription(shop)).rejects.toThrow("Provider unavailable");

    expect(mocks.update).toHaveBeenCalledWith({ where: { shop }, data: { resendSyncStatus: "FAILED", resendSyncError: "Provider unavailable" } });
    expect(mocks.upsertContact).not.toHaveBeenCalled();
    expect(mocks.welcome).not.toHaveBeenCalled();
  });

  it("does not send or create consent for an unknown shop", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(syncMarketingSubscription("new.myshopify.com")).rejects.toThrow("No active email subscription");
    expect(mocks.upsertContact).not.toHaveBeenCalled();
    expect(mocks.welcome).not.toHaveBeenCalled();
    expect(mocks.unsubscribeContact).not.toHaveBeenCalled();
  });

  it("preserves the provider identity and rejects cleanup when remote erasure fails", async () => {
    const shop = "example.myshopify.com";
    mocks.findUnique.mockResolvedValue({ shop, email: "owner@example.com" });
    mocks.deleteContact.mockRejectedValue(new Error("Provider unavailable"));
    await expect(deleteMarketingSubscription(shop)).rejects.toThrow("Provider unavailable");
    expect(mocks.deleteContact).toHaveBeenCalledWith("owner@example.com");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("can complete provider erasure and local cleanup on the next delivery", async () => {
    const shop = "example.myshopify.com";
    mocks.findUnique.mockResolvedValue({ shop, email: "owner@example.com" });
    mocks.deleteContact.mockRejectedValueOnce(new Error("Provider unavailable")).mockResolvedValueOnce(undefined);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteMarketingSubscription(shop)).rejects.toThrow("Provider unavailable");
    await expect(deleteMarketingSubscription(shop)).resolves.toEqual({ count: 1 });
    expect(mocks.deleteContact).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMany).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { shop } });
  });

  it("acknowledges already erased subscriptions without a provider request", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteMarketingSubscription("erased.myshopify.com")).resolves.toEqual({ count: 0 });
    expect(mocks.deleteContact).not.toHaveBeenCalled();
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { shop: "erased.myshopify.com" } });
  });
});
