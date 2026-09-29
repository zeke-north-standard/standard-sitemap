ALTER TABLE "MarketingSubscription"
  ADD COLUMN "unsubscribeToken" TEXT,
  ADD COLUMN "resendContactId" TEXT,
  ADD COLUMN "resendSyncStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
  ADD COLUMN "resendSyncError" TEXT,
  ADD COLUMN "resendSyncedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeEmailId" TEXT,
  ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "MarketingSubscription_unsubscribeToken_key"
  ON "MarketingSubscription"("unsubscribeToken");
