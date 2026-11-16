// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ADMIN_PAGE_IDS } from "@repo/shared";
import { describe, expect, it, vi } from "vitest";

import { CmsAdminsController } from "./cms-admins.controller.js";

const PASS = "the-superadmin-passphrase";

function makeController() {
  const admins = {
    verify: vi.fn().mockResolvedValue({ slug: "admin-1", name: "Ani" }),
    all: vi.fn().mockResolvedValue([{ slug: "admin-1" }]),
    bySlug: vi.fn().mockResolvedValue({ slug: "admin-1" }),
    create: vi.fn().mockResolvedValue({ record: { slug: "admin-1" } }),
    update: vi.fn().mockResolvedValue({ record: { slug: "admin-1" } }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(PASS) };
  const controller = new CmsAdminsController(admins as never, config as never);
  return { controller, admins };
}

describe("CmsAdminsController verify", () => {
  it("returns the account for a passphrase that matches", async () => {
    const { controller, admins } = makeController();

    await expect(controller.verify({ passphrase: "a-passphrase" })).resolves.toEqual({
      account: { slug: "admin-1", name: "Ani" },
    });
    expect(admins.verify).toHaveBeenCalledWith("a-passphrase");
  });

  it("answers 401 when no account matches", async () => {
    const { controller, admins } = makeController();
    admins.verify.mockResolvedValue(null);

    await expect(controller.verify({ passphrase: "nope" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ["a missing body", undefined],
    ["a body without a passphrase", {}],
    ["an empty passphrase", { passphrase: "" }],
    ["a passphrase that is not a string", { passphrase: 123 }],
    ["a passphrase over 300 characters", { passphrase: "x".repeat(301) }],
  ])("answers 400 for %s and does not hash anything", async (_name, body) => {
    const { controller, admins } = makeController();

    await expect(controller.verify(body)).rejects.toBeInstanceOf(BadRequestException);
    expect(admins.verify).not.toHaveBeenCalled();
  });
});

describe("CmsAdminsController passphrase check", () => {
  it.each([
    ["all", (c: CmsAdminsController, p?: string) => c.all(p)],
    ["one", (c: CmsAdminsController, p?: string) => c.one("admin-1", p)],
    ["create", (c: CmsAdminsController, p?: string) => c.create({ name: "Ani" }, p)],
    ["update", (c: CmsAdminsController, p?: string) => c.update("admin-1", { name: "Ani" }, p)],
    ["remove", (c: CmsAdminsController, p?: string) => c.remove("admin-1", p)],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, admins } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(admins.all).not.toHaveBeenCalled();
    expect(admins.bySlug).not.toHaveBeenCalled();
    expect(admins.create).not.toHaveBeenCalled();
    expect(admins.update).not.toHaveBeenCalled();
    expect(admins.remove).not.toHaveBeenCalled();
  });
});

describe("CmsAdminsController reads", () => {
  it("lists the accounts and returns one", async () => {
    const { controller } = makeController();

    await expect(controller.all(PASS)).resolves.toEqual({ records: [{ slug: "admin-1" }] });
    await expect(controller.one("admin-1", PASS)).resolves.toEqual({ record: { slug: "admin-1" } });
  });

  it("passes the 404 of an unknown account through", async () => {
    const { controller, admins } = makeController();
    admins.bySlug.mockRejectedValue(new NotFoundException());

    await expect(controller.one("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsAdminsController create", () => {
  it("creates an account with every page filled in", async () => {
    const { controller, admins } = makeController();

    await controller.create(
      {
        name: "  Ani  ",
        passphrase: "generate",
        expiresAt: "2030-01-01T00:00:00.000Z",
        permissions: { articles: ["delete"], members: ["write"] },
      },
      PASS,
    );

    const input = admins.create.mock.calls[0]?.[0] as {
      name: string;
      passphrase: string;
      permissions: Record<string, string[]>;
    };
    expect(input.name).toBe("Ani");
    expect(input.passphrase).toBe("generate");
    expect(Object.keys(input.permissions).sort()).toEqual([...ADMIN_PAGE_IDS].sort());
    expect(input.permissions.articles).toEqual(["read", "write", "delete"]);
    expect(input.permissions.members).toEqual(["read", "write"]);
    expect(input.permissions.events).toEqual([]);
  });

  it("limits contact inquiries to read", async () => {
    const { controller, admins } = makeController();

    await controller.create(
      { name: "Ani", permissions: { "contact-inquiries": ["delete"] } },
      PASS,
    );
    await controller.create({ name: "Budi", permissions: { "contact-inquiries": [] } }, PASS);

    const first = admins.create.mock.calls[0]?.[0] as { permissions: Record<string, string[]> };
    const second = admins.create.mock.calls[1]?.[0] as { permissions: Record<string, string[]> };
    expect(first.permissions["contact-inquiries"]).toEqual(["read"]);
    expect(second.permissions["contact-inquiries"]).toEqual([]);
  });

  it("accepts a name alone and a null expiry", async () => {
    const { controller, admins } = makeController();

    await controller.create({ name: "Ani", expiresAt: null }, PASS);

    expect(admins.create).toHaveBeenCalledWith({ name: "Ani", expiresAt: null });
  });

  it.each([
    ["no name", {}],
    ["an empty name", { name: "  " }],
    ["a passphrase under 8 characters", { name: "Ani", passphrase: "short" }],
    ["an expiry that is not a date time", { name: "Ani", expiresAt: "tomorrow" }],
    ["an unknown page", { name: "Ani", permissions: { secrets: ["read"] } }],
    ["an unknown action", { name: "Ani", permissions: { articles: ["admin"] } }],
  ])("rejects %s and creates nothing", async (_name, body) => {
    const { controller, admins } = makeController();

    await expect(controller.create(body, PASS)).rejects.toThrow();
    expect(admins.create).not.toHaveBeenCalled();
  });
});

describe("CmsAdminsController update", () => {
  it("passes a partial update through", async () => {
    const { controller, admins } = makeController();

    await controller.update("admin-1", { active: false }, PASS);

    expect(admins.update).toHaveBeenCalledWith("admin-1", { active: false });
  });

  it("fills the pages of a permission update so omitted pages read as no access", async () => {
    const { controller, admins } = makeController();

    await controller.update("admin-1", { permissions: { articles: ["write"] } }, PASS);

    const input = admins.update.mock.calls[0]?.[1] as { permissions: Record<string, string[]> };
    expect(input.permissions.articles).toEqual(["read", "write"]);
    expect(input.permissions.members).toEqual([]);
  });

  it("rejects a bad update and changes nothing", async () => {
    const { controller, admins } = makeController();

    await expect(controller.update("admin-1", { active: "yes" }, PASS)).rejects.toThrow();
    await expect(controller.update("admin-1", { passphrase: "short" }, PASS)).rejects.toThrow();
    expect(admins.update).not.toHaveBeenCalled();
  });

  it("passes the 404 of an unknown account through", async () => {
    const { controller, admins } = makeController();
    admins.update.mockRejectedValue(new NotFoundException());

    await expect(controller.update("nope", { name: "X" }, PASS)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("CmsAdminsController remove", () => {
  it("removes an account and passes the 404 through", async () => {
    const { controller, admins } = makeController();

    await expect(controller.remove("admin-1", PASS)).resolves.toEqual({ ok: true });
    expect(admins.remove).toHaveBeenCalledWith("admin-1");

    admins.remove.mockRejectedValue(new NotFoundException());
    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});
