// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./reel-player");
}

beforeEach(() => {
  vi.resetModules();
});

describe("reel player", () => {
  it("refuses to open without a host", async () => {
    const { openReelPlayer, isReelPlayerOpen } = await load();

    expect(openReelPlayer({ src: "/v.mp4" })).toBe(false);
    expect(isReelPlayerOpen()).toBe(false);
  });

  it("tells every host about the request and marks the player open", async () => {
    const { openReelPlayer, onReelPlayerRequest, isReelPlayerOpen } = await load();
    const hostA = vi.fn();
    const hostB = vi.fn();
    onReelPlayerRequest(hostA);
    onReelPlayerRequest(hostB);
    const request = { src: "/v.mp4", startTime: 3 };

    expect(openReelPlayer(request)).toBe(true);

    expect(hostA).toHaveBeenCalledWith(request);
    expect(hostB).toHaveBeenCalledWith(request);
    expect(isReelPlayerOpen()).toBe(true);
  });

  it("does not open a second time while the player shows", async () => {
    const { openReelPlayer, onReelPlayerRequest } = await load();
    const host = vi.fn();
    onReelPlayerRequest(host);

    openReelPlayer({ src: "/a.mp4" });

    expect(openReelPlayer({ src: "/b.mp4" })).toBe(false);
    expect(host).toHaveBeenCalledTimes(1);
  });

  it("reports the close to the reel and allows opening again", async () => {
    const {
      openReelPlayer,
      onReelPlayerRequest,
      onReelPlayerClosed,
      reportReelPlayerClosed,
      isReelPlayerOpen,
    } = await load();
    onReelPlayerRequest(() => {});
    const closed = vi.fn();
    onReelPlayerClosed(closed);
    openReelPlayer({ src: "/a.mp4" });

    reportReelPlayerClosed({ currentTime: 12, finished: true });

    expect(closed).toHaveBeenCalledWith({ currentTime: 12, finished: true });
    expect(isReelPlayerOpen()).toBe(false);
    expect(openReelPlayer({ src: "/a.mp4" })).toBe(true);
  });

  it("stops telling a host or a reel that unsubscribed", async () => {
    const { openReelPlayer, onReelPlayerRequest, onReelPlayerClosed, reportReelPlayerClosed } =
      await load();
    const host = vi.fn();
    const closed = vi.fn();
    const offHost = onReelPlayerRequest(host);
    const offClosed = onReelPlayerClosed(closed);
    offHost();
    offClosed();

    expect(openReelPlayer({ src: "/a.mp4" })).toBe(false);
    reportReelPlayerClosed({ currentTime: 0, finished: false });

    expect(host).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });
});
