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
  }
}
