ALTER TABLE "MarketingSubscription"
ADD COLUMN "resendContactEmail" TEXT,
ADD COLUMN "resendContactSyncedAt" TIMESTAMP(3),
ADD COLUMN "resendErasurePending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resendErasureContactId" TEXT,
ADD COLUMN "resendErasureEmail" TEXT;

UPDATE "MarketingSubscription"
SET "resendContactEmail" = "email",
    "resendContactSyncedAt" = CASE
      WHEN "status" = 'SUBSCRIBED' AND "resendSyncStatus" = 'SYNCED'
      THEN "resendSyncedAt" ELSE NULL END
WHERE "resendContactId" IS NOT NULL AND "resendSyncStatus" = 'SYNCED';

CREATE INDEX "MarketingSubscription_email_idx" ON "MarketingSubscription"("email");
CREATE INDEX "MarketingSubscription_pending_erasure_email_idx"
ON "MarketingSubscription"("resendErasureEmail", "resendErasurePending");
