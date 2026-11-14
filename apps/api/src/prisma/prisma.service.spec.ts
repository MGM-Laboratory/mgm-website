import { describe, expect, it, vi } from "vitest";

import { PrismaService, ddlTarget } from "./prisma.service.js";

function makeService(existing: string[] = [], transactionError?: Error) {
  const calls: string[] = [];
  const sent: string[] = [];
  const tx = {
    $executeRawUnsafe: vi.fn((statement: string) => {
      const text = statement.trim().replace(/\s+/g, " ");
      calls.push(text);
      if (/^(CREATE|ALTER)/.test(text)) sent.push(text);
      return Promise.resolve(0);
    }),
    $executeRaw: vi.fn((strings: TemplateStringsArray) => {
      calls.push(strings.join("?").includes("advisory") ? "LOCK" : "OTHER");
      return Promise.resolve(1);
    }),
    $queryRaw: vi.fn(() => {
      calls.push("CATALOG");
      return Promise.resolve(existing.map((name) => ({ name })));
    }),
  };
  const service = Object.create(PrismaService.prototype) as PrismaService;
  const transaction = vi.fn(
    async (run: (client: typeof tx) => Promise<void>, options: Record<string, number>) => {
      void options;
      if (transactionError) throw transactionError;
      await run(tx);
    },
  );
  Object.assign(service, {
    $connect: vi.fn().mockResolvedValue(undefined),
    $transaction: transaction,
  });
  return { service, tx, calls, sent, transaction };
}

describe("boot DDL", () => {
  it("sets the timeouts, takes the advisory lock and reads the catalog before any statement", async () => {
    const { service, calls, sent, transaction } = makeService();
    await service.onModuleInit();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(calls[0]).toContain("SET LOCAL lock_timeout");
    expect(calls[1]).toContain("SET LOCAL statement_timeout");
    expect(calls[2]).toBe("LOCK");
    expect(calls[3]).toBe("CATALOG");
    expect(sent.length).toBeGreaterThan(20);
    expect(calls.indexOf(sent[0] as string)).toBeGreaterThan(3);
  });

  it("gives the transaction a wait limit and a run limit that cover the DDL", async () => {
    const { service, transaction } = makeService();
    await service.onModuleInit();
    const options = transaction.mock.calls[0]?.[1] as { maxWait: number; timeout: number };
    expect(options.maxWait).toBeGreaterThan(0);
    expect(options.timeout).toBeGreaterThan(options.maxWait);
  });

  it("sends the statement of an object that is missing", async () => {
    const { service, sent } = makeService();
    await service.onModuleInit();
    expect(sent.some((text) => text.startsWith('CREATE TABLE IF NOT EXISTS "FormMedia"'))).toBe(
      true,
    );
    expect(sent.some((text) => text.includes('"FormMedia_key_idx"'))).toBe(true);
    expect(sent.some((text) => text.includes('ADD COLUMN IF NOT EXISTS "verifyToken"'))).toBe(true);
  });

  it("sends no statement for a table, an index or a column that exists", async () => {
    const { service, sent } = makeService([
      "table:FormMedia",
      "index:FormMedia_key_idx",
      "column:ShortLinkDomain.verifyToken",
      "table:CmsMember",
    ]);
    await service.onModuleInit();
    expect(sent.some((text) => text.includes('"FormMedia"'))).toBe(false);
    expect(sent.some((text) => text.includes('"FormMedia_key_idx"'))).toBe(false);
    expect(sent.some((text) => text.includes('"verifyToken"'))).toBe(false);
    expect(sent.some((text) => text.includes('"CmsMember"'))).toBe(false);
    expect(sent.some((text) => text.includes('"CmsArticle"'))).toBe(true);
  });

  it("fails the start when the transaction fails", async () => {
    const { service } = makeService([], new Error("lock timeout"));
    await expect(service.onModuleInit()).rejects.toThrow("lock timeout");
  });
});

describe("ddlTarget", () => {
  it("names the object of each kind of statement", () => {
    expect(ddlTarget('CREATE TABLE IF NOT EXISTS "A" (x INT)')).toBe("table:A");
    expect(ddlTarget('CREATE UNIQUE INDEX IF NOT EXISTS "A_x_key" ON "A" ("x")')).toBe(
      "index:A_x_key",
    );
    expect(ddlTarget('ALTER TABLE "A" ADD COLUMN IF NOT EXISTS "c" TEXT')).toBe("column:A.c");
  });

  it("returns null for a statement it does not know, so that it is sent", () => {
    expect(ddlTarget("SELECT 1")).toBeNull();
  });
});
