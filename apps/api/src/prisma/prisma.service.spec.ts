import { describe, expect, it, vi } from "vitest";

import { PrismaService } from "./prisma.service.js";

function makeService(transactionError?: Error) {
  const calls: string[] = [];
  const tx = {
    $executeRawUnsafe: vi.fn((statement: string) => {
      calls.push(statement.trim().split(/\s+/).slice(0, 6).join(" "));
      return Promise.resolve(0);
    }),
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      calls.push(strings.join("?").trim());
      return Promise.resolve([]);
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
  return { service, tx, calls, transaction };
}

describe("boot DDL", () => {
  it("runs every statement in one transaction after the lock timeouts and the advisory lock", async () => {
    const { service, tx, calls, transaction } = makeService();
    await service.onModuleInit();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(calls[0]).toContain("SET LOCAL lock_timeout");
    expect(calls[1]).toContain("SET LOCAL statement_timeout");
    expect(calls[2]).toContain("pg_advisory_xact_lock");
    // Everything after the lock is a CREATE or ALTER statement.
    const statements = calls.slice(3);
    expect(statements.length).toBeGreaterThan(20);
    expect(statements.every((call) => /^(CREATE|ALTER)/.test(call))).toBe(true);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(statements.length + 2);
  });

  it("gives the transaction a wait limit and a run limit that cover the DDL", async () => {
    const { service, transaction } = makeService();
    await service.onModuleInit();
    const options = transaction.mock.calls[0]?.[1] as { maxWait: number; timeout: number };
    expect(options.maxWait).toBeGreaterThan(0);
    expect(options.timeout).toBeGreaterThan(options.maxWait);
  });

  it("creates the form media table and its index", async () => {
    const { service, calls } = makeService();
    await service.onModuleInit();
    expect(calls.some((call) => call.includes('"FormMedia"'))).toBe(true);
  });

  it("fails the start when the transaction fails", async () => {
    const { service } = makeService(new Error("lock timeout"));
    await expect(service.onModuleInit()).rejects.toThrow("lock timeout");
  });
});
