import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";

type Tx = Prisma.TransactionClient;
type Ddl = Pick<Tx, "$executeRawUnsafe">;

const BOOT_DDL_LOCK_NAME = "mgm-website:boot-ddl";
const BOOT_LOCK_TIMEOUT_MS = 10_000;
const BOOT_STATEMENT_TIMEOUT_MS = 60_000;
const BOOT_CONNECT_WAIT_MS = 10_000;
const BOOT_TRANSACTION_TIMEOUT_MS = 120_000;

/**
 * The object that a boot statement creates, as `table:Name`, `index:Name` or
 * `column:Table.Name`. `IF NOT EXISTS` skips the work, but PostgreSQL takes
 * the lock on the table first (SHARE for an index, ACCESS EXCLUSIVE for a
 * column). Reading the catalog takes no such lock, so a statement for an
 * object that exists is not sent at all.
 */
export function ddlTarget(statement: string): string | null {
  const create = /CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"/i.exec(
    statement,
  );
  if (create) return `${create[1]?.toLowerCase()}:${create[2]}`;
  const alter = /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"/i.exec(
    statement,
  );
  return alter ? `column:${alter[1]}.${alter[2]}` : null;
}

/** Sends only the statements whose object is missing, and remembers what it made. */
function missingOnly(tx: Ddl, existing: Set<string>): Ddl {
  return {
    $executeRawUnsafe: (async (statement: string) => {
      const target = ddlTarget(statement);
      if (target && existing.has(target)) return 0;
      const result = await tx.$executeRawUnsafe(statement);
      if (target) existing.add(target);
      return result;
    }) as unknown as Ddl["$executeRawUnsafe"],
  };
}

async function existingObjects(tx: Tx): Promise<Set<string>> {
  const rows = await tx.$queryRaw<{ name: string }[]>`
    SELECT 'table:' || tablename AS name FROM pg_tables WHERE schemaname = current_schema()
    UNION ALL
    SELECT 'index:' || indexname FROM pg_indexes WHERE schemaname = current_schema()
    UNION ALL
    SELECT 'column:' || table_name || '.' || column_name
    FROM information_schema.columns WHERE table_schema = current_schema()`;
  return new Set(rows.map((row) => row.name));
}

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
    // The statements run in one transaction behind an advisory lock. Two API
    // copies that start together then create the tables one after the other,
    // and not at the same time, which can fail on the catalog of PostgreSQL.
    // The catalog is read first, and only a missing object gets a statement,
    // so a start on a database that is up to date takes no lock on a table.
    // The timeouts keep a start from hanging behind a long transaction of
    // another session. A start that cannot get its locks fails and the
    // container restarts.
    await this.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${BOOT_LOCK_TIMEOUT_MS}ms'`);
        await tx.$executeRawUnsafe(
          `SET LOCAL statement_timeout = '${BOOT_STATEMENT_TIMEOUT_MS}ms'`,
        );
        // The function returns void, which the driver adapter cannot read through $queryRaw.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BOOT_DDL_LOCK_NAME}))`;
        await this.createTables(missingOnly(tx, await existingObjects(tx)));
      },
      { maxWait: BOOT_CONNECT_WAIT_MS, timeout: BOOT_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async createTables(tx: Ddl) {
    // The CMS tables are introduced after the original deployment and must be
    // available before the first CMS request. The statements are idempotent so
    // existing and local databases are left intact.
    for (const table of PrismaService.JSON_SLUG_TABLES) {
      await tx.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "${table}" (
          "slug" TEXT PRIMARY KEY,
          "data" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL
        )
      `);
    }
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MailProviderUsage" (
        "provider" TEXT PRIMARY KEY,
        "dailyRemaining" INTEGER,
        "dailyResetAt" TIMESTAMP(3),
        "longRemaining" INTEGER,
        "longResetAt" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MailSendLog" (
        "id" TEXT PRIMARY KEY,
        "provider" TEXT NOT NULL,
        "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MailSendLog_provider_sentAt_idx" ON "MailSendLog" ("provider", "sentAt")
    `);
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MailOutbox" (
        "id" TEXT PRIMARY KEY,
        "params" JSONB NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastError" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MailOutbox_status_nextAttemptAt_idx" ON "MailOutbox" ("status", "nextAttemptAt")
    `);
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MailRoutingState" (
        "key" TEXT PRIMARY KEY,
        "value" INTEGER NOT NULL DEFAULT 0
      )
    `);
    // Link-shortener tables, created at boot the same way (see
    // prisma/migrations/20260925160000_add_shortlinks for the durable
    // record). Constraints live inside the CREATE statements so repeated
    // boots are no-ops, matching the migration's schema exactly.
    await tx.$executeRawUnsafe(`
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
    await tx.$executeRawUnsafe(`
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
    await tx.$executeRawUnsafe(`
      ALTER TABLE "ShortLinkDomain" ADD COLUMN IF NOT EXISTS "railwayDomainId" TEXT
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "ShortLinkDomain" ADD COLUMN IF NOT EXISTS "verifyToken" TEXT
    `);
    await tx.$executeRawUnsafe(`
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
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ShortLink_domainId_createdAt_idx" ON "ShortLink" ("domainId", "createdAt")
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ShortLinkVisit_linkId_createdAt_idx" ON "ShortLinkVisit" ("linkId", "createdAt")
    `);
    await this.createFormTables(tx);
  }

  // Form builder tables, created at boot like the ones above (see
  // prisma/migrations/20260926120000_add_forms for the durable record, which
  // these statements mirror column for column).
  private async createFormTables(tx: Ddl) {
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Form" (
        "id" TEXT PRIMARY KEY,
        "slug" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "data" JSONB NOT NULL,
        "passphraseSalt" TEXT,
        "passphraseHash" TEXT,
        "publishedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FormResponse" (
        "id" TEXT PRIMARY KEY,
        "formId" TEXT NOT NULL REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FormEvent" (
        "id" TEXT PRIMARY KEY,
        "formId" TEXT NOT NULL REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FormUpload" (
        "key" TEXT PRIMARY KEY,
        "formId" TEXT NOT NULL REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "fieldId" TEXT NOT NULL,
        "sessionId" TEXT,
        "name" TEXT NOT NULL,
        "size" INTEGER NOT NULL,
        "type" TEXT NOT NULL,
        "width" INTEGER,
        "height" INTEGER,
        "responseId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FormMedia" (
        "formId" TEXT NOT NULL REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "key" TEXT NOT NULL,
        CONSTRAINT "FormMedia_pkey" PRIMARY KEY ("formId", "key")
      )
    `);
    const indexes = [
      `CREATE UNIQUE INDEX IF NOT EXISTS "Form_slug_key" ON "Form" ("slug")`,
      `CREATE INDEX IF NOT EXISTS "FormResponse_formId_createdAt_idx" ON "FormResponse" ("formId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "FormResponse_formId_deviceId_idx" ON "FormResponse" ("formId", "deviceId")`,
      `CREATE INDEX IF NOT EXISTS "FormEvent_formId_createdAt_idx" ON "FormEvent" ("formId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "FormEvent_formId_type_idx" ON "FormEvent" ("formId", "type")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "FormEvent_formId_dedupeKey_key" ON "FormEvent" ("formId", "dedupeKey")`,
      `CREATE INDEX IF NOT EXISTS "FormUpload_formId_createdAt_idx" ON "FormUpload" ("formId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "FormUpload_responseId_idx" ON "FormUpload" ("responseId")`,
      `CREATE INDEX IF NOT EXISTS "FormMedia_key_idx" ON "FormMedia" ("key")`,
    ];
    for (const statement of indexes) await tx.$executeRawUnsafe(statement);
  }
}
