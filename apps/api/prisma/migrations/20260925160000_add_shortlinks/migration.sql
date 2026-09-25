-- CreateTable
CREATE TABLE "ShortLinkDomain" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cloudflareZoneId" TEXT,
    "cloudflareTokenEncrypted" TEXT,
    "railwayDomainId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortLinkDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "longUrl" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxClicks" INTEGER,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "passphraseSalt" TEXT,
    "passphraseHash" TEXT,
    "longUrlStatus" TEXT,
    "longUrlCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortLinkVisit" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "isView" BOOLEAN NOT NULL DEFAULT true,
    "isClick" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempt" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLinkVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortLinkDomain_hostname_key" ON "ShortLinkDomain"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_domainId_slug_key" ON "ShortLink"("domainId", "slug");

-- CreateIndex
CREATE INDEX "ShortLink_domainId_createdAt_idx" ON "ShortLink"("domainId", "createdAt");

-- CreateIndex
CREATE INDEX "ShortLinkVisit_linkId_createdAt_idx" ON "ShortLinkVisit"("linkId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ShortLinkDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLinkVisit" ADD CONSTRAINT "ShortLinkVisit_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ShortLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
