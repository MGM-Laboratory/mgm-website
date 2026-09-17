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

  async onModuleInit() {
    await this.$connect();
    // The CMS tables are introduced after the original deployment and must be
    // available before the first CMS request. The statements are idempotent so
    // existing Railway and local databases are left intact.
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsMember" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsArticle" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsPublication" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsAdmin" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsJobPosting" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsJobApplication" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsResearchInitiative" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsProject" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsEvent" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsEventRegistration" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsContactSettings" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsHomeContent" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsContactInquiry" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
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
