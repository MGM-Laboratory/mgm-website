// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from "vitest";

import {
  registerThemeSwitchHandler,
  runThemeSwitch,
  type ThemeSwitchRequest,
} from "./theme-switch";

const request = (): ThemeSwitchRequest => ({
  next: "dark",
  origin: { x: 1, y: 2 },
  commit: vi.fn(),
});

describe("theme switch", () => {
  it("returns false when no handler took the switch", () => {
    expect(runThemeSwitch(request())).toBe(false);
  });

  it("offers the switch to the newest handler first and stops at the first that takes it", () => {
    const calls: string[] = [];
    const offOld = registerThemeSwitchHandler(() => {
      calls.push("old");
      return true;
    });
    const offNew = registerThemeSwitchHandler(() => {
      calls.push("new");
      return true;
    });

    expect(runThemeSwitch(request())).toBe(true);
    expect(calls).toEqual(["new"]);

    offNew();
    offOld();
  });

  it("falls through to an older handler when the newest declines", () => {
    const old = vi.fn(() => true);
    const offOld = registerThemeSwitchHandler(old);
    const offNew = registerThemeSwitchHandler(() => false);
    const asked = request();

    expect(runThemeSwitch(asked)).toBe(true);
    expect(old).toHaveBeenCalledWith(asked);

    offNew();
    offOld();
  });

  it("stops offering to a handler that was removed, and removing twice is harmless", () => {
    const handler = vi.fn(() => true);
    const off = registerThemeSwitchHandler(handler);
    off();
    off();

    expect(runThemeSwitch(request())).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
