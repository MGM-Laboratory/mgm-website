import { describe, expect, it, vi } from "vitest";

import { FormsService } from "./forms.service.js";

const KEY = "form-abc123-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

function makeService(owner: { id: string } | null, referenced: boolean) {
  const prisma = {
    form: { findUnique: vi.fn().mockResolvedValue(owner) },
    $queryRaw: vi.fn().mockResolvedValue(referenced ? [{ found: 1 }] : []),
  };
  return { service: new FormsService(prisma as never, {} as never), prisma };
}

describe("mediaServable", () => {
  it("serves a key of an existing form without scanning the forms", async () => {
    const { service, prisma } = makeService({ id: "abc123" }, false);
    expect(await service.mediaServable(KEY)).toBe(true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("scans the forms when the owner is gone and serves a key that another form uses", async () => {
    const { service } = makeService(null, true);
    expect(await service.mediaServable(KEY)).toBe(true);
  });

  it("limits the scans of keys whose form does not exist", async () => {
    const { service, prisma } = makeService(null, false);
    const answers = await Promise.all(Array.from({ length: 30 }, () => service.mediaServable(KEY)));
    expect(answers.every((answer) => answer === false)).toBe(true);
    expect(prisma.$queryRaw.mock.calls.length).toBeLessThanOrEqual(5);
    expect(prisma.$queryRaw.mock.calls.length).toBeGreaterThan(0);
  });

  it("serves the images of a copy after its original is deleted, even when the budget is spent", async () => {
    const { service, prisma } = makeService(null, true);
    const keys = Array.from(
      { length: 6 },
      (_, index) => `form-abc123-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a6${index}.png`,
    );
    // The first request for each image scans. The budget lets only a few through at a time.
    for (const key of keys) await service.mediaServable(key);
    const scans = prisma.$queryRaw.mock.calls.length;
    expect(scans).toBeLessThanOrEqual(5);
    // Every key that was found is served again from memory without a scan.
    for (const key of keys.slice(0, scans)) expect(await service.mediaServable(key)).toBe(true);
    expect(prisma.$queryRaw.mock.calls.length).toBe(scans);
  });
});
