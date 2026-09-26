import { describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import type { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { FormsError } from "./forms.common.js";
import type { FormsMailer } from "./forms.mailer.js";
import { FormsPublicService } from "./forms-public.service.js";

const FILE_KEY = "formfile-form1-00000000-0000-0000-0000-000000000001.pdf";

function makeDocument(settings: Record<string, unknown> = {}) {
  return formDocumentSchema.parse({
    title: "Survey",
    fields: [
      { id: "name", type: "short_text", required: true },
      { id: "doc", type: "file_upload" },
    ],
    settings: { minSeconds: 3, ...settings },
  });
}

function makeService(
  settings: Record<string, unknown> = {},
  overrides: { responses?: number } = {},
) {
  const row = {
    id: "form1",
    slug: "survey",
    status: "published",
    data: makeDocument(settings),
    passphraseHash: null,
    passphraseSalt: null,
  };
  const prisma = {
    form: { findUnique: vi.fn().mockResolvedValue(row) },
    formResponse: {
      count: vi.fn().mockResolvedValue(overrides.responses ?? 0),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: "resp1", createdAt: new Date(), ...data }),
        ),
      updateMany: vi.fn(),
    },
    formUpload: {
      findMany: vi.fn().mockResolvedValue([
        {
          key: FILE_KEY,
          formId: "form1",
          fieldId: "doc",
          responseId: null,
          name: "Stored.pdf",
          size: 1234,
          type: "application/pdf",
          width: null,
          height: null,
        },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    formEvent: {
      createManyAndReturn: vi.fn().mockResolvedValue([{ id: "ev1" }]),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ locked: "" }]),
  };
  prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => unknown) => work(prisma));
  const config = {
    get: (key: string) => (key === "SHORTLINKS_GEOLOCATE" ? false : undefined),
    getOrThrow: (key: string) =>
      key === "ADMIN_PASSPHRASE" ? "secret" : key === "FORMS_MAX_UPLOAD_BYTES" ? 104_857_600 : "",
  } as unknown as ConfigService<never, true>;
  const mailer = { responseReceived: vi.fn() };
  const service = new FormsPublicService(
    prisma as unknown as PrismaService,
    {} as StorageService,
    config as never,
    mailer as unknown as FormsMailer,
  );
  return { service, prisma, mailer };
}

const meta = {
  ip: "8.8.8.8",
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
  referer: null,
};
const startedAt = () => new Date(Date.now() - 30_000).toISOString();

async function expectFormsError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(FormsError);
  expect((error as FormsError).status).toBe(status);
  return error as FormsError;
}

describe("FormsPublicService.submit", () => {
  it("stores a valid response, replaces file metadata with the stored one and notifies", async () => {
    const { service, prisma, mailer } = makeService();
    const result = await service.submit(
      "survey",
      {
        sessionId: "s1",
        startedAt: startedAt(),
        answers: {
          name: " Ana ",
          doc: [{ key: FILE_KEY, name: "evil.exe", size: 1, type: "text/html" }],
        },
      },
      meta,
    );
    expect(result).toEqual({ ok: true, responseId: "resp1", endingId: "default", score: null });
    const data = prisma.formResponse.create.mock.calls[0][0].data;
    expect(data.answers).toEqual({
      name: "Ana",
      doc: [{ key: FILE_KEY, name: "Stored.pdf", size: 1234, type: "application/pdf" }],
    });
    expect(data.spam).toBe(false);
    expect(data.browser).toBe("Chrome");
    expect(prisma.formUpload.updateMany).toHaveBeenCalledWith({
      where: { key: { in: [FILE_KEY] }, formId: "form1", responseId: null },
      data: { responseId: "resp1" },
    });
    expect(mailer.responseReceived).toHaveBeenCalledTimes(1);
  });

  it("stores honeypot and too-fast submissions as spam without emails", async () => {
    for (const extra of [{ website: "http://x" }, { startedAt: new Date().toISOString() }]) {
      const { service, prisma, mailer } = makeService();
      await service.submit(
        "survey",
        { sessionId: "s1", startedAt: startedAt(), answers: { name: "Bot" }, ...extra },
        meta,
      );
      expect(prisma.formResponse.create.mock.calls[0][0].data.spam).toBe(true);
      expect(mailer.responseReceived).not.toHaveBeenCalled();
    }
  });

  it("returns field errors for missing answers and foreign files", async () => {
    const { service, prisma } = makeService();
    prisma.formUpload.findMany.mockResolvedValue([
      { key: FILE_KEY, formId: "other", fieldId: "doc", responseId: null },
    ]);
    const error = await expectFormsError(
      service.submit(
        "survey",
        { sessionId: "s1", answers: { doc: [{ key: FILE_KEY, name: "a", size: 1, type: "x" }] } },
        meta,
      ),
      400,
    );
    expect(error.errors).toEqual({ name: { code: "required" }, doc: { code: "files" } });
    expect(prisma.formResponse.create).not.toHaveBeenCalled();
  });

  it("requires a device id when the form takes one response per device", async () => {
    const { service, prisma } = makeService({ onePerDevice: true });
    await expectFormsError(
      service.submit("survey", { sessionId: "s1", answers: { name: "A" } }, meta),
      400,
    );
    expect(prisma.formResponse.create).not.toHaveBeenCalled();
  });

  it("rechecks the response limit inside the locked transaction", async () => {
    const { service, prisma } = makeService({ responseLimit: 2 });
    // The open check still sees room; a parallel submission fills it before the insert.
    prisma.formResponse.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await expectFormsError(
      service.submit("survey", { sessionId: "s1", answers: { name: "A" } }, meta),
      409,
    );
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.formResponse.create).not.toHaveBeenCalled();
  });

  it("refuses a second response from the same device", async () => {
    const { service, prisma } = makeService({ onePerDevice: true });
    prisma.formResponse.findFirst.mockResolvedValue({ id: "earlier" });
    await expectFormsError(
      service.submit("survey", { sessionId: "s1", deviceId: "d1", answers: { name: "A" } }, meta),
      409,
    );
  });

  it("refuses submissions over the limit or outside the schedule", async () => {
    await expectFormsError(
      makeService({ responseLimit: 5 }, { responses: 5 }).service.submit(
        "survey",
        { sessionId: "s1", answers: { name: "A" } },
        meta,
      ),
      409,
    );
    await expectFormsError(
      makeService({ opensAt: "2999-01-01T00:00:00Z" }).service.submit(
        "survey",
        { sessionId: "s1", answers: { name: "A" } },
        meta,
      ),
      409,
    );
  });

  it("stores no IP when the form doesn't collect location", async () => {
    const { service, prisma } = makeService({ collectLocation: false });
    await service.submit(
      "survey",
      { sessionId: "s1", startedAt: startedAt(), answers: { name: "A" } },
      meta,
    );
    expect(prisma.formResponse.create.mock.calls[0][0].data.ip).toBeNull();
  });
});

describe("FormsPublicService.publicForm", () => {
  it("reports why a form is unavailable", async () => {
    const payload = await makeService(
      { responseLimit: 1, closedTitle: "Full" },
      { responses: 1 },
    ).service.publicForm("survey");
    expect(payload).toMatchObject({
      state: "unavailable",
      reason: "limit_reached",
      closedTitle: "Full",
    });
  });

  it("never sends admin-only settings", async () => {
    const payload = await makeService({ notifyEmails: ["admin@example.com"] }).service.publicForm(
      "survey",
    );
    expect(payload.state).toBe("open");
    expect(JSON.stringify(payload)).not.toContain("admin@example.com");
  });
});
