import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./projects-intro");
}

beforeEach(() => {
  vi.resetModules();
});

describe("projects intro", () => {
  it("never makes a page wait when no intro was opened", async () => {
    const intro = await load();

    expect(intro.isProjectsIntroDone()).toBe(true);
    await expect(intro.waitForProjectsIntro()).resolves.toBeUndefined();
    await expect(intro.waitForGridReveal()).resolves.toBeUndefined();
  });

  it("holds waiters while the intro plays and releases them when it finishes", async () => {
    const intro = await load();
    intro.beginProjectsIntro();
    const done = vi.fn();
    void intro.waitForProjectsIntro().then(done);
    await Promise.resolve();

    expect(intro.isProjectsIntroDone()).toBe(false);
    expect(done).not.toHaveBeenCalled();

    intro.finishProjectsIntro();
    await Promise.resolve();

    expect(intro.isProjectsIntroDone()).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("keeps the grid reveal separate from the intro", async () => {
    const intro = await load();
    intro.beginProjectsIntro();
    const revealed = vi.fn();
    void intro.waitForGridReveal().then(revealed);

    intro.finishProjectsIntro();
    await Promise.resolve();
    expect(revealed).not.toHaveBeenCalled();

    intro.markGridRevealStarted();
    await Promise.resolve();
    expect(revealed).toHaveBeenCalledTimes(1);
  });

  it("ignores a second finish and a reveal that already started", async () => {
    const intro = await load();
    intro.beginProjectsIntro();
    const done = vi.fn();
    void intro.waitForProjectsIntro().then(done);

    intro.finishProjectsIntro();
    intro.finishProjectsIntro();
    intro.markGridRevealStarted();
    intro.markGridRevealStarted();
    await Promise.resolve();

    expect(done).toHaveBeenCalledTimes(1);
  });

  it("drops the waiters of an earlier visit when a new intro opens", async () => {
    const intro = await load();
    intro.beginProjectsIntro();
    const stale = vi.fn();
    void intro.waitForProjectsIntro().then(stale);

    intro.beginProjectsIntro();
    intro.finishProjectsIntro();
    await Promise.resolve();

    expect(stale).not.toHaveBeenCalled();
  });
});
