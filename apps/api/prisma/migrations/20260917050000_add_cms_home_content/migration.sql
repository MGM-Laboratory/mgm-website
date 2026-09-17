-- CreateTable
CREATE TABLE "CmsHomeContent" (
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsHomeContent_pkey" PRIMARY KEY ("slug")
);
