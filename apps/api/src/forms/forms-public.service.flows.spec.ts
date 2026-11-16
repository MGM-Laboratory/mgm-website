import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { Prisma } from "../generated/prisma/client.js";
import { hashPassphrase } from "../shortlinks/shortlinks.utils.js";
import { FormsError } from "./forms.common.js";
import { FormsPublicService } from "./forms-public.service.js";
import { formTokenSecret, signFormToken } from "./forms.utils.js";

const geo = vi.hoisted(() => ({ lookupGeo: vi.fn() }));
vi.mock("../shortlinks/shortlinks.geo.js", () => geo);

const FIELDS = [
  { id: "name", type: "short_text", required: true },
  { id: "doc", type: "file_upload", accept: ["pdf"], maxFileMb: 1 },
  { id: "pic", type: "image_upload" },
  { id: "src", type: "hidden" },
];

function png(width: number, height: number) {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

type Options = {
  geolocate?: boolean;
  maxUploadBytes?: number;
  passphraseHash?: string | null;
  passphraseSalt?: string | null;
  responses?: number;
  settings?: Record<string, unknown>;
  status?: string;
};

function make(options: Options = {}) {
  const document = formDocumentSchema.parse({
    title: "Survey",
    fields: FIELDS,
    settings: { minSeconds: 3, ...options.settings },
  });
  const row = {
    id: "form1",
    passphraseHash: options.passphraseHash ?? null,
    passphraseSalt: options.passphraseSalt ?? null,
    slug: "survey",
    status: options.status ?? "published",
    data: document,
  };
  const prisma = {
    $queryRaw: vi.fn(async () => [{ locked: "" }]),
    $transaction: vi.fn(),
    form: { findUnique: vi.fn(async () => row as unknown) },
    formEvent: {
      createManyAndReturn: vi.fn(async () => [{ id: "ev1", ip: "8.8.8.8" }] as unknown[]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    formResponse: {
      count: vi.fn(async () => options.responses ?? 0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "resp1",
        ...data,
      })),
      findFirst: vi.fn(async () => null as unknown),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    formUpload: {
      create: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => [] as unknown[]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => unknown) => work(prisma));
  const storage = {
    deleteFile: vi.fn(async () => undefined),
    uploadFile: vi.fn(async () => ({ key: "k" })),
  };
  const values: Record<string, unknown> = {
    FORMS_MAX_UPLOAD_BYTES: options.maxUploadBytes ?? 100 * 1024 * 1024,
    SESSION_SECRET: "session-secret",
    SHORTLINKS_GEOLOCATE: options.geolocate ?? false,
  };
  const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
  const mailer = { responseReceived: vi.fn() };
  const service = new FormsPublicService(
    prisma as never,
    storage as never,
    config as never,
    mailer as never,
  );
  return { document, mailer, prisma, row, service, storage };
}

async function expectError(work: Promise<unknown>, status: number, message?: string) {
  const error = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(FormsError);
  expect((error as FormsError).status).toBe(status);
  if (message) expect((error as FormsError).message).toBe(message);
  return error as FormsError;
}

const META = {
  ip: "8.8.8.8",
  referer: "https://form.example/f",
  userAgent: "Mozilla/5.0 Chrome/120",
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const QUERY = { fieldId: "doc", sessionId: "sess" };

async function lockedForm() {
  const stored = await hashPassphrase("open sesame");
  return make({ passphraseHash: stored.hash, passphraseSalt: stored.salt });
}

function tokenFor(hash: string) {
  return signFormToken(formTokenSecret("session-secret"), "form1", hash);
}

afterEach(() => {
  vi.clearAllMocks();
  geo.lookupGeo.mockReset();
});

describe("FormsPublicService.publicForm and unlock", () => {
  it("answers 404 for an unknown slug and for a draft", async () => {
    const unknown = make();
    unknown.prisma.form.findUnique.mockResolvedValue(null);
    await expectError(unknown.service.publicForm("nope"), 404);
    await expectError(make({ status: "draft" }).service.publicForm("survey"), 404);
  });

  it("looks the slug up in lower case", async () => {
    const { prisma, service } = make();
    await service.publicForm("SURVEY");
    expect(prisma.form.findUnique).toHaveBeenCalledWith({ where: { slug: "survey" } });
  });

  it("serves an open form without a token when it has no passphrase", async () => {
    const payload = await make().service.publicForm("survey", "ignored");
    expect(payload.state).toBe("open");
    expect(payload).not.toHaveProperty("token");
  });

  it("serves a locked form to a visitor without a valid token", async () => {
    const { service } = await lockedForm();
    const payload = await service.publicForm("survey", "bad-token");
    expect(payload).toMatchObject({ slug: "survey", state: "locked", title: "Survey" });
    expect(payload).not.toHaveProperty("document");
  });

  it("serves the form and echoes the token for a valid one", async () => {
    const { row, service } = await lockedForm();
    const token = tokenFor(row.passphraseHash!);
    expect(await service.publicForm("survey", token)).toMatchObject({ state: "open", token });
  });

  it("reports an unavailable form before it asks for the passphrase", async () => {
    const { service } = make({ status: "closed" });
    expect(await service.publicForm("survey")).toMatchObject({
      reason: "closed",
      state: "unavailable",
    });
  });

  it("includes the opening time only for a form that is not open yet", async () => {
    const opensAt = new Date(Date.now() + 3600_000).toISOString();
    const early = await make({ settings: { opensAt } }).service.publicForm("survey");
    expect(early).toMatchObject({ opensAt, reason: "not_open_yet" });
    const closed = await make({ status: "closed", settings: { opensAt } }).service.publicForm(
      "survey",
    );
    expect((closed as { opensAt?: string }).opensAt).toBeUndefined();
  });

  it("opens a form without a passphrase on unlock", async () => {
    expect((await make().service.unlock("survey", "anything")).state).toBe("open");
  });

  it("answers 401 for a wrong passphrase", async () => {
    const { service } = await lockedForm();
    await expectError(service.unlock("survey", "wrong"), 401, "That passphrase is not right.");
  });

  it("returns a working token for the right passphrase", async () => {
    const { service } = await lockedForm();
    const unlocked = await service.unlock("survey", "open sesame");
    expect(unlocked.state).toBe("open");
    const token = (unlocked as { token?: string }).token;
    expect(token).toMatch(/^\d+\./);
    expect(await service.publicForm("survey", token)).toMatchObject({ state: "open" });
  });
});

describe("FormsPublicService.recordEvent", () => {
  const base = { sessionId: "sess", type: "view" as const };

  it("stores a view with the visitor fields and a dedupe key", async () => {
    const { prisma, service } = make();
    await service.recordEvent(
      "survey",
      { ...base, context: { language: "en", referrer: "https://r.example/" } },
      META,
    );
    const call = prisma.formEvent.createManyAndReturn.mock.calls[0] as unknown as [
      { data: Record<string, unknown>[]; skipDuplicates: boolean },
    ];
    expect(call[0].skipDuplicates).toBe(true);
    expect(call[0].data[0]).toMatchObject({
      browser: "Chrome",
      dedupeKey: "sess:view:",
      fieldId: null,
      ip: "8.8.8.8",
      language: "en",
      referer: "https://r.example/",
      type: "view",
    });
  });

  it("falls back to the header referer when the client sent no context", async () => {
    const { prisma, service } = make();
    await service.recordEvent("survey", base, META);
    const row = (
      prisma.formEvent.createManyAndReturn.mock.calls[0] as unknown as [
        { data: Record<string, unknown>[] },
      ]
    )[0].data[0];
    expect(row.referer).toBe("https://form.example/f");
  });

  it("stores no address when the form does not collect location", async () => {
    const { prisma, service } = make({ settings: { collectLocation: false } });
    await service.recordEvent("survey", base, META);
    const row = (
      prisma.formEvent.createManyAndReturn.mock.calls[0] as unknown as [
        { data: Record<string, unknown>[] },
      ]
    )[0].data[0];
    expect(row.ip).toBeNull();
  });

  it("requires the token of a locked form, from the header or the body", async () => {
    const { row, service } = await lockedForm();
    await expectError(service.recordEvent("survey", base, META), 401);
    const token = tokenFor(row.passphraseHash!);
    await expect(service.recordEvent("survey", { ...base, token }, META)).resolves.toEqual({
      ok: true,
    });
    await expect(service.recordEvent("survey", base, META, token)).resolves.toEqual({ ok: true });
  });

  it("counts a progress event for a question that exists", async () => {
    const { prisma, service } = make();
    await service.recordEvent("survey", { ...base, fieldId: "name", type: "progress" }, META);
    const row = (
      prisma.formEvent.createManyAndReturn.mock.calls[0] as unknown as [
        { data: Record<string, unknown>[] },
      ]
    )[0].data[0];
    expect(row).toMatchObject({ dedupeKey: "sess:progress:name", fieldId: "name" });
  });

  it("ignores progress on a removed question and on a non question block", async () => {
    const { prisma, service } = make();
    expect(
      await service.recordEvent("survey", { ...base, fieldId: "gone", type: "progress" }, META),
    ).toEqual({
      ok: true,
    });
    expect(prisma.formEvent.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("locates the visitor in the background and stores the place on the event", async () => {
    const { prisma, service } = make({ geolocate: true });
    geo.lookupGeo.mockResolvedValue({
      city: "Malang",
      country: "Indonesia",
      timezone: "Asia/Jakarta",
    });
    await service.recordEvent("survey", base, META);
    await flush();
    expect(geo.lookupGeo).toHaveBeenCalledWith("8.8.8.8");
    expect(prisma.formEvent.updateMany).toHaveBeenCalledWith({
      data: { city: "Malang", country: "Indonesia" },
      where: { id: { in: ["ev1"] } },
    });
  });

  it("skips the lookup for a duplicate event, a missing address or geolocation turned off", async () => {
    const dup = make({ geolocate: true });
    dup.prisma.formEvent.createManyAndReturn.mockResolvedValue([]);
    await dup.service.recordEvent("survey", base, META);
    const off = make({ geolocate: false });
    await off.service.recordEvent("survey", base, META);
    const noIp = make({ geolocate: true });
    noIp.prisma.formEvent.createManyAndReturn.mockResolvedValue([{ id: "e", ip: null }]);
    await noIp.service.recordEvent("survey", base, META);
    await flush();
    expect(geo.lookupGeo).not.toHaveBeenCalled();
  });

  it("does not fail the request when the lookup or the update fails", async () => {
    const { prisma, service } = make({ geolocate: true });
    geo.lookupGeo.mockResolvedValueOnce(null);
    await service.recordEvent("survey", base, META);
    geo.lookupGeo.mockResolvedValueOnce({ country: "Indonesia" });
    prisma.formEvent.updateMany.mockRejectedValueOnce(new Error("row gone"));
    await expect(service.recordEvent("survey", base, META)).resolves.toEqual({ ok: true });
    await flush();
    expect(prisma.formEvent.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("FormsPublicService.upload", () => {
  const pdf = (bytes = 10) => ({
    body: Buffer.alloc(bytes, 1),
    contentType: "application/pdf",
    fileName: "My Doc.pdf",
  });

  it("stores a file under a key of the form and records its row", async () => {
    const { prisma, service, storage } = make();
    const result = await service.upload("survey", QUERY, pdf(), undefined);
    expect(result.file).toMatchObject({ name: "My Doc.pdf", size: 10, type: "application/pdf" });
    expect(result.file.key).toMatch(/^formfile-form1-[0-9a-f-]{36}\.pdf$/);
    expect(storage.uploadFile).toHaveBeenCalledWith({
      body: expect.any(Buffer),
      contentType: "application/pdf",
      key: result.file.key,
    });
    expect(prisma.formUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fieldId: "doc",
        formId: "form1",
        height: null,
        sessionId: "sess",
        size: 10,
        width: null,
      }),
    });
  });

  it("requires the token of a locked form and an open form", async () => {
    const { service } = await lockedForm();
    await expectError(service.upload("survey", QUERY, pdf(), undefined), 401);
    await expectError(
      make({ status: "closed" }).service.upload("survey", QUERY, pdf(), undefined),
      409,
      "This form is closed.",
    );
  });

  it("refuses a question that takes no files", async () => {
    const { service } = make();
    await expectError(
      service.upload("survey", { fieldId: "name", sessionId: "s" }, pdf(), undefined),
      400,
      "That question does not take files.",
    );
    await expectError(
      service.upload("survey", { fieldId: "ghost", sessionId: "s" }, pdf(), undefined),
      400,
    );
  });

  it("refuses an empty body and a body that is not a buffer", async () => {
    const { service } = make();
    await expectError(
      service.upload("survey", QUERY, { ...pdf(), body: Buffer.alloc(0) }, undefined),
      400,
      "The file is empty.",
    );
    await expectError(service.upload("survey", QUERY, { ...pdf(), body: "text" }, undefined), 400);
    await expectError(service.upload("survey", QUERY, { ...pdf(), body: [1, 2] }, undefined), 400);
  });

  it("refuses a file over the limit of the question with the size in the message", async () => {
    const { service } = make();
    await expectError(
      service.upload("survey", QUERY, pdf(1024 * 1024 + 1), undefined),
      413,
      "The file must be under 1 MB.",
    );
  });

  it("uses the server limit when it is smaller than the limit of the question", async () => {
    const { service } = make({ maxUploadBytes: 2 * 1024 * 1024 });
    // The question allows 10 MB by default, so the server cap of 2 MB decides.
    await expectError(
      service.upload(
        "survey",
        { fieldId: "pic", sessionId: "s" },
        {
          body: Buffer.concat([png(1, 1), Buffer.alloc(2 * 1024 * 1024)]),
          contentType: "image/png",
          fileName: "a.png",
        },
        undefined,
      ),
      413,
      "The file must be under 2 MB.",
    );
  });

  it("refuses a file type that the question does not accept", async () => {
    const { service } = make();
    await expectError(
      service.upload(
        "survey",
        QUERY,
        { body: Buffer.from("x"), contentType: "text/plain", fileName: "a.txt" },
        undefined,
      ),
      400,
      "That file type is not accepted here.",
    );
  });

  it("sniffs an image upload and stores the type of its bytes with its size", async () => {
    const { prisma, service, storage } = make();
    const result = await service.upload(
      "survey",
      { fieldId: "pic", sessionId: "s" },
      { body: png(2, 3), contentType: "application/octet-stream", fileName: "photo.exe" },
      undefined,
    );
    expect(result.file.type).toBe("image/png");
    expect(result.file.key.endsWith(".png")).toBe(true);
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" }),
    );
    expect(prisma.formUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ height: 3, width: 2 }),
    });
  });

  it("refuses an image upload whose bytes are not an image", async () => {
    const { service } = make();
    await expectError(
      service.upload(
        "survey",
        { fieldId: "pic", sessionId: "s" },
        { body: Buffer.from("not an image"), contentType: "image/png", fileName: "a.png" },
        undefined,
      ),
      400,
      "That file is not a PNG, JPEG, WebP or GIF image.",
    );
  });

  it("answers 503 when storage fails and writes no row", async () => {
    const { prisma, service, storage } = make();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));
    await expectError(service.upload("survey", QUERY, pdf(), undefined), 503);
    expect(prisma.formUpload.create).not.toHaveBeenCalled();
  });

  it("sweeps old uploads at most once per ten minutes for a form", async () => {
    const { prisma, service } = make();
    await service.upload("survey", QUERY, pdf(), undefined);
    await service.upload("survey", QUERY, pdf(), undefined);
    await flush();
    expect(prisma.formUpload.findMany).toHaveBeenCalledTimes(1);
  });

  it("logs a failed sweep and still answers", async () => {
    const { prisma, service } = make();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    prisma.formUpload.findMany.mockRejectedValue(new Error("db down"));
    await expect(service.upload("survey", QUERY, pdf(), undefined)).resolves.toBeDefined();
    await flush();
    expect(warn).toHaveBeenCalledWith("Orphaned form upload sweep failed", "Error: db down");
    warn.mockRestore();
    expect(prisma.formUpload.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("FormsPublicService.submit extra paths", () => {
  const input = (extra: Record<string, unknown> = {}) =>
    ({
      answers: { name: "Ana" },
      sessionId: "sess",
      startedAt: new Date(Date.now() - 30_000).toISOString(),
      ...extra,
    }) as never;

  it("requires the token of a locked form", async () => {
    const { service } = await lockedForm();
    await expectError(service.submit("survey", input(), META), 401);
  });

  it("keeps only the utm values that are set and the clipped context", async () => {
    const { prisma, service } = make();
    await service.submit(
      "survey",
      input({
        context: {
          screen: "1920x1080",
          timezone: "Asia/Jakarta",
          utm: { campaign: "spring", medium: "", source: "mail" },
        },
      }),
      META,
    );
    const data = (
      prisma.formResponse.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data).toMatchObject({
      screen: "1920x1080",
      timezone: "Asia/Jakarta",
      utm: { campaign: "spring", source: "mail" },
    });
  });

  it("stores no utm when none is given", async () => {
    const { prisma, service } = make();
    await service.submit("survey", input({ context: { utm: { source: "" } } }), META);
    const data = (
      prisma.formResponse.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.utm).toBe(Prisma.DbNull);
  });

  it("answers 409 when two submissions race for one upload", async () => {
    const { prisma, service } = make();
    const key = "formfile-form1-00000000-0000-0000-0000-000000000001.pdf";
    prisma.formUpload.findMany.mockResolvedValue([
      {
        fieldId: "doc",
        formId: "form1",
        height: 5,
        key,
        name: "a.pdf",
        responseId: null,
        size: 3,
        type: "application/pdf",
        width: 4,
      },
    ]);
    prisma.formUpload.updateMany.mockResolvedValue({ count: 0 });
    await expectError(
      service.submit("survey", input({ answers: { doc: [{ key }], name: "Ana" } }), META),
      409,
      "One of the files was already submitted.",
    );
    expect(prisma.formEvent.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("keeps the dimensions of a stored image in the rewritten answer", async () => {
    const { prisma, service } = make();
    const key = "formfile-form1-00000000-0000-0000-0000-000000000002.png";
    prisma.formUpload.findMany.mockResolvedValue([
      {
        fieldId: "pic",
        formId: "form1",
        height: 5,
        key,
        name: "a.png",
        responseId: null,
        size: 3,
        type: "image/png",
        width: 4,
      },
    ]);
    await service.submit("survey", input({ answers: { name: "Ana", pic: [{ key }] } }), META);
    const data = (
      prisma.formResponse.create.mock.calls[0] as unknown as [
        { data: { answers: Record<string, unknown> } },
      ]
    )[0].data;
    expect(data.answers.pic).toEqual([
      { height: 5, key, name: "a.png", size: 3, type: "image/png", width: 4 },
    ]);
  });

  it("flags a key that appears twice as invalid", async () => {
    const { service } = make();
    const key = "formfile-form1-00000000-0000-0000-0000-000000000001.pdf";
    const error = await expectError(
      service.submit("survey", input({ answers: { doc: [{ key }, { key }], name: "Ana" } }), META),
      400,
    );
    expect(error.errors).toHaveProperty("doc");
  });

  it("rejects a file answer that is not a list of keyed items without reading uploads", async () => {
    const { prisma, service } = make();
    const error = await expectError(
      service.submit("survey", input({ answers: { doc: "nope", name: "Ana" } }), META),
      400,
    );
    expect(error.errors).toHaveProperty("doc");
    expect(prisma.formUpload.findMany).not.toHaveBeenCalled();
  });

  it("locates the visitor and stores the place on the event and the response", async () => {
    const { prisma, service } = make({ geolocate: true });
    geo.lookupGeo.mockResolvedValue({ city: "Malang", timezone: "Asia/Jakarta" });
    prisma.formResponse.create.mockImplementation(async ({ data }) => ({
      id: "resp1",
      ...data,
      ip: "8.8.8.8",
    }));
    await service.submit("survey", input(), META);
    await flush();
    expect(prisma.formEvent.updateMany).toHaveBeenCalledWith({
      data: { city: "Malang" },
      where: { id: { in: ["ev1"] } },
    });
    expect(prisma.formResponse.updateMany).toHaveBeenCalledWith({
      data: { city: "Malang" },
      where: { id: "resp1" },
    });
    expect(prisma.formResponse.updateMany).toHaveBeenCalledWith({
      data: { timezone: "Asia/Jakarta" },
      where: { id: "resp1", timezone: null },
    });
  });

  it("does not store a timezone from the lookup when the place has none", async () => {
    const { prisma, service } = make({ geolocate: true });
    geo.lookupGeo.mockResolvedValue({ city: "Malang" });
    prisma.formResponse.create.mockImplementation(async ({ data }) => ({
      id: "resp1",
      ...data,
      ip: "8.8.8.8",
    }));
    await service.submit("survey", input(), META);
    await flush();
    expect(prisma.formResponse.updateMany).toHaveBeenCalledTimes(1);
  });
});
