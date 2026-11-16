// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Change = () => void;

function fakeMedia(matches: boolean) {
  const handlers = new Set<Change>();
  const media = {
    matches,
    addEventListener: vi.fn((_type: string, handler: Change) => void handlers.add(handler)),
    removeEventListener: vi.fn((_type: string, handler: Change) => void handlers.delete(handler)),
    set(value: boolean) {
      media.matches = value;
      for (const handler of [...handlers]) handler();
    },
    handlers,
  };
  return media;
}

async function load(matches: boolean) {
  vi.resetModules();
  const media = fakeMedia(matches);
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal("window", { matchMedia });
  const mod = await import("./reduced-motion");
  return { ...mod, media, matchMedia };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("motionAllowed", () => {
  it("reads the live preference and builds the query once", async () => {
    const { motionAllowed, media, matchMedia } = await load(true);

    expect(motionAllowed()).toBe(true);
    media.set(false);
    expect(motionAllowed()).toBe(false);
    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: no-preference)");
  });
});

describe("onReducedMotion", () => {
  it("calls the listener once, when reduced motion turns on, and then detaches", async () => {
    const { onReducedMotion, media } = await load(true);
    const listener = vi.fn();
    onReducedMotion(listener);

    media.set(true);
    expect(listener).not.toHaveBeenCalled();

    media.set(false);
    media.set(true);
    media.set(false);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(media.handlers.size).toBe(0);
  });

  it("shares one change listener between subscribers and removes it with the last one", async () => {
    const { onReducedMotion, media } = await load(true);
    const offA = onReducedMotion(vi.fn());
    const offB = onReducedMotion(vi.fn());

    expect(media.addEventListener).toHaveBeenCalledTimes(1);

    offA();
    expect(media.removeEventListener).not.toHaveBeenCalled();

    offB();
    offB();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  });
});

describe("useMotionPreference", () => {
  it("reports motion allowed while rendering on the server", async () => {
    const { useMotionPreference } = await load(false);
    function Probe() {
      return createElement("span", null, String(useMotionPreference()));
    }

    expect(renderToString(createElement(Probe))).toContain("true");
  });
});
