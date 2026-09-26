◇ injected env (25) from .env // tip: ⌘ enable debugging { debug: true }
-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "data" JSONB NOT NULL,
    "passphraseSalt" TEXT,
    "passphraseHash" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "endingId" TEXT,
    "sessionId" TEXT,
    "deviceId" TEXT,
    "spam" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "language" TEXT,
    "screen" TEXT,
    "utm" JSONB,
    "startedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormEvent" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fieldId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormUpload" (
    "key" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "sessionId" TEXT,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "responseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormUpload_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- CreateIndex
CREATE INDEX "FormResponse_formId_createdAt_idx" ON "FormResponse"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "FormResponse_formId_deviceId_idx" ON "FormResponse"("formId", "deviceId");

-- CreateIndex
CREATE INDEX "FormEvent_formId_createdAt_idx" ON "FormEvent"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "FormEvent_formId_type_idx" ON "FormEvent"("formId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FormEvent_formId_dedupeKey_key" ON "FormEvent"("formId", "dedupeKey");

-- CreateIndex
CREATE INDEX "FormUpload_formId_createdAt_idx" ON "FormUpload"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "FormUpload_responseId_idx" ON "FormUpload"("responseId");

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEvent" ADD CONSTRAINT "FormEvent_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormUpload" ADD CONSTRAINT "FormUpload_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
