// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest";

import { getGlHost, onGlHost, setGlHost, type GlHost } from "./gl-host";

const host = () => ({}) as GlHost;

afterEach(() => {
  setGlHost(null);
});

describe("gl host registry", () => {
  it("has no host at first", () => {
    expect(getGlHost()).toBeNull();
  });

  it("tells a listener the current host at once and each change after", () => {
    const first = host();
    setGlHost(first);
    const listener = vi.fn();

    const off = onGlHost(listener);
    expect(listener).toHaveBeenLastCalledWith(first);

    const second = host();
    setGlHost(second);
    expect(listener).toHaveBeenLastCalledWith(second);
    expect(getGlHost()).toBe(second);

    setGlHost(null);
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(listener).toHaveBeenCalledTimes(3);

    off();
  });

  it("stays quiet when the same host is set again", () => {
    const only = host();
    setGlHost(only);
    const listener = vi.fn();
    const off = onGlHost(listener);

    setGlHost(only);

    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("stops telling a listener that unsubscribed", () => {
    const listener = vi.fn();
    const off = onGlHost(listener);
    off();

    setGlHost(host());

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
