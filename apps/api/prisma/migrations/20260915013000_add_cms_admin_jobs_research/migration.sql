-- CreateTable
CREATE TABLE "CmsAdmin" (
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsAdmin_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "CmsJobPosting" (
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsJobPosting_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "CmsJobApplication" (
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsJobApplication_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "CmsResearchInitiative" (
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsResearchInitiative_pkey" PRIMARY KEY ("slug")
);
