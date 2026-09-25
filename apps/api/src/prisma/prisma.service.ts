import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(configService: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.getOrThrow<string>("DATABASE_URL"),
      }),
    });
  }

  // Every one of these collections is a slug-keyed JSONB blob table with the
  // same shape, added incrementally as each CMS collection shipped — looping
  // over the names instead of repeating the statement keeps that repetition
  // from being flagged as duplicated code as new collections are added.
  private static readonly JSON_SLUG_TABLES = [
    "CmsMember",
    "CmsArticle",
    "CmsPublication",
    "CmsAdmin",
    "CmsJobPosting",
    "CmsJobApplication",
    "CmsResearchInitiative",
    "CmsProject",
    "CmsEvent",
    "CmsEventRegistration",
    "CmsContactSettings",
    "CmsHomeContent",
    "CmsContactInquiry",
  ] as const;

  async onModuleInit() {
    await this.$connect();
    // The CMS tables are introduced after the original deployment and must be
    // available before the first CMS request. The statements are idempotent so
    // existing Railway and local databases are left intact.
    for (const table of PrismaService.JSON_SLUG_TABLES) {
      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "${table}" (
          "slug" TEXT PRIMARY KEY,
          "data" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL
        )
      `);
    }
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MailProviderUsage" (
        "provider" TEXT PRIMARY KEY,
        "dailyRemaining" INTEGER,
        "dailyResetAt" TIMESTAMP(3),
        "longRemaining" INTEGER,
        "longResetAt" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MailSendLog" (
        "id" TEXT PRIMARY KEY,
        "provider" TEXT NOT NULL,
        "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MailSendLog_provider_sentAt_idx" ON "MailSendLog" ("provider", "sentAt")
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MailRoutingState" (
        "key" TEXT PRIMARY KEY,
        "value" INTEGER NOT NULL DEFAULT 0
      )
    `);
    // Link-shortener tables, created at boot the same way (see
    // prisma/migrations/20260925160000_add_shortlinks for the durable
    // record). Constraints live inside the CREATE statements so repeated
    // boots are no-ops, matching the migration's schema exactly.
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShortLinkDomain" (
        "id" TEXT PRIMARY KEY,
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
        CONSTRAINT "ShortLinkDomain_hostname_key" UNIQUE ("hostname")
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShortLink" (
        "id" TEXT PRIMARY KEY,
        "slug" TEXT NOT NULL,
        "longUrl" TEXT NOT NULL,
        "domainId" TEXT NOT NULL REFERENCES "ShortLinkDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
        CONSTRAINT "ShortLink_domainId_slug_key" UNIQUE ("domainId", "slug")
      )
    `);
    // Columns added after the first rollout: the CREATE above only covers
    // fresh tables, this covers databases that already had one.
    await this.$executeRawUnsafe(`
      ALTER TABLE "ShortLinkDomain" ADD COLUMN IF NOT EXISTS "railwayDomainId" TEXT
    `);
    await this.$executeRawUnsafe(`
      ALTER TABLE "ShortLinkDomain" ADD COLUMN IF NOT EXISTS "verifyToken" TEXT
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShortLinkVisit" (
        "id" TEXT PRIMARY KEY,
        "linkId" TEXT NOT NULL REFERENCES "ShortLink"("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ShortLink_domainId_createdAt_idx" ON "ShortLink" ("domainId", "createdAt")
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ShortLinkVisit_linkId_createdAt_idx" ON "ShortLinkVisit" ("linkId", "createdAt")
    `);
  }
}
