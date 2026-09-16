-- CreateTable
CREATE TABLE "MailProviderUsage" (
    "provider" TEXT NOT NULL,
    "dailyRemaining" INTEGER,
    "dailyResetAt" TIMESTAMP(3),
    "longRemaining" INTEGER,
    "longResetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailProviderUsage_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "MailSendLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailSendLog_provider_sentAt_idx" ON "MailSendLog"("provider", "sentAt");

-- CreateTable
CREATE TABLE "MailRoutingState" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MailRoutingState_pkey" PRIMARY KEY ("key")
);
