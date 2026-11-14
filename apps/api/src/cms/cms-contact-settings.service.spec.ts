import { DEFAULT_CONTACT_SETTINGS, type ContactSettings } from "@repo/shared";
import { describe, expect, it, vi } from "vitest";

import { CmsContactSettingsService } from "./cms-contact-settings.service.js";

const STORED: ContactSettings = {
  ...DEFAULT_CONTACT_SETTINGS,
  mailStrategy: "loadBalanceWeighted",
  mailProviderOrder: ["ses", "smtp", "resend"],
  mailProviderWeights: { ses: 3, smtp: 1 },
};

function makeService(row: { data: unknown } | null) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    cmsContactSettings: {
      findUnique: vi.fn().mockResolvedValue(row),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = { $transaction: vi.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const cache = { remove: vi.fn().mockResolvedValue(undefined) };
  const service = new CmsContactSettingsService(prisma as never, cache as never);
  return { service, tx, cache };
}

describe("saveDetails", () => {
  it("keeps the stored routing and changes only the given details", async () => {
    const { service, tx } = makeService({ data: STORED });
    const saved = await service.saveDetails({ address: "New street", lat: 3 });

    expect(saved.address).toBe("New street");
    expect(saved.lat).toBe(3);
    expect(saved.lng).toBe(STORED.lng);
    expect(saved.mailStrategy).toBe("loadBalanceWeighted");
    expect(saved.mailProviderOrder).toEqual(["ses", "smtp", "resend"]);
    expect(saved.mailProviderWeights).toEqual({ ses: 3, smtp: 1 });
    expect(tx.cmsContactSettings.upsert).toHaveBeenCalledOnce();
  });

  it("takes the lock before it reads the row and clears the cache after the write", async () => {
    const { service, tx, cache } = makeService({ data: STORED });
    await service.saveDetails({ address: "Another street" });

    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    const readOrder = tx.cmsContactSettings.findUnique.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(readOrder);
    expect(String(tx.$queryRaw.mock.calls[0][0])).toContain("pg_advisory_xact_lock");
    expect(cache.remove).toHaveBeenCalledWith("cms:contact-settings:v1");
  });

  it("starts from the defaults when nothing is stored yet", async () => {
    const { service } = makeService(null);
    const saved = await service.saveDetails({ emails: ["inbox@example.test"] });

    expect(saved.emails).toEqual(["inbox@example.test"]);
    expect(saved.mailStrategy).toBe(DEFAULT_CONTACT_SETTINGS.mailStrategy);
  });

  it("ignores a field that is undefined", async () => {
    const { service } = makeService({ data: STORED });
    const saved = await service.saveDetails({ address: undefined, lat: 5 });

    expect(saved.address).toBe(STORED.address);
    expect(saved.lat).toBe(5);
  });
});

describe("save", () => {
  it("takes the same lock as a partial save before it writes the whole record", async () => {
    const { service, tx, cache } = makeService({ data: STORED });
    const record = { ...STORED, mailStrategy: "failover" as const };
    await expect(service.save(record)).resolves.toBe(record);

    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    const writeOrder = tx.cmsContactSettings.upsert.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(writeOrder);
    expect(String(tx.$queryRaw.mock.calls[0][0])).toContain("pg_advisory_xact_lock");
    expect(tx.cmsContactSettings.upsert).toHaveBeenCalledWith({
      where: { slug: "contact" },
      create: { slug: "contact", data: record },
      update: { data: record },
    });
    expect(cache.remove).toHaveBeenCalledWith("cms:contact-settings:v1");
  });

  it("uses one lock key for both writers", async () => {
    const first = makeService({ data: STORED });
    const second = makeService({ data: STORED });
    await first.service.save(STORED);
    await second.service.saveDetails({ address: "Other street" });

    expect(first.tx.$queryRaw.mock.calls[0][1]).toBe(second.tx.$queryRaw.mock.calls[0][1]);
  });
});
