-- CreateTable
CREATE TABLE "MailOutbox" (
    "id" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailOutbox_status_nextAttemptAt_idx" ON "MailOutbox"("status", "nextAttemptAt");
