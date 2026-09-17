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
  }
}
