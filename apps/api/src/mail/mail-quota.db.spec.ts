// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MailProviderId, MailProviderLimitConfig } from "@repo/shared";

import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "./mail.service.js";

const databaseUrl = process.env.DATABASE_URL;
const LIMIT = 3;
const TRIES = 7;

type Reserver = {
  reserveQuota(id: MailProviderId, config: MailProviderLimitConfig): Promise<unknown>;
};

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. Several sends can ask for the quota of one provider at the same moment.
// The rolling window counts the send log under an advisory lock, and the
// calendar window uses a guarded decrement. In both cases exactly LIMIT
// requests may win, whatever the number of requests.
describe.skipIf(!databaseUrl)("mail quota reservation on PostgreSQL", () => {
  let prisma: PrismaService;
  let reserver: Reserver;

  const winners = async (id: MailProviderId, config: MailProviderLimitConfig) => {
    const answers = await Promise.all(
      Array.from({ length: TRIES }, () => reserver.reserveQuota(id, config)),
    );
    return answers.filter((answer) => answer !== null);
  };

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    const config = { get: () => undefined };
    reserver = new MailService(config as never, prisma) as unknown as Reserver;
  });

  beforeEach(async () => {
    await prisma.mailSendLog.deleteMany({ where: { provider: "smtp" } });
    await prisma.mailProviderUsage.deleteMany({ where: { provider: "ses" } });
  });

  afterAll(async () => {
    await prisma.mailSendLog.deleteMany({ where: { provider: "smtp" } });
    await prisma.mailProviderUsage.deleteMany({ where: { provider: "ses" } });
    await prisma.$disconnect();
  });

  it("lets only the limit through in a rolling window", async () => {
    const won = await winners("smtp", { windowMode: "rolling", dailyLimit: LIMIT });
    expect(won).toHaveLength(LIMIT);
    expect(await prisma.mailSendLog.count({ where: { provider: "smtp" } })).toBe(LIMIT);
  });

  it("counts only the sends inside the window", async () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await prisma.mailSendLog.deleteMany({ where: { provider: "smtp" } });
    await prisma.mailSendLog.createMany({
      data: Array.from({ length: LIMIT }, () => ({ provider: "smtp", sentAt: old })),
    });
    const won = await winners("smtp", { windowMode: "rolling", dailyLimit: LIMIT });
    expect(won).toHaveLength(LIMIT);
  });

  it("lets only the remaining count through in a calendar window", async () => {
    await prisma.mailProviderUsage.create({
      data: {
        provider: "ses",
        dailyRemaining: LIMIT,
        dailyResetAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const won = await winners("ses", { windowMode: "calendar", dailyLimit: LIMIT });
    expect(won).toHaveLength(LIMIT);
    const usage = await prisma.mailProviderUsage.findUniqueOrThrow({ where: { provider: "ses" } });
    expect(usage.dailyRemaining).toBe(0);
  });
});
