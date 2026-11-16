// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PointerListener = (state: Record<string, unknown>) => void;

const mocks = vi.hoisted(() => ({
  quickTo: vi.fn(),
  getProperty: vi.fn(),
  set: vi.fn(),
  finePointer: vi.fn(() => true),
  motionAllowed: vi.fn(() => true),
  onPointer: vi.fn(),
  off: vi.fn(),
}));

vi.mock("gsap", () => ({
  default: {
    quickTo: mocks.quickTo,
    getProperty: mocks.getProperty,
    set: mocks.set,
    utils: {
      clamp: (min: number, max: number, value: number) => Math.min(max, Math.max(min, value)),
    },
  },
}));
vi.mock("@/lib/motion/pointer", () => ({
  finePointer: mocks.finePointer,
  onPointer: mocks.onPointer,
}));
vi.mock("@/lib/reduced-motion", () => ({ motionAllowed: mocks.motionAllowed }));

import { attachMagnetic } from "./magnetic";

type Setter = ReturnType<typeof vi.fn> & { tween: { kill: ReturnType<typeof vi.fn> } };

// quickTo runs on attach, so the setters exist only after attachMagnetic was called
let created: Setter[] = [];
let toX: Setter;
let toY: Setter;
let listener: PointerListener;
let now = 0;
const windowHandlers = new Map<string, () => void>();
const rect = { x: 100, y: 100, width: 50, height: 50 };

const el = () => ({ getBoundingClientRect: () => rect }) as unknown as HTMLElement;
const pointerAt = (x: number, y: number, extra: Record<string, unknown> = {}) =>
  listener({ x, y, inside: true, type: "mouse", ...extra });

beforeEach(() => {
  now = 1000;
  rect.x = 100;
  windowHandlers.clear();
  const setters: Setter[] = [];
  mocks.quickTo.mockReset();
  mocks.quickTo.mockImplementation(() => {
    const setter = Object.assign(vi.fn(), { tween: { kill: vi.fn() } }) as Setter;
    setters.push(setter);
    return setter;
  });
  mocks.getProperty.mockReset();
  mocks.getProperty.mockReturnValue(0);
  mocks.set.mockReset();
  mocks.finePointer.mockReturnValue(true);
  mocks.motionAllowed.mockReturnValue(true);
  mocks.off.mockReset();
  mocks.onPointer.mockReset();
  mocks.onPointer.mockImplementation((next: PointerListener) => {
    listener = next;
    return mocks.off;
  });
  vi.stubGlobal("window", {
    addEventListener: (type: string, handler: () => void) => void windowHandlers.set(type, handler),
    removeEventListener: (type: string) => void windowHandlers.delete(type),
  });
  vi.stubGlobal(
    "DOMRect",
    class {
      constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number,
      ) {}
    },
  );
  vi.spyOn(performance, "now").mockImplementation(() => now);
  created = setters;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function attach(options = {}) {
  const cleanup = attachMagnetic(el(), options);
  [toX, toY] = created as [Setter, Setter];
  return cleanup;
}

describe("attachMagnetic", () => {
  it("does nothing without a hovering pointer", () => {
    mocks.finePointer.mockReturnValue(false);

    const cleanup = attachMagnetic(el());

    expect(mocks.onPointer).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it("does nothing under reduced motion", () => {
    mocks.motionAllowed.mockReturnValue(false);

    attachMagnetic(el());

    expect(mocks.quickTo).not.toHaveBeenCalled();
  });

  it("pulls toward the pointer by the strength, limited by max, and reports the pull", () => {
    const onPull = vi.fn();
    attach({ onPull });

    // centre at (125, 125), pointer 40 right of it
    pointerAt(165, 125);

    expect(toX).toHaveBeenCalledWith(40 * 0.35);
    expect(toY).toHaveBeenCalledWith(0);
    // reach = 25 + 90, distance 40
    expect(onPull).toHaveBeenLastCalledWith(1 - 40 / 115);
  });

  it("limits the offset to max", () => {
    attach({ strength: 1, max: 10 });

    pointerAt(175, 75);

    expect(toX).toHaveBeenCalledWith(10);
    expect(toY).toHaveBeenCalledWith(-10);
  });

  it("measures the box without the offset the pull already added", () => {
    mocks.getProperty.mockImplementation((_el: unknown, name: string) => (name === "x" ? 10 : -5));
    attach();

    // the true box is at x 90, so the centre is 115, and the pointer sits on it
    pointerAt(115, 130);

    expect(toX).toHaveBeenCalledWith(0);
    expect(toY).toHaveBeenCalledWith(0);
  });

  it("treats an unreadable offset as zero", () => {
    mocks.getProperty.mockReturnValue("auto");
    attach();

    pointerAt(125, 125);

    expect(toX).toHaveBeenCalledWith(0);
  });

  it("measures at most once a frame and again when the page scrolls", () => {
    attach();
    pointerAt(150, 125);
    const first = toX.mock.calls.length;
    rect.x = 500;

    now += 5;
    pointerAt(150, 125);
    expect(toX.mock.calls.at(-1)).toEqual(toX.mock.calls[first - 1]);

    now += 30;
    pointerAt(150, 125);
    // the new box is far away, so the pointer is out of reach and the pull releases
    expect(toX.mock.calls.at(-1)).toEqual([0]);

    rect.x = 100;
    windowHandlers.get("scroll")?.();
    now += 1;
    pointerAt(150, 125);
    expect(toX.mock.calls.at(-1)).toEqual([25 * 0.35]);
  });

  it("releases when the pointer moves out of reach, and only once", () => {
    const onPull = vi.fn();
    attach({ onPull, radius: 20 });
    pointerAt(125, 125);
    expect(onPull).toHaveBeenCalledTimes(1);

    now += 30;
    pointerAt(400, 400);
    expect(toX).toHaveBeenLastCalledWith(0);
    expect(toY).toHaveBeenLastCalledWith(0);
    expect(onPull).toHaveBeenLastCalledWith(0);

    now += 30;
    pointerAt(500, 500);
    expect(onPull).toHaveBeenCalledTimes(2);
  });

  it("releases when the pointer leaves the page or is a touch", () => {
    const onPull = vi.fn();
    attach({ onPull });
    pointerAt(125, 125);

    pointerAt(125, 125, { inside: false });
    expect(onPull).toHaveBeenLastCalledWith(0);

    now += 30;
    pointerAt(125, 125);
    pointerAt(125, 125, { type: "touch" });
    expect(onPull).toHaveBeenLastCalledWith(0);
    expect(onPull).toHaveBeenCalledTimes(4);
  });

  it("does nothing when the pointer is outside and the effect was not engaged", () => {
    attach();

    pointerAt(0, 0, { inside: false });

    expect(toX).not.toHaveBeenCalled();
  });

  it("works without a pull callback", () => {
    attach();

    expect(() => {
      pointerAt(125, 125);
      now += 30;
      pointerAt(900, 900);
    }).not.toThrow();
  });

  it("cleans up its listeners and tweens and puts the element back", () => {
    const cleanup = attach();

    cleanup();

    expect(mocks.off).toHaveBeenCalledTimes(1);
    expect(windowHandlers.size).toBe(0);
    expect(toX.tween.kill).toHaveBeenCalled();
    expect(toY.tween.kill).toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith(expect.anything(), { x: 0, y: 0 });
  });

  it("measures again after a resize", () => {
    attach();
    pointerAt(150, 125);
    rect.x = 500;

    windowHandlers.get("resize")?.();
    now += 1;
    pointerAt(150, 125);

    expect(toX.mock.calls.at(-1)).toEqual([0]);
  });
});
