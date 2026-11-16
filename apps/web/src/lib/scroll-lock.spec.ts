import { beforeEach, describe, expect, it, vi } from "vitest";

const { paused, get } = vi.hoisted(() => {
  const paused = vi.fn();
  return { paused, get: vi.fn<() => { paused: typeof paused } | null>(() => ({ paused })) };
});

vi.mock("gsap/ScrollSmoother", () => ({ ScrollSmoother: { get } }));

const html = { style: { overflow: "", scrollbarGutter: "" }, clientWidth: 1000 };

async function load() {
  vi.resetModules();
  return import("./scroll-lock");
}

beforeEach(() => {
  paused.mockReset();
  get.mockReset();
  get.mockImplementation(() => ({ paused }));
  html.style.overflow = "";
  html.style.scrollbarGutter = "";
  html.clientWidth = 1000;
  vi.stubGlobal("document", { documentElement: html });
  vi.stubGlobal("window", { innerWidth: 1015 });
});

describe("scroll lock", () => {
  it("locks on the first owner, pauses the smoother and keeps the scrollbar gutter", async () => {
    const { acquireScrollLock, isScrollLocked } = await load();

    expect(isScrollLocked()).toBe(false);
    acquireScrollLock("menu");

    expect(isScrollLocked()).toBe(true);
    expect(html.style.overflow).toBe("hidden");
    expect(html.style.scrollbarGutter).toBe("stable");
    expect(paused).toHaveBeenCalledWith(true);
  });

  it("reserves no gutter when no scrollbar shows", async () => {
    html.clientWidth = 1015;
    const { acquireScrollLock } = await load();

    acquireScrollLock("menu");

    expect(html.style.overflow).toBe("hidden");
    expect(html.style.scrollbarGutter).toBe("");
  });

  it("stays locked until the last owner releases", async () => {
    const { acquireScrollLock, releaseScrollLock, isScrollLocked } = await load();
    acquireScrollLock("menu");
    acquireScrollLock("intro");
    acquireScrollLock("intro");

    releaseScrollLock("menu");
    expect(isScrollLocked()).toBe(true);
    expect(html.style.overflow).toBe("hidden");

    releaseScrollLock("intro");
    expect(isScrollLocked()).toBe(false);
    expect(html.style.overflow).toBe("");
    expect(html.style.scrollbarGutter).toBe("");
    expect(paused).toHaveBeenLastCalledWith(false);
    expect(paused).toHaveBeenCalledTimes(2);
  });

  it("ignores a release from an owner that holds nothing", async () => {
    const { releaseScrollLock, isScrollLocked } = await load();

    releaseScrollLock("ghost");

    expect(isScrollLocked()).toBe(false);
    expect(paused).not.toHaveBeenCalled();
  });

  it("works on a page without a smoother", async () => {
    get.mockReturnValue(null);
    const { acquireScrollLock } = await load();

    expect(() => acquireScrollLock("menu")).not.toThrow();
    expect(html.style.overflow).toBe("hidden");
  });

  it("tells listeners about each lock and unlock until they unsubscribe", async () => {
    const { acquireScrollLock, releaseScrollLock, onScrollLockChange } = await load();
    const listener = vi.fn();
    const off = onScrollLockChange(listener);

    acquireScrollLock("a");
    releaseScrollLock("a");
    expect(listener.mock.calls).toEqual([[true], [false]]);

    off();
    acquireScrollLock("a");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
