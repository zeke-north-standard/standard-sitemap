CREATE TABLE "MarketingSubscription" (
  "shop" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBSCRIBED',
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "consentSource" TEXT NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "unsubscribedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingSubscription_pkey" PRIMARY KEY ("shop")
);
