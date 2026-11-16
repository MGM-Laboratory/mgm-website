import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scrollPageTo, setPageScroller } from "./page-scroll";

const scrollTo = vi.fn();

beforeEach(() => {
  scrollTo.mockReset();
  vi.stubGlobal("window", { scrollY: 200, scrollTo });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const element = (top: number) => ({ getBoundingClientRect: () => ({ top }) }) as unknown as Element;

describe("scrollPageTo without a page scroller", () => {
  it("scrolls smoothly to a pixel position by default", () => {
    scrollPageTo(500);

    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  });

  it("jumps at once for a zero duration", () => {
    scrollPageTo(500, { duration: 0 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "auto" });
  });

  it("resolves an element against the current scroll and adds the offset", () => {
    scrollPageTo(element(300), { offset: -80 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 420, behavior: "smooth" });
  });

  it("never scrolls above the top of the page", () => {
    scrollPageTo(10, { offset: -100 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});

describe("scrollPageTo with a page scroller", () => {
  it("hands the target and options to the scroller and leaves window.scrollTo alone", () => {
    const scroller = vi.fn();
    const off = setPageScroller(scroller);
    const target = element(10);

    scrollPageTo(target, { duration: 2 });

    expect(scroller).toHaveBeenCalledWith(target, { duration: 2 });
    expect(scrollTo).not.toHaveBeenCalled();
    off();
  });

  it("falls back to window.scrollTo once the scroller is removed", () => {
    const off = setPageScroller(vi.fn());
    off();

    scrollPageTo(50);

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("keeps a newer scroller when an older one is removed late", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = setPageScroller(first);
    const offSecond = setPageScroller(second);

    offFirst();
    scrollPageTo(1);
    expect(second).toHaveBeenCalledTimes(1);

    offSecond();
  });
});
