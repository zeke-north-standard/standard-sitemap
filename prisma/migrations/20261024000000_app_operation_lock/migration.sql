CREATE TABLE "AppOperationLock" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "credentialFingerprint" TEXT,
    "lastCleanupStatus" TEXT,
    "lastCleanupAt" TIMESTAMP(3),
    "reauthRequired" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AppOperationLock_pkey" PRIMARY KEY ("id")
);
