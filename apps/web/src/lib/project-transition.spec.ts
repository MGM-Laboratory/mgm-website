// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { motionAllowed } = vi.hoisted(() => ({ motionAllowed: vi.fn(() => true) }));

vi.mock("@/lib/reduced-motion", () => ({ motionAllowed }));

async function load() {
  vi.resetModules();
  return import("./project-transition");
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  motionAllowed.mockReturnValue(true);
  vi.stubGlobal("window", {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: number) => clearTimeout(id),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("paths", () => {
  it("reads the slug of a project detail path", async () => {
    const { projectDetailSlug } = await load();

    expect(projectDetailSlug("/projects/my-app")).toBe("my-app");
    expect(projectDetailSlug("/projects/a%20b")).toBe("a b");
    expect(projectDetailSlug("/projects")).toBeNull();
    expect(projectDetailSlug("/projects/a/b")).toBeNull();
    expect(projectDetailSlug("/projects/%E0")).toBeNull();
  });

  it.each([
    ["/projects", "/projects/a", "enter"],
    ["/projects/a", "/projects", "exit"],
    ["/projects/a", "/projects/b", "swap"],
  ])("%s to %s is %s", async (from, to, kind) => {
    const { projectTransitionKind } = await load();

    expect(projectTransitionKind(from, to)).toBe(kind);
  });

  it.each([
    ["/projects/a", "/projects/a"],
    ["/about", "/projects/a"],
    ["/projects", "/about"],
    ["/", "/projects"],
  ])("%s to %s is none", async (from, to) => {
    const { projectTransitionKind } = await load();

    expect(projectTransitionKind(from, to)).toBeNull();
  });
});

describe("cover", () => {
  it("resolves at once without a cover", async () => {
    const { waitForProjectReveal, isProjectCoverActive } = await load();

    expect(isProjectCoverActive()).toBe(false);
    await expect(waitForProjectReveal()).resolves.toBeUndefined();
  });

  it("holds waiters until the reveal starts and ignores a reveal without a cover", async () => {
    const { markProjectCoverStarted, markProjectRevealStarted, waitForProjectReveal } =
      await load();
    markProjectRevealStarted();
    markProjectCoverStarted();
    const done = vi.fn();
    void waitForProjectReveal().then(done);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    markProjectRevealStarted();
    await Promise.resolve();

    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("page readiness", () => {
  it("is ready when no page is expected", async () => {
    const { waitForProjectPage } = await load();

    await expect(waitForProjectPage(1000)).resolves.toBeUndefined();
  });

  it("waits for the expected slug and ignores another", async () => {
    const { expectProjectPage, markProjectPageReady, waitForProjectPage } = await load();
    expectProjectPage("a");
    const done = vi.fn();
    void waitForProjectPage(5000).then(done);

    markProjectPageReady("b");
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    markProjectPageReady("a");
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout", async () => {
    const { expectProjectPage, waitForProjectPage } = await load();
    expectProjectPage("a");
    const done = vi.fn();
    void waitForProjectPage(300).then(done);

    await vi.advanceTimersByTimeAsync(300);

    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("return note and scroll reset", () => {
  it("keeps the return note until it is cleared", async () => {
    const { setProjectReturn, peekProjectReturn, clearProjectReturn } = await load();

    expect(peekProjectReturn()).toBeUndefined();
    setProjectReturn({ slug: "a", scrollY: 40, restoreOnly: true });
    expect(peekProjectReturn()).toEqual({ slug: "a", scrollY: 40, restoreOnly: true });

    clearProjectReturn();
    expect(peekProjectReturn()).toBeUndefined();
  });

  it("lets one destination keep its scroll and uses the request up on any route change", async () => {
    const { skipScrollReset, consumeScrollResetSkip } = await load();

    expect(consumeScrollResetSkip("/projects")).toBe(false);

    skipScrollReset("/projects");
    expect(consumeScrollResetSkip("/projects")).toBe(true);
    expect(consumeScrollResetSkip("/projects")).toBe(false);

    skipScrollReset("/projects");
    expect(consumeScrollResetSkip("/about")).toBe(false);
    expect(consumeScrollResetSkip("/projects")).toBe(false);

    skipScrollReset(null);
    expect(consumeScrollResetSkip("/projects")).toBe(false);
  });
});

describe("popstate", () => {
  it("claims a project transition only while the overlay is mounted and motion is allowed", async () => {
    const { claimsProjectPopstate, registerProjectTransitionLayer } = await load();

    expect(claimsProjectPopstate("/projects", "/projects/a")).toBe(false);

    const off = registerProjectTransitionLayer();
    expect(claimsProjectPopstate("/projects", "/projects/a")).toBe(true);
    expect(claimsProjectPopstate("/about", "/contact")).toBe(false);

    motionAllowed.mockReturnValue(false);
    expect(claimsProjectPopstate("/projects", "/projects/a")).toBe(false);

    motionAllowed.mockReturnValue(true);
    off();
    off();
    expect(claimsProjectPopstate("/projects", "/projects/a")).toBe(false);
  });

  it("keeps the overlay while another layer is still mounted", async () => {
    const { claimsProjectPopstate, registerProjectTransitionLayer } = await load();
    const first = registerProjectTransitionLayer();
    registerProjectTransitionLayer();

    first();

    expect(claimsProjectPopstate("/projects/a", "/projects")).toBe(true);
  });
});

describe("busy", () => {
  it("is busy during a zoom or a hand-off and tells listeners only on a change", async () => {
    const {
      isProjectTransitionBusy,
      isDetailHandoffActive,
      setDetailHandoffActive,
      setProjectZoomRunning,
      onProjectTransitionChange,
    } = await load();
    const listener = vi.fn();
    const off = onProjectTransitionChange(listener);

    expect(isProjectTransitionBusy()).toBe(false);

    setProjectZoomRunning(false);
    setDetailHandoffActive(false);
    expect(listener).not.toHaveBeenCalled();

    setProjectZoomRunning(true);
    setProjectZoomRunning(true);
    expect(isProjectTransitionBusy()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setDetailHandoffActive(true);
    expect(isDetailHandoffActive()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);

    setProjectZoomRunning(false);
    expect(isProjectTransitionBusy()).toBe(true);

    setDetailHandoffActive(false);
    expect(isProjectTransitionBusy()).toBe(false);

    off();
    setProjectZoomRunning(true);
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
