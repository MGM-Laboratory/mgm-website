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
    // The CMS table is introduced after the original deployment and must be
    // available before the first CMS request. The statement is idempotent so
    // existing Railway and local databases are left intact.
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CmsMember" (
        "slug" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
  }
}
