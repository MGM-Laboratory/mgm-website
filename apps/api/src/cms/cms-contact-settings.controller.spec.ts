import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsContactSettingsController } from "./cms-contact-settings.controller.js";

function makeController() {
  const settings = {
    get: vi.fn().mockResolvedValue({ emails: ["inbox@example.test"] }),
    save: vi.fn(),
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
});
