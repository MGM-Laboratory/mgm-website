-- CreateTable
CREATE TABLE "FormMedia" (
    "formId" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "FormMedia_pkey" PRIMARY KEY ("formId","key")
);

-- CreateIndex
CREATE INDEX "FormMedia_key_idx" ON "FormMedia"("key");

-- AddForeignKey
ALTER TABLE "FormMedia" ADD CONSTRAINT "FormMedia_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
