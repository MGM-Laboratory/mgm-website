// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = () => void;

function fakeWindow() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    handlers,
    addEventListener: vi.fn((type: string, handler: Handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(handler);
    }),
    removeEventListener: vi.fn(
      (type: string, handler: Handler) => void handlers.get(type)?.delete(handler),
    ),
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: number) => clearTimeout(id),
    fire(type: string) {
      for (const handler of [...(handlers.get(type) ?? [])]) handler();
    },
  };
}

let win: ReturnType<typeof fakeWindow>;
const doc = { hidden: false };

async function load() {
  vi.resetModules();
  return import("./idle");
}

beforeEach(() => {
  vi.useFakeTimers();
  win = fakeWindow();
  doc.hidden = false;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("onIdle", () => {
  it("calls the listener with true after the quiet time", async () => {
    const { onIdle } = await load();
    const listener = vi.fn();
    onIdle(1000, listener);

    vi.advanceTimersByTime(999);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it("restarts the wait on activity and says false on the first input after idling", async () => {
    const { onIdle } = await load();
    const listener = vi.fn();
    onIdle(1000, listener);

    vi.advanceTimersByTime(800);
    win.fire("pointermove");
    vi.advanceTimersByTime(800);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(listener.mock.calls).toEqual([[true]]);

    win.fire("keydown");
    win.fire("keydown");
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it("waits while the tab is hidden", async () => {
    const { onIdle } = await load();
    const listener = vi.fn();
    onIdle(1000, listener);
    doc.hidden = true;

    vi.advanceTimersByTime(3000);
    expect(listener).not.toHaveBeenCalled();

    doc.hidden = false;
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it("serves every subscriber with one set of listeners and removes them with the last", async () => {
    const { onIdle } = await load();
    const offA = onIdle(1000, vi.fn());
    const offB = onIdle(2000, vi.fn());

    expect(win.addEventListener).toHaveBeenCalledTimes(6);

    offA();
    expect(win.removeEventListener).not.toHaveBeenCalled();

    offB();
    expect(win.removeEventListener).toHaveBeenCalledTimes(6);
  });

  it("stops calling a subscriber that left and attaches again for the next one", async () => {
    const { onIdle } = await load();
    const gone = vi.fn();
    onIdle(1000, gone)();
    vi.advanceTimersByTime(5000);
    expect(gone).not.toHaveBeenCalled();

    onIdle(1000, vi.fn());
    expect(win.addEventListener).toHaveBeenCalledTimes(12);
  });

  it("gives each subscriber its own quiet time", async () => {
    const { onIdle } = await load();
    const quick = vi.fn();
    const slow = vi.fn();
    onIdle(500, quick);
    onIdle(2000, slow);

    vi.advanceTimersByTime(600);
    expect(quick).toHaveBeenCalledTimes(1);
    expect(slow).not.toHaveBeenCalled();

    win.fire("wheel");
    expect(quick.mock.calls).toEqual([[true], [false]]);
  });
});
