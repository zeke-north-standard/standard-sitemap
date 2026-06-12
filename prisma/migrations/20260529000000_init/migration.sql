CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT,
  "expires" TIMESTAMP(3),
  "accessToken" TEXT,
  "userId" BIGINT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT,
  "collaborator" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false,
  "refreshToken" TEXT,
  "refreshTokenExpires" TIMESTAMP(3),
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SitemapShop" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "configJson" TEXT NOT NULL,
  "manifestJson" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "lastSyncStatus" TEXT NOT NULL DEFAULT 'NEVER_SYNCED',
  "lastSyncError" TEXT,
  "totalLinks" INTEGER NOT NULL DEFAULT 0,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "sitemapPageId" TEXT,
  "sitemapPageHandle" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SitemapShop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SitemapChunk" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "linkCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SitemapChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SitemapShop_shop_key" ON "SitemapShop"("shop");
CREATE INDEX "SitemapChunk_shop_section_idx" ON "SitemapChunk"("shop", "section");
CREATE UNIQUE INDEX "SitemapChunk_shop_section_chunkIndex_key" ON "SitemapChunk"("shop", "section", "chunkIndex");

ALTER TABLE "SitemapChunk"
  ADD CONSTRAINT "SitemapChunk_shop_fkey"
  FOREIGN KEY ("shop") REFERENCES "SitemapShop"("shop")
  ON DELETE CASCADE ON UPDATE CASCADE;
