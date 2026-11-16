// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsMembersService } from "./cms-members.service.js";

const LOADED = new Date("2026-11-14T05:00:00.000Z");

type Row = { slug: string; data: Record<string, unknown>; updatedAt: Date };

function row(slug: string, name: string): Row {
  return { slug, data: { member: { name, slug }, profile: {} }, updatedAt: LOADED };
}

function makeService(rows: Row[] = [], cached?: unknown) {
  const model = {
    findUnique: vi.fn(
      async ({ where }: { where: { slug: string } }) =>
        rows.find((entry) => entry.slug === where.slug) ?? null,
    ),
    findMany: vi.fn(async (args?: { select?: unknown }) =>
      args?.select ? rows.map(({ slug, data }) => ({ slug, data })) : rows,
    ),
    create: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: LOADED,
    })),
    update: vi.fn(async ({ data }: { data: { slug: string; data: unknown } }) => ({
      ...data,
      updatedAt: new Date(LOADED.getTime() + 1),
    })),
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    cmsMember: model,
    $transaction: vi.fn(async (work: (client: { cmsMember: typeof model }) => unknown) =>
      work({ cmsMember: model }),
    ),
  };
  const cache = {
    getJson: vi.fn().mockResolvedValue(cached ?? null),
    setJson: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new CmsMembersService(prisma as never, cache as never), model, cache };
}

describe("CmsMembersService all", () => {
  it("lists the members newest first and caches the list", async () => {
    const { service, model, cache } = makeService([row("ani", "Ani")]);

    const records = await service.all();

    expect(model.findMany).toHaveBeenCalledWith({ orderBy: { updatedAt: "desc" } });
    expect(records).toEqual([
      {
        member: { name: "Ani", slug: "ani" },
        profile: {},
        slug: "ani",
        updatedAt: LOADED.toISOString(),
      },
    ]);
    expect(cache.setJson).toHaveBeenCalledWith("cms:members:v1", records, 600);
  });

  it("serves the cached list without a query", async () => {
    const cached = [{ slug: "c" }];
    const { service, model } = makeService([], cached);

    await expect(service.all()).resolves.toBe(cached);
    expect(model.findMany).not.toHaveBeenCalled();
  });
});

describe("CmsMembersService save of an existing member", () => {
  it("updates in place with the version it read and clears the cache", async () => {
    const { service, model, cache } = makeService([row("ani", "Ani")]);

    const saved = await service.save("ani", "ani", { member: { name: "Ani W" } });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "ani", updatedAt: LOADED },
      data: { data: { member: { name: "Ani W" } }, slug: "ani" },
    });
    expect(saved.slug).toBe("ani");
    expect(cache.remove).toHaveBeenCalledWith("cms:members:v1");
  });

  it("renames a member when the new slug is free and refuses one that is taken", async () => {
    const { service, model } = makeService([row("ani", "Ani"), row("budi", "Budi")]);

    await expect(service.save("ani", "budi", {})).rejects.toThrow("CMS_MEMBER_SLUG_CONFLICT");
    expect(model.update).not.toHaveBeenCalled();

    await expect(service.save("ani", "ani-w", {})).resolves.toMatchObject({ slug: "ani-w" });
  });

  it("answers 409 for a stale version and for a lost race", async () => {
    const stale = makeService([row("ani", "Ani")]);
    await expect(
      stale.service.save("ani", "ani", {}, new Date(LOADED.getTime() - 1)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stale.model.update).not.toHaveBeenCalled();

    const race = makeService([row("ani", "Ani")]);
    race.model.update.mockRejectedValueOnce({ code: "P2025" });
    await expect(race.service.save("ani", "ani", {}, LOADED)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("CmsMembersService save of a member that is not at the opened slug", () => {
  it("answers 409 and creates nothing when the editor loaded a version of a lost member", async () => {
    const { service, model } = makeService();

    await expect(service.save("ani", "ani", {}, LOADED)).rejects.toBeInstanceOf(ConflictException);
    expect(model.create).not.toHaveBeenCalled();
  });

  it("creates a new member under its first slug", async () => {
    const { service, model } = makeService();

    await service.save("new", "new", { member: { name: "New" } });

    expect(model.create).toHaveBeenCalledWith({
      data: { slug: "new", data: { member: { name: "New" } } },
    });
  });

  it("answers 404 when the opened slug and the new slug differ and nothing exists", async () => {
    const { service } = makeService();

    await expect(service.save("old", "new", { member: { name: "Nobody" } })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("renames the record that sourceSlug names", async () => {
    const { service, model } = makeService([row("ani", "Ani")]);

    const saved = await service.save("typed-slug", "ani-w", {
      member: { name: "Ani W" },
      sourceSlug: "ani",
    });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "ani" },
      data: { data: { member: { name: "Ani W" }, sourceSlug: "ani" }, slug: "ani-w" },
    });
    expect(saved.slug).toBe("ani-w");
  });

  it("ignores a sourceSlug that equals the new slug or names nothing", async () => {
    const same = makeService();
    await same.service.save("ani", "ani", { member: { name: "Ani" }, sourceSlug: "ani" });
    expect(same.model.create).toHaveBeenCalledTimes(1);

    const missing = makeService();
    await expect(
      missing.service.save("old", "new", { member: { name: "Nobody" }, sourceSlug: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("renames the one record with the same name when an old editor sends the new slug", async () => {
    const { service, model } = makeService([row("ani", "  ANI  ")]);

    await service.save("ani-w", "ani-w", { member: { name: "ani" } });

    expect(model.update).toHaveBeenCalledWith({
      where: { slug: "ani" },
      data: { data: { member: { name: "ani" }, sourceSlug: "ani" }, slug: "ani-w" },
    });
    expect(model.create).not.toHaveBeenCalled();
  });

  it("keeps the sourceSlug that the document already carries", async () => {
    const { service, model } = makeService([row("ani", "Ani")]);

    await service.save("ani-w", "ani-w", { member: { name: "Ani" }, sourceSlug: 42 });

    const call = model.update.mock.calls[0]?.[0] as { data: { data: { sourceSlug: unknown } } };
    expect(call.data.data.sourceSlug).toBe("ani");
  });

  it("refuses to guess when two members share the name", async () => {
    const { service, model } = makeService([row("a", "Ani"), row("b", "ani")]);

    await expect(service.save("c", "c", { member: { name: "Ani" } })).rejects.toThrow(
      "CMS_MEMBER_AMBIGUOUS_RENAME",
    );
    expect(model.update).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });

  it("creates the member when no other member has the name or the name is empty", async () => {
    const other = makeService([row("a", "Budi")]);
    await other.service.save("c", "c", { member: { name: "Ani" } });
    expect(other.model.create).toHaveBeenCalledTimes(1);

    const blank = makeService([row("a", "Budi")]);
    await blank.service.save("c", "c", { member: { name: "  " } });
    await blank.service.save("d", "d", {});
    await blank.service.save("e", "e", { member: { name: 7 } });
    expect(blank.model.create).toHaveBeenCalledTimes(3);
    expect(blank.model.findMany).not.toHaveBeenCalled();
  });

  it("does not match the record that already holds the new slug", async () => {
    const { service, model } = makeService([row("ani", "Ani")]);

    await service.save("ani", "ani", { member: { name: "Ani" } }, undefined);

    expect(model.create).not.toHaveBeenCalled();
    expect(model.update).toHaveBeenCalledTimes(1);
  });
});

describe("CmsMembersService remove", () => {
  it("removes a member and clears the cache", async () => {
    const { service, model, cache } = makeService();

    await service.remove("ani");

    expect(model.delete).toHaveBeenCalledWith({ where: { slug: "ani" } });
    expect(cache.remove).toHaveBeenCalledWith("cms:members:v1");
  });

  it("answers 404 when the member is gone", async () => {
    const { service, model, cache } = makeService();
    model.delete.mockRejectedValue(new Error("not found"));

    await expect(service.remove("ani")).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });
});
