// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from "vitest";

import {
  FormsResponsesService,
  RESPONSES_PAGE_MAX,
  toResponseRecord,
} from "./forms-responses.service.js";
import { FormsError } from "./forms.common.js";

const UPLOAD_KEY = "formfile-f1-00000000-0000-0000-0000-000000000001.pdf";
const OTHER_FORM_KEY = "formfile-f2-00000000-0000-0000-0000-000000000001.pdf";

const DOCUMENT = {
  title: "T",
  fields: [
    { id: "name", type: "short_text", required: true },
    { id: "n", type: "number", min: 0, max: 10 },
  ],
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    answers: { name: "Ana" },
    browser: "Firefox",
    city: "Malang",
    country: "Indonesia",
    createdAt: new Date("2030-01-01T00:00:00Z"),
    deviceId: "dev",
    device: "desktop",
    durationMs: 1000,
    editedAt: null,
    endingId: null,
    flagged: false,
    formId: "f1",
    id: "r1",
    ip: "203.0.113.9",
    language: "en",
    latitude: 1,
    longitude: 2,
    note: null,
    os: "Linux",
    referer: null,
    region: "East Java",
    reviewed: false,
    score: null,
    screen: "1x1",
    sessionId: "s1",
    spam: false,
    starred: false,
    startedAt: null,
    tags: [] as string[] | null,
    timezone: "Asia/Jakarta",
    userAgent: "ua",
    utm: null,
    ...overrides,
  };
}

function make() {
  const prisma = {
    $executeRaw: vi.fn(async () => 2),
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
    formResponse: {
      deleteMany: vi.fn(async () => ({ count: 3 })),
      findFirst: vi.fn(),
      findMany: vi.fn(async () => [] as unknown[]),
      update: vi.fn(async ({ data }: { data: object }) => row({ ...data })),
      updateMany: vi.fn(async () => ({ count: 4 })),
    },
    formUpload: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(),
      findMany: vi.fn(async () => [] as unknown[]),
    },
  };
  const storage = {
    getSignedDownloadUrl: vi.fn(async () => "https://signed.example/f"),
    readFile: vi.fn(async () => Buffer.from("bytes")),
  };
  const forms = {
    deleteObjects: vi.fn(async () => undefined),
    require: vi.fn(async () => ({ data: DOCUMENT, id: "f1" })),
  };
  const service = new FormsResponsesService(prisma as never, storage as never, forms as never);
  return { forms, prisma, service, storage };
}

describe("toResponseRecord", () => {
  it("maps a row to the admin record with ISO dates", () => {
    const record = toResponseRecord(
      row({
        editedAt: new Date("2030-01-02T00:00:00Z"),
        startedAt: new Date("2030-01-01T00:00:00Z"),
        utm: { source: "x" },
      }) as never,
    );
    expect(record.meta.startedAt).toBe("2030-01-01T00:00:00.000Z");
    expect(record.admin.editedAt).toBe("2030-01-02T00:00:00.000Z");
    expect(record.meta.utm).toEqual({ source: "x" });
    expect(record.createdAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("uses nulls and an empty tag list when the columns hold NULL", () => {
    const record = toResponseRecord(row({ tags: null }) as never);
    expect(record.admin.tags).toEqual([]);
    expect(record.meta.startedAt).toBeNull();
    expect(record.meta.utm).toBeNull();
    expect(record.admin.editedAt).toBeNull();
  });
});

describe("FormsResponsesService.list", () => {
  it("returns a page and no cursor when the rows fit", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findMany.mockResolvedValue([row({ id: "a" }), row({ id: "b" })]);
    const result = await service.list("f1");
    expect(result.nextCursor).toBeNull();
    expect(result.responses.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(prisma.formResponse.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RESPONSES_PAGE_MAX + 1,
      where: { formId: "f1" },
    });
  });

  it("returns the id of the last row as the cursor when more rows exist", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findMany.mockResolvedValue([
      row({ id: "a" }),
      row({ id: "b" }),
      row({ id: "c" }),
    ]);
    const result = await service.list("f1", "prev", 2);
    expect(result.responses.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(result.nextCursor).toBe("b");
    expect(prisma.formResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "prev" }, skip: 1, take: 3 }),
    );
  });

  it("clamps the page size between one and the maximum", async () => {
    const { prisma, service } = make();
    await service.list("f1", undefined, 0);
    expect(prisma.formResponse.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 2 }),
    );
    await service.list("f1", undefined, 10 ** 9);
    expect(prisma.formResponse.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: RESPONSES_PAGE_MAX + 1 }),
    );
  });

  it("fails before reading when the form does not exist", async () => {
    const { forms, prisma, service } = make();
    forms.require.mockRejectedValue(new FormsError("That form does not exist.", 404));
    await expect(service.list("nope")).rejects.toMatchObject({ status: 404 });
    expect(prisma.formResponse.findMany).not.toHaveBeenCalled();
  });
});

describe("FormsResponsesService.patch", () => {
  it("answers 404 for a response of another form", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findFirst.mockResolvedValue(null);
    await expect(service.patch("f1", "r9", { starred: true })).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.formResponse.findFirst).toHaveBeenCalledWith({
      where: { formId: "f1", id: "r9" },
    });
  });

  it("sets the flags, normalizes tags and trims the note", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findFirst.mockResolvedValue(row());
    await service.patch("f1", "r1", {
      flagged: true,
      note: "  keep  ",
      reviewed: true,
      spam: true,
      starred: true,
      tags: [" a ", "a", "", "b"],
    });
    expect(prisma.formResponse.update).toHaveBeenCalledWith({
      data: {
        flagged: true,
        note: "keep",
        reviewed: true,
        spam: true,
        starred: true,
        tags: ["a", "b"],
      },
      where: { id: "r1" },
    });
  });

  it("clears a blank or null note", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findFirst.mockResolvedValue(row());
    await service.patch("f1", "r1", { note: "   " });
    await service.patch("f1", "r1", { note: null });
    expect(
      prisma.formResponse.update.mock.calls.map(
        ([arg]) => (arg as { data: { note: null } }).data.note,
      ),
    ).toEqual([null, null]);
  });

  it("merges edited answers and stamps the edit time", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findFirst.mockResolvedValue(row({ answers: { name: "Ana", n: 1 } }));
    await service.patch("f1", "r1", { answers: { n: 5 } });
    const data = (prisma.formResponse.update.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.answers).toEqual({ n: 5, name: "Ana" });
    expect(data.editedAt).toBeInstanceOf(Date);
  });

  it("answers 400 with the field errors when an edit is not valid", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findFirst.mockResolvedValue(row());
    const error = await service
      .patch("f1", "r1", { answers: { n: 99 } })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FormsError);
    expect((error as FormsError).status).toBe(400);
    expect((error as FormsError).errors).toMatchObject({ n: { code: "max" } });
    expect(prisma.formResponse.update).not.toHaveBeenCalled();
  });

  it("changes nothing but the touched columns for an empty patch", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findFirst.mockResolvedValue(row());
    await service.patch("f1", "r1", {});
    expect(prisma.formResponse.update).toHaveBeenCalledWith({ data: {}, where: { id: "r1" } });
  });
});

describe("FormsResponsesService.bulk", () => {
  it("applies a flag action to the distinct ids of this form only", async () => {
    const { prisma, service } = make();
    const result = await service.bulk("f1", { action: "star", ids: ["a", "a", "b"] });
    expect(result).toEqual({ count: 4, ok: true });
    expect(prisma.formResponse.updateMany).toHaveBeenCalledWith({
      data: { starred: true },
      where: { formId: "f1", id: { in: ["a", "b"] } },
    });
  });

  it("maps every flag action to its column", async () => {
    const { prisma, service } = make();
    const expected: Record<string, object> = {
      flag: { flagged: true },
      review: { reviewed: true },
      spam: { spam: true },
      unflag: { flagged: false },
      unreview: { reviewed: false },
      unspam: { spam: false },
      unstar: { starred: false },
    };
    for (const [action, data] of Object.entries(expected)) {
      await service.bulk("f1", { action: action as never, ids: ["a"] });
      expect(prisma.formResponse.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data }),
      );
    }
  });

  it("rejects an unknown action", async () => {
    const { service } = make();
    await expect(
      service.bulk("f1", { action: "explode" as never, ids: ["a"] }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("deletes the responses and then their uploads and objects", async () => {
    const { forms, prisma, service } = make();
    prisma.formUpload.findMany.mockResolvedValue([{ key: "k1" }, { key: "k2" }]);
    const result = await service.bulk("f1", { action: "delete", ids: ["a", "b"] });
    expect(result).toEqual({ count: 3, ok: true });
    expect(prisma.formUpload.findMany).toHaveBeenCalledWith({
      select: { key: true },
      where: { formId: "f1", responseId: { in: ["a", "b"] } },
    });
    expect(prisma.formUpload.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["k1", "k2"] } },
    });
    expect(forms.deleteObjects).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("skips the upload cleanup when the responses had no files", async () => {
    const { forms, prisma, service } = make();
    await service.bulk("f1", { action: "delete", ids: ["a"] });
    expect(prisma.formUpload.deleteMany).not.toHaveBeenCalled();
    expect(forms.deleteObjects).not.toHaveBeenCalled();
  });

  it("adds a trimmed tag with one raw statement", async () => {
    const { prisma, service } = make();
    const result = await service.bulk("f1", { action: "tag", ids: ["a"], tag: "  vip  " });
    expect(result).toEqual({ count: 2, ok: true });
    const call = prisma.$executeRaw.mock.calls[0] as unknown as [string[], ...unknown[]];
    expect(call[0].join("?")).toContain("array_append");
    expect(call).toContain("vip");
  });

  it("removes a tag with a different statement", async () => {
    const { prisma, service } = make();
    await service.bulk("f1", { action: "untag", ids: ["a"], tag: "vip" });
    const call = prisma.$executeRaw.mock.calls[0] as unknown as [string[]];
    expect(call[0].join("?")).toContain("array_remove");
  });

  it("clips a long tag to 40 characters and refuses a blank one", async () => {
    const { prisma, service } = make();
    await service.bulk("f1", { action: "tag", ids: ["a"], tag: "x".repeat(100) });
    expect((prisma.$executeRaw.mock.calls[0] as unknown[]).includes("x".repeat(40))).toBe(true);
    await expect(
      service.bulk("f1", { action: "tag", ids: ["a"], tag: "   " }),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.bulk("f1", { action: "untag", ids: ["a"] })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("FormsResponsesService.apply", () => {
  it("answers 404 naming the first response that is not in the form", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findMany.mockResolvedValue([{ answers: {}, id: "a" }]);
    await expect(
      service.apply("f1", {
        updates: [
          { answers: {}, id: "a" },
          { answers: {}, id: "zz" },
        ],
      } as never),
    ).rejects.toThrow("Response zz does not exist in this form.");
  });

  it("answers 400 naming the response and the field when an answer is not valid", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findMany.mockResolvedValue([{ answers: {}, id: "a" }]);
    const error = await service
      .apply("f1", { updates: [{ answers: { n: 99 }, id: "a" }] } as never)
      .catch((caught: unknown) => caught);
    expect((error as FormsError).message).toBe("Response a: n is not valid.");
    expect((error as FormsError).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("replaces the answers of every response in one transaction with one edit time", async () => {
    const { prisma, service } = make();
    prisma.formResponse.findMany.mockResolvedValue([
      { answers: { name: "Ana", n: 1 }, id: "a" },
      { answers: { name: "Bo" }, id: "b" },
    ]);
    const result = await service.apply("f1", {
      updates: [
        { answers: { name: "Ann" }, id: "a" },
        { answers: { n: 3, mystery: "x" }, id: "b" },
      ],
    } as never);
    expect(result).toEqual({ count: 2, ok: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const updates = prisma.formResponse.update.mock.calls.map(
      ([arg]) => arg as { data: { answers: unknown; editedAt: Date }; where: { id: string } },
    );
    expect(updates.map((update) => update.data.answers)).toEqual([{ name: "Ann" }, { n: 3 }]);
    expect(updates[0].data.editedAt).toBe(updates[1].data.editedAt);
  });
});

describe("FormsResponsesService files", () => {
  it("answers 404 for a key that belongs to another form without querying", async () => {
    const { prisma, service } = make();
    await expect(service.fileLink("f1", OTHER_FORM_KEY)).rejects.toMatchObject({ status: 404 });
    await expect(service.fileLink("f1", "not-a-key")).rejects.toMatchObject({ status: 404 });
    expect(prisma.formUpload.findFirst).not.toHaveBeenCalled();
  });

  it("answers 404 for an upload that has no row", async () => {
    const { prisma, service } = make();
    prisma.formUpload.findFirst.mockResolvedValue(null);
    await expect(service.fileLink("f1", UPLOAD_KEY)).rejects.toMatchObject({ status: 404 });
    expect(prisma.formUpload.findFirst).toHaveBeenCalledWith({
      where: { formId: "f1", key: UPLOAD_KEY },
    });
  });

  it("returns a fifteen minute link with the file details", async () => {
    const { prisma, service, storage } = make();
    prisma.formUpload.findFirst.mockResolvedValue({
      key: UPLOAD_KEY,
      name: "a.pdf",
      size: 3,
      type: "application/pdf",
    });
    expect(await service.fileLink("f1", UPLOAD_KEY)).toEqual({
      name: "a.pdf",
      size: 3,
      type: "application/pdf",
      url: "https://signed.example/f",
    });
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(UPLOAD_KEY, 900);
  });

  it("answers 503 when storage cannot sign", async () => {
    const { prisma, service, storage } = make();
    prisma.formUpload.findFirst.mockResolvedValue({
      key: UPLOAD_KEY,
      name: "a",
      size: 1,
      type: "x",
    });
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));
    await expect(service.fileLink("f1", UPLOAD_KEY)).rejects.toMatchObject({ status: 503 });
  });

  it("returns the bytes with a minute to read them", async () => {
    const { prisma, service, storage } = make();
    prisma.formUpload.findFirst.mockResolvedValue({
      key: UPLOAD_KEY,
      name: "a.pdf",
      size: 5,
      type: "application/pdf",
    });
    const result = await service.fileBytes("f1", UPLOAD_KEY, 1000);
    expect(result.body.toString()).toBe("bytes");
    expect(result.name).toBe("a.pdf");
    expect(storage.readFile).toHaveBeenCalledWith(UPLOAD_KEY, 1000, 60_000);
  });

  it("answers 502 when the file cannot be read", async () => {
    const { prisma, service, storage } = make();
    prisma.formUpload.findFirst.mockResolvedValue({
      key: UPLOAD_KEY,
      name: "a",
      size: 1,
      type: "x",
    });
    storage.readFile.mockRejectedValue(new Error("too large"));
    await expect(service.fileBytes("f1", UPLOAD_KEY, 1)).rejects.toMatchObject({ status: 502 });
  });
});
