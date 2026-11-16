// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { PrismaService } from "../prisma/prisma.service.js";
import { FormsError } from "./forms.common.js";
import { FormsPublicService } from "./forms-public.service.js";
import type { SubmissionBody } from "./forms.schemas.js";

const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "db-submit-spec-";
const META = { ip: null, referer: null, userAgent: "Mozilla/5.0 Chrome/120" };

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. The submit of a form takes an advisory lock through $queryRaw, and the
// response limit and the one-per-device rule are checked under that lock.
// This proves the lock statement works on the real driver and that parallel
// submits cannot go past either rule.
describe.skipIf(!databaseUrl)("form submit under the advisory lock on PostgreSQL", () => {
  let prisma: PrismaService;
  let service: FormsPublicService;
  const mailer = { responseReceived: vi.fn() };

  async function makeForm(name: string, settings: Record<string, unknown>) {
    const document = formDocumentSchema.parse({
      title: "Lock spec",
      fields: [{ id: "name", type: "short_text", required: true }],
      settings,
    });
    return prisma.form.create({
      data: { slug: `${PREFIX}${name}`, status: "published", data: document },
    });
  }

  const body = (sessionId: string, deviceId?: string): SubmissionBody => ({
    sessionId,
    answers: { name: "Ana" },
    ...(deviceId ? { deviceId } : {}),
  });

  const outcomes = (results: PromiseSettledResult<unknown>[]) =>
    results.map((result) =>
      result.status === "fulfilled"
        ? "stored"
        : result.reason instanceof FormsError
          ? `refused ${result.reason.status}`
          : "other",
    );

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: () => databaseUrl } as never);
    await prisma.onModuleInit();
    await prisma.form.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    const values: Record<string, unknown> = { SESSION_SECRET: "spec", SHORTLINKS_GEOLOCATE: false };
    const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
    service = new FormsPublicService(prisma, {} as never, config as never, mailer as never);
  });

  afterAll(async () => {
    await prisma.form.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("takes the lock with a text cast, which the driver can read", async () => {
    const rows = await prisma.$transaction(
      (tx) =>
        tx.$queryRaw<
          { locked: string }[]
        >`SELECT pg_advisory_xact_lock(hashtext(${"lock-form"}))::text AS "locked"`,
    );
    expect(rows).toHaveLength(1);
  });

  it("stores one response when two submits of one device overlap", async () => {
    const form = await makeForm("device", { onePerDevice: true });
    const results = await Promise.allSettled([
      service.submit(form.slug, body("session-a", "device-1"), META),
      service.submit(form.slug, body("session-b", "device-1"), META),
    ]);
    expect(outcomes(results).sort()).toEqual(["refused 409", "stored"]);
    expect(await prisma.formResponse.count({ where: { formId: form.id } })).toBe(1);
    expect(await prisma.formEvent.count({ where: { formId: form.id, type: "submit" } })).toBe(1);
  });

  it("lets two devices submit at the same time", async () => {
    const form = await makeForm("devices", { onePerDevice: true });
    const results = await Promise.allSettled([
      service.submit(form.slug, body("session-a", "device-1"), META),
      service.submit(form.slug, body("session-b", "device-2"), META),
    ]);
    expect(outcomes(results)).toEqual(["stored", "stored"]);
    expect(await prisma.formResponse.count({ where: { formId: form.id } })).toBe(2);
  });

  it("never stores more than the response limit when submits overlap", async () => {
    const form = await makeForm("limit", { responseLimit: 2 });
    const results = await Promise.allSettled(
      ["a", "b", "c", "d"].map((id) => service.submit(form.slug, body(`session-${id}`), META)),
    );
    expect(outcomes(results).sort()).toEqual(["refused 409", "refused 409", "stored", "stored"]);
    expect(await prisma.formResponse.count({ where: { formId: form.id } })).toBe(2);
  });
});
