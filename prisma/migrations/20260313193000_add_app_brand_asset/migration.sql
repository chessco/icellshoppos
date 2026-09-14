CREATE TABLE "AppBrandAsset" (
    "id" TEXT NOT NULL,
    "data" BYTEA,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppBrandAsset_pkey" PRIMARY KEY ("id")
);
