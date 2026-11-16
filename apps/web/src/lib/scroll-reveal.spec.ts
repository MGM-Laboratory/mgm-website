// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Timeline = {
  scrollTrigger:
    | { progress?: number; kill: ReturnType<typeof vi.fn>; opts: Record<string, unknown> }
    | undefined;
  progressValue: number;
  fromTo: ReturnType<typeof vi.fn>;
  eventCallback: ReturnType<typeof vi.fn>;
  progress: ReturnType<typeof vi.fn>;
  vars: Record<string, unknown>;
};

const react = vi.hoisted(() => ({
  effects: [] as { run: () => void | (() => void); deps: unknown[] }[],
}));

vi.mock("react", () => ({
  useRef: (value: unknown) => ({ current: value ?? null }),
  useLayoutEffect: (run: () => void | (() => void), deps: unknown[]) => {
    react.effects.push({ run, deps });
  },
}));

const mocks = vi.hoisted(() => ({
  toArray: vi.fn(),
  set: vi.fn(),
  timeline: vi.fn(),
  registerPlugin: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

vi.mock("gsap", () => ({
  default: {
    utils: { toArray: mocks.toArray },
    set: mocks.set,
    timeline: mocks.timeline,
    registerPlugin: mocks.registerPlugin,
    core: {},
  },
}));
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {
    addEventListener: mocks.addEventListener,
    removeEventListener: mocks.removeEventListener,
  },
}));

let tl: Timeline;
let matchesNoPreference = true;
let rootTop = 0;
let rootConnected = true;

function makeTimeline(vars: Record<string, unknown>): Timeline {
  const trigger = {
    progress: undefined as number | undefined,
    kill: vi.fn(),
    opts: vars.scrollTrigger as Record<string, unknown>,
  };
  const timeline: Timeline = {
    scrollTrigger: trigger,
    progressValue: 0,
    vars,
    fromTo: vi.fn(),
    eventCallback: vi.fn(),
    progress: vi.fn((value?: number) => {
      if (value === undefined) return timeline.progressValue;
      timeline.progressValue = value;
      return timeline;
    }),
  };
  return timeline;
}

const root = () =>
  ({
    get isConnected() {
      return rootConnected;
    },
    getBoundingClientRect: () => ({ top: rootTop }),
  }) as unknown as Element;

async function load() {
  vi.resetModules();
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: matchesNoPreference }),
    innerHeight: 1000,
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
  });
  return import("./scroll-reveal");
}

beforeEach(() => {
  vi.useFakeTimers();
  matchesNoPreference = true;
  rootTop = 0;
  rootConnected = true;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.toArray.mockReturnValue([{ id: "a" }, { id: "b" }]);
  mocks.timeline.mockImplementation((vars: Record<string, unknown>) => {
    tl = makeTimeline(vars);
    return tl;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("killTriggerOnComplete", () => {
  it("kills the scroll trigger when the timeline completes", async () => {
    const { killTriggerOnComplete } = await load();
    const timeline = makeTimeline({});

    killTriggerOnComplete(timeline as unknown as gsap.core.Timeline);

    expect(timeline.eventCallback).toHaveBeenCalledWith("onComplete", expect.any(Function));
    timeline.eventCallback.mock.calls[0][1]();
    expect(timeline.scrollTrigger?.kill).toHaveBeenCalledTimes(1);
  });

  it("copes with a timeline that has no trigger any more", async () => {
    const { killTriggerOnComplete } = await load();
    const timeline = makeTimeline({});
    timeline.scrollTrigger = undefined;

    killTriggerOnComplete(timeline as unknown as gsap.core.Timeline);

    expect(() => timeline.eventCallback.mock.calls[0][1]()).not.toThrow();
  });
});

describe("fadeUpOnScroll", () => {
  it("does nothing when the selector matches nothing", async () => {
    const { fadeUpOnScroll } = await load();
    mocks.toArray.mockReturnValue([]);

    expect(fadeUpOnScroll(root(), ".x")).toBeNull();
    expect(mocks.timeline).not.toHaveBeenCalled();
  });

  it("shows the targets at once under reduced motion", async () => {
    const { fadeUpOnScroll } = await load();
    matchesNoPreference = false;

    expect(fadeUpOnScroll(root(), ".x")).toBeNull();

    expect(mocks.set).toHaveBeenCalledWith(expect.any(Array), { opacity: 1, y: 0 });
    expect(mocks.timeline).not.toHaveBeenCalled();
  });

  it("builds a timeline level trigger that fades the targets up with the options", async () => {
    const { fadeUpOnScroll } = await load();

    const result = fadeUpOnScroll(root(), ".x", { start: "top 70%", stagger: 0.2, y: 40 });

    expect(result).toBe(tl);
    expect(tl.vars.scrollTrigger).toMatchObject({ start: "top 70%", once: false });
    const [targets, from, to] = tl.fromTo.mock.calls[0];
    expect(targets).toHaveLength(2);
    expect(from).toEqual({ opacity: 0, y: 40 });
    expect(to).toMatchObject({ opacity: 1, y: 0, duration: 0.6, stagger: 0.2 });
    expect(mocks.addEventListener).toHaveBeenCalledWith("refresh", expect.any(Function));
  });

  it("uses the default options", async () => {
    const { fadeUpOnScroll } = await load();

    fadeUpOnScroll(root(), ".x");

    expect(tl.vars.scrollTrigger).toMatchObject({ start: "top 85%" });
    expect(tl.fromTo.mock.calls[0][1]).toEqual({ opacity: 0, y: 24 });
    expect(tl.fromTo.mock.calls[0][2]).toMatchObject({ stagger: 0.1 });
  });

  it("jumps to the end state when the trigger is already past its start on a refresh", async () => {
    const { fadeUpOnScroll } = await load();
    fadeUpOnScroll(root(), ".x");
    const onRefresh = mocks.addEventListener.mock.calls[0][1] as () => void;

    onRefresh();
    expect(tl.progress).not.toHaveBeenCalledWith(1);

    tl.scrollTrigger!.progress = 0.4;
    onRefresh();

    expect(tl.progress).toHaveBeenCalledWith(1);
    expect(mocks.set).toHaveBeenCalledWith(expect.any(Array), { opacity: 1, y: 0 });
    expect(mocks.removeEventListener).toHaveBeenCalledWith("refresh", onRefresh);
  });

  it("does the check again on a short timer", async () => {
    const { fadeUpOnScroll } = await load();
    fadeUpOnScroll(root(), ".x");

    vi.advanceTimersByTime(250);
    expect(tl.progress).not.toHaveBeenCalledWith(1);

    tl.scrollTrigger!.progress = 0.1;
    vi.advanceTimersByTime(500);

    expect(tl.progress).toHaveBeenCalledWith(1);
  });

  it("leaves a reveal that already started alone", async () => {
    const { fadeUpOnScroll } = await load();
    fadeUpOnScroll(root(), ".x");
    tl.progressValue = 0.5;
    tl.scrollTrigger!.progress = 0.9;

    (mocks.addEventListener.mock.calls[0][1] as () => void)();

    expect(tl.progress).not.toHaveBeenCalledWith(1);
    expect(mocks.removeEventListener).toHaveBeenCalled();
  });

  it("settles without touching the page when the trigger was killed", async () => {
    const { fadeUpOnScroll } = await load();
    fadeUpOnScroll(root(), ".x");
    tl.scrollTrigger = undefined;

    (mocks.addEventListener.mock.calls[0][1] as () => void)();

    expect(tl.progress).not.toHaveBeenCalledWith(1);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("resolves and stops its fallbacks when the trigger is killed on unmount", async () => {
    const { fadeUpOnScroll } = await load();
    fadeUpOnScroll(root(), ".x");
    const onKill = (tl.vars.scrollTrigger as { onKill: () => void }).onKill;

    onKill();
    onKill();
    vi.advanceTimersByTime(2000);

    expect(mocks.removeEventListener).toHaveBeenCalledTimes(1);
    expect(tl.progress).not.toHaveBeenCalledWith(1);
  });

  it("reveals a section that is above 85 percent of the viewport after 1.5 seconds when positions never came", async () => {
    const { fadeUpOnScroll } = await load();
    rootTop = 400;
    fadeUpOnScroll(root(), ".x");

    vi.advanceTimersByTime(1500);

    expect(tl.progress).toHaveBeenCalledWith(1);
    expect(mocks.set).toHaveBeenCalledWith(expect.any(Array), { opacity: 1, y: 0 });
  });

  it("leaves a section below the fold to its normal crossing", async () => {
    const { fadeUpOnScroll } = await load();
    rootTop = 900;
    fadeUpOnScroll(root(), ".x");

    vi.advanceTimersByTime(1500);

    expect(tl.progress).not.toHaveBeenCalledWith(1);
    expect(mocks.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("does not reveal a section that left the document", async () => {
    const { fadeUpOnScroll } = await load();
    rootTop = 0;
    fadeUpOnScroll(root(), ".x");
    rootConnected = false;

    vi.advanceTimersByTime(1500);

    expect(tl.progress).not.toHaveBeenCalledWith(1);
  });

  it("does not reveal when the reveal already ran by the last fallback", async () => {
    const { fadeUpOnScroll } = await load();
    fadeUpOnScroll(root(), ".x");
    tl.progressValue = 0.2;

    vi.advanceTimersByTime(1500);

    expect(tl.progress).not.toHaveBeenCalledWith(1);
  });
});

describe("useFadeUpOnScroll", () => {
  beforeEach(() => {
    react.effects.length = 0;
  });

  it("starts the reveal on the root in a layout effect and kills its trigger on cleanup", async () => {
    const { useFadeUpOnScroll } = await load();
    const ref = useFadeUpOnScroll(".card", { start: "top 60%", stagger: 0.3, y: 10 });
    (ref as { current: unknown }).current = root();

    const cleanup = react.effects[0].run() as () => void;

    expect(react.effects[0].deps).toEqual([".card", "top 60%", 0.3, 10]);
    expect(tl.vars.scrollTrigger).toMatchObject({ start: "top 60%" });
    cleanup();
    expect(tl.scrollTrigger?.kill).toHaveBeenCalledTimes(1);
  });

  it("does nothing before the root is mounted", async () => {
    const { useFadeUpOnScroll } = await load();
    useFadeUpOnScroll(".card");

    expect(react.effects[0].run()).toBeUndefined();
    expect(mocks.timeline).not.toHaveBeenCalled();
  });

  it("returns a cleanup that does nothing when the reveal was skipped", async () => {
    const { useFadeUpOnScroll } = await load();
    matchesNoPreference = false;
    const ref = useFadeUpOnScroll(".card");
    (ref as { current: unknown }).current = root();

    const cleanup = react.effects[0].run() as () => void;

    expect(() => cleanup()).not.toThrow();
  });
});
