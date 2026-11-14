import { describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import {
  ANALYTICS_STATEMENT_TIMEOUT_MS,
  ANALYTICS_TRANSACTION_TIMEOUT_MS,
  FormsAnalyticsService,
} from "./forms-analytics.service.js";

function makeService() {
  const order: string[] = [];
  const tx = {
    $executeRawUnsafe: vi.fn((statement: string) => {
      order.push(statement);
      return Promise.resolve(0);
    }),
    $queryRaw: vi.fn(() => {
      order.push("query");
      return Promise.resolve([]);
    }),
    formEvent: {
      groupBy: vi.fn(() => {
        order.push("groupBy");
        return Promise.resolve([]);
      }),
    },
  };
  const transaction = vi.fn(
    async (run: (client: typeof tx) => Promise<unknown>, options: Record<string, number>) => {
      void options;
      return run(tx);
    },
  );
  const prisma = { $transaction: transaction };
  const forms = {
    require: vi.fn().mockResolvedValue({
      id: "form1",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      data: formDocumentSchema.parse({
        title: "Survey",
        fields: [{ id: "name", type: "short_text" }],
      }),
    }),
  };
  const service = new FormsAnalyticsService(prisma as never, forms as never);
  return { service, tx, transaction, order };
}

describe("analytics load", () => {
  it("runs every query on one connection after a statement timeout", async () => {
    const { service, tx, transaction, order } = makeService();
    const result = await service.analytics("form1", "30d", 0, Date.parse("2026-09-26T02:30:00Z"));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe(`SET LOCAL statement_timeout = '${ANALYTICS_STATEMENT_TIMEOUT_MS}ms'`);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(9);
    expect(tx.formEvent.groupBy).toHaveBeenCalledTimes(7);
    expect(result.totals.views).toBe(0);
    expect(result.range).toBe("30d");
  });

  it("gives the transaction a limit longer than one statement", async () => {
    const { service, transaction } = makeService();
    await service.analytics("form1", "7d", 0);
    const options = transaction.mock.calls[0]?.[1] as { maxWait: number; timeout: number };
    expect(options.timeout).toBe(ANALYTICS_TRANSACTION_TIMEOUT_MS);
    expect(options.timeout).toBeGreaterThan(ANALYTICS_STATEMENT_TIMEOUT_MS);
    expect(options.maxWait).toBeGreaterThan(0);
  });
});
