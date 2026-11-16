import { DEFAULT_CONTACT_SETTINGS, type ContactSettings } from "@repo/shared";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsContactSettingsController } from "./cms-contact-settings.controller.js";
import { CmsContactSettingsService } from "./cms-contact-settings.service.js";

const STORED: ContactSettings = { ...DEFAULT_CONTACT_SETTINGS, address: "Stored street" };

function makeService(options: { stored?: unknown; cached?: unknown } = {}) {
  const model = {
    findUnique: vi
      .fn()
      .mockResolvedValue(options.stored === undefined ? null : { data: options.stored }),
  };
  const cache = {
    getJson: vi.fn().mockResolvedValue(options.cached ?? null),
    setJson: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CmsContactSettingsService(
    { cmsContactSettings: model } as never,
    cache as never,
  );
  return { service, model, cache };
}

describe("CmsContactSettingsService get", () => {
  it("returns the stored settings and caches them for 10 minutes", async () => {
    const { service, model, cache } = makeService({ stored: STORED });

    const settings = await service.get();

    expect(model.findUnique).toHaveBeenCalledWith({ where: { slug: "contact" } });
    expect(settings.address).toBe("Stored street");
    expect(cache.setJson).toHaveBeenCalledWith("cms:contact-settings:v1", settings, 600);
  });

  it("falls back to the defaults when nothing is stored or the record is invalid", async () => {
    const empty = makeService();
    await expect(empty.service.get()).resolves.toEqual(DEFAULT_CONTACT_SETTINGS);

    const invalid = makeService({ stored: { emails: "not a list", lat: 999 } });
    await expect(invalid.service.get()).resolves.toEqual(DEFAULT_CONTACT_SETTINGS);
  });

  it("serves the cached settings without a query", async () => {
    const { service, model } = makeService({ cached: STORED });

    await expect(service.get()).resolves.toMatchObject({ address: "Stored street" });
    expect(model.findUnique).not.toHaveBeenCalled();
  });
});

describe("CmsContactSettingsController status and save", () => {
  function makeController() {
    const settings = {
      get: vi.fn().mockResolvedValue({ ...STORED, mailProviderLimits: { ses: { daily: 5 } } }),
      save: vi.fn(async (data: unknown) => data),
    };
    const mail = { getStatus: vi.fn().mockReturnValue({ ses: { configured: true } }) };
    const config = { getOrThrow: vi.fn().mockReturnValue("the-admin-passphrase") };
    const controller = new CmsContactSettingsController(
      settings as never,
      mail as never,
      config as never,
    );
    return { controller, settings, mail };
  }

  it("answers 401 for the status and the save with no or a wrong passphrase", async () => {
    const { controller, settings, mail } = makeController();

    await expect(controller.status()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.status("wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.save({}, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mail.getStatus).not.toHaveBeenCalled();
    expect(settings.save).not.toHaveBeenCalled();
  });

  it("reads the limits from the saved settings and not from the caller", async () => {
    const { controller, mail } = makeController();

    await expect(controller.status("the-admin-passphrase")).resolves.toEqual({
      ses: { configured: true },
    });
    expect(mail.getStatus).toHaveBeenCalledWith({ ses: { daily: 5 } });
  });

  it("saves valid settings and rejects an invalid body", async () => {
    const { controller, settings } = makeController();

    await expect(controller.save(STORED, "the-admin-passphrase")).resolves.toMatchObject({
      record: { address: "Stored street" },
    });
    expect(settings.save).toHaveBeenCalledTimes(1);

    settings.save.mockClear();
    await expect(controller.save({ lat: 999 }, "the-admin-passphrase")).rejects.toThrow();
    expect(settings.save).not.toHaveBeenCalled();
  });
});
