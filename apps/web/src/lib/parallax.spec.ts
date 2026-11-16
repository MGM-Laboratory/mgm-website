import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { quickTo } = vi.hoisted(() => ({ quickTo: vi.fn() }));

vi.mock("gsap", () => ({ default: { quickTo } }));

import { setupParallax } from "./parallax";

type Handler = (event?: unknown) => void;

function fakeTarget() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    addEventListener: vi.fn((type: string, handler: Handler) => void handlers.set(type, handler)),
    removeEventListener: vi.fn((type: string) => void handlers.delete(type)),
  };
}

type Setter = ReturnType<typeof vi.fn> & { tween: { kill: ReturnType<typeof vi.fn> } };
let setters: Setter[];

function el(depth?: string) {
  return { dataset: depth === undefined ? {} : { depth } } as unknown as HTMLElement;
}

function rootWith(elements: HTMLElement[]) {
  return { querySelectorAll: vi.fn(() => elements) } as unknown as HTMLElement;
}

let win: ReturnType<typeof fakeTarget> & {
  matchMedia: ReturnType<typeof vi.fn>;
  innerWidth: number;
  innerHeight: number;
};
let root: ReturnType<typeof fakeTarget>;

beforeEach(() => {
  setters = [];
  quickTo.mockReset();
  quickTo.mockImplementation(() => {
    const setter = Object.assign(vi.fn(), { tween: { kill: vi.fn() } }) as Setter;
    setters.push(setter);
    return setter;
  });
  win = Object.assign(fakeTarget(), {
    matchMedia: vi.fn(() => ({ matches: true })),
    innerWidth: 1000,
    innerHeight: 800,
  });
  root = fakeTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { documentElement: root });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setupParallax", () => {
  it("does nothing without a fine pointer", () => {
    win.matchMedia.mockReturnValue({ matches: false });

    const cleanup = setupParallax(rootWith([el()]));

    expect(quickTo).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it("does nothing when there is no parallax element", () => {
    setupParallax(rootWith([]));

    expect(quickTo).not.toHaveBeenCalled();
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it("moves each element by the pointer offset from the centre, scaled by its depth", () => {
    setupParallax(rootWith([el("2"), el()]));
    // x and y setters per element, in order
    const [x0, y0, x1, y1] = setters;

    win.handlers.get("mousemove")?.({ clientX: 750, clientY: 200 });

    expect(x0).toHaveBeenCalledWith(0.25 * 20 * 2);
    expect(y0).toHaveBeenCalledWith(-0.25 * 14 * 2);
    expect(x1).toHaveBeenCalledWith(0.25 * 20);
    expect(y1).toHaveBeenCalledWith(-0.25 * 14);
  });

  it("uses the strengths and the duration it is given", () => {
    setupParallax(rootWith([el()]), { duration: 2, xStrength: 100, yStrength: 50 });
    const [x, y] = setters;

    win.handlers.get("mousemove")?.({ clientX: 1000, clientY: 800 });

    expect(x).toHaveBeenCalledWith(50);
    expect(y).toHaveBeenCalledWith(25);
    expect(quickTo.mock.calls[0][2]).toMatchObject({ duration: 2 });
  });

  it("returns the elements to rest when the pointer leaves", () => {
    setupParallax(rootWith([el()]));
    const [x, y] = setters;

    root.handlers.get("mouseleave")?.();

    expect(x).toHaveBeenCalledWith(0);
    expect(y).toHaveBeenCalledWith(0);
  });

  it("removes its listeners and kills its tweens on cleanup", () => {
    const cleanup = setupParallax(rootWith([el(), el()]));

    cleanup();

    expect(win.handlers.has("mousemove")).toBe(false);
    expect(root.handlers.has("mouseleave")).toBe(false);
    for (const setter of setters) expect(setter.tween.kill).toHaveBeenCalledTimes(1);
  });
});
