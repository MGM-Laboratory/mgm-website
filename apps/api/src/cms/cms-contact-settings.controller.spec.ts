import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsContactSettingsController } from "./cms-contact-settings.controller.js";

function makeController() {
  const settings = {
    get: vi.fn().mockResolvedValue({ emails: ["inbox@example.test"] }),
    save: vi.fn(),
    saveDetails: vi.fn().mockResolvedValue({ emails: ["new@example.test"] }),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue("the-admin-passphrase") };
  const controller = new CmsContactSettingsController(
    settings as never,
    { getStatus: vi.fn() } as never,
    config as never,
  );
  return { controller, settings };
}

describe("CmsContactSettingsController", () => {
  it("refuses to read the settings without the passphrase", async () => {
    const { controller, settings } = makeController();

    await expect(controller.get()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.get("wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(settings.get).not.toHaveBeenCalled();
  });

  it("returns the settings with the passphrase", async () => {
    const { controller } = makeController();

    await expect(controller.get("the-admin-passphrase")).resolves.toEqual({
      record: { emails: ["inbox@example.test"] },
    });
  });

  it("refuses a partial save without the passphrase", async () => {
    const { controller, settings } = makeController();

    await expect(controller.saveDetails({ address: "x" }, "wrong")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(settings.saveDetails).not.toHaveBeenCalled();
  });

  it("saves only the contact details of a partial save", async () => {
    const { controller, settings } = makeController();

    await expect(
      controller.saveDetails({ emails: ["new@example.test"] }, "the-admin-passphrase"),
    ).resolves.toEqual({ record: { emails: ["new@example.test"] } });
    expect(settings.saveDetails).toHaveBeenCalledWith({ emails: ["new@example.test"] });
  });

  it("answers 400 for a partial save that carries routing or a bad value", async () => {
    const { controller, settings } = makeController();

    await expect(
      controller.saveDetails({ mailStrategy: "failover" }, "the-admin-passphrase"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.saveDetails({ lat: 200 }, "the-admin-passphrase"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(settings.saveDetails).not.toHaveBeenCalled();
  });
});
