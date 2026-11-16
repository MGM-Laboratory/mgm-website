// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("app boot", () => {
  it("starts as not booted and stays booted until the module reloads", async () => {
    const { hasAppAlreadyBooted, markAppBooted } = await import("./app-boot");

    expect(hasAppAlreadyBooted()).toBe(false);
    markAppBooted();
    markAppBooted();
    expect(hasAppAlreadyBooted()).toBe(true);
  });

  it("forgets the boot on a fresh module, like a hard reload", async () => {
    const first = await import("./app-boot");
    first.markAppBooted();

    vi.resetModules();
    const reloaded = await import("./app-boot");

    expect(reloaded.hasAppAlreadyBooted()).toBe(false);
  });
});
