import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./route-reveal");
}

beforeEach(() => {
  vi.resetModules();
});

describe("route reveal", () => {
  it("resolves at once on a fresh load, when no cover started", async () => {
    const { isRouteCoverActive, waitForRouteReveal } = await load();

    expect(isRouteCoverActive()).toBe(false);
    await expect(waitForRouteReveal()).resolves.toBeUndefined();
  });

  it("holds waiters until the reveal is done and then releases them all", async () => {
    const { markRouteCoverStarted, markRouteRevealDone, waitForRouteReveal, isRouteCoverActive } =
      await load();
    markRouteCoverStarted();
    const first = vi.fn();
    const second = vi.fn();
    void waitForRouteReveal().then(first);
    void waitForRouteReveal().then(second);
    await Promise.resolve();

    expect(isRouteCoverActive()).toBe(true);
    expect(first).not.toHaveBeenCalled();

    markRouteRevealDone();
    await Promise.resolve();

    expect(isRouteCoverActive()).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("tells listeners only when the state really changes", async () => {
    const { markRouteCoverStarted, markRouteRevealDone, onRouteCoverChange } = await load();
    const listener = vi.fn();
    const off = onRouteCoverChange(listener);

    markRouteRevealDone();
    expect(listener).not.toHaveBeenCalled();

    markRouteCoverStarted();
    markRouteCoverStarted();
    expect(listener).toHaveBeenCalledTimes(1);

    markRouteRevealDone();
    markRouteRevealDone();
    expect(listener).toHaveBeenCalledTimes(2);

    off();
    markRouteCoverStarted();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
