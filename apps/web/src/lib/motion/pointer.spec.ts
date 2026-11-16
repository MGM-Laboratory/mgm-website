import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event?: unknown) => void;

function fakeTarget() {
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
    fire(type: string, event?: unknown) {
      for (const handler of [...(handlers.get(type) ?? [])]) handler(event);
    },
    count() {
      return [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

let win: ReturnType<typeof fakeTarget> & { matchMedia: ReturnType<typeof vi.fn> };
let root: ReturnType<typeof fakeTarget>;
let now = 0;

const move = (x: number, y: number, timeStamp: number, pointerType = "mouse") => ({
  clientX: x,
  clientY: y,
  timeStamp,
  pointerType,
});

async function load() {
  vi.resetModules();
  return import("./pointer");
}

beforeEach(() => {
  now = 1000;
  win = Object.assign(fakeTarget(), { matchMedia: vi.fn(() => ({ matches: true })) });
  root = fakeTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { documentElement: root });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("pointer listeners", () => {
  it("attaches one set of listeners for all subscribers and detaches with the last", async () => {
    const { onPointer } = await load();
    const offA = onPointer(vi.fn());
    const offB = onPointer(vi.fn());

    expect(win.count()).toBe(4);
    expect(root.count()).toBe(1);

    offA();
    expect(win.count()).toBe(4);

    offB();
    expect(win.count()).toBe(0);
    expect(root.count()).toBe(0);
  });

  it("attaches again for a later subscriber", async () => {
    const { onPointer } = await load();
    onPointer(vi.fn())();
    onPointer(vi.fn());

    expect(win.count()).toBe(4);
  });
});

describe("pointer state", () => {
  it("starts at rest, outside the page", async () => {
    const { pointer } = await load();

    expect(pointer()).toMatchObject({
      x: -1,
      y: -1,
      vx: 0,
      vy: 0,
      speed: 0,
      down: false,
      type: "",
      lastMove: 0,
      inside: false,
    });
  });

  it("records position, type and the page being entered, and tells listeners with the event", async () => {
    const { onPointer, pointer } = await load();
    const listener = vi.fn();
    onPointer(listener);
    const event = move(10, 20, 1000, "pen");

    win.fire("pointermove", event);

    expect(pointer()).toMatchObject({ x: 10, y: 20, type: "pen", inside: true, lastMove: 1000 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ x: 10, y: 20 }), event);
  });

  it("smooths velocity over moves", async () => {
    const { onPointer, pointer } = await load();
    onPointer(vi.fn());

    win.fire("pointermove", move(0, 0, 1000));
    win.fire("pointermove", move(100, 0, 1100));

    // 1000 px/s measured, blended with the 0.35 factor from rest
    expect(pointer().vx).toBeCloseTo(350, 3);
    expect(pointer().vy).toBe(0);
    expect(pointer().speed).toBeCloseTo(350, 3);

    win.fire("pointermove", move(200, 0, 1200));
    expect(pointer().vx).toBeCloseTo(350 + (1000 - 350) * 0.35, 3);
  });

  it("starts from rest after a pause", async () => {
    const { onPointer, pointer } = await load();
    onPointer(vi.fn());
    win.fire("pointermove", move(0, 0, 1000));
    win.fire("pointermove", move(100, 0, 1100));

    win.fire("pointermove", move(110, 0, 1500));

    // 10 px over 400 ms is 25 px/s, 0.35 of it
    expect(pointer().vx).toBeCloseTo(25 * 0.35, 3);
  });

  it("falls back to the clock when an event has no time stamp", async () => {
    const { onPointer, pointer } = await load();
    onPointer(vi.fn());

    win.fire("pointermove", { clientX: 1, clientY: 2, timeStamp: 0, pointerType: "mouse" });

    expect(pointer().lastMove).toBe(1000);
  });

  it("decays the velocity once moves stop and reads zero when it is tiny", async () => {
    const { onPointer, pointer } = await load();
    onPointer(vi.fn());
    win.fire("pointermove", move(0, 0, 1000));
    win.fire("pointermove", move(100, 0, 1100));
    now = 1100;
    expect(pointer().speed).toBeCloseTo(350, 3);

    now = 1100 + 40 + 90;
    expect(pointer().speed).toBeCloseTo(350 * Math.exp(-1), 3);
    expect(pointer().vx).toBeCloseTo(350 * Math.exp(-1), 3);

    now = 1100 + 40 + 90 * 20;
    expect(pointer()).toMatchObject({ vx: 0, vy: 0, speed: 0 });
  });

  it("tracks a button or finger going down and up", async () => {
    const { onPointer, pointer } = await load();
    const listener = vi.fn();
    onPointer(listener);

    win.fire("pointerdown", move(5, 6, 1000, "touch"));
    expect(pointer()).toMatchObject({ down: true, x: 5, y: 6, type: "touch", inside: true });

    win.fire("pointerup", move(5, 6, 1010, "touch"));
    expect(pointer().down).toBe(false);
    win.fire("pointerdown", move(5, 6, 1020, "touch"));
    win.fire("pointercancel", move(5, 6, 1030, "touch"));
    expect(pointer().down).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("marks the pointer outside and stops its speed when it leaves the page", async () => {
    const { onPointer, pointer } = await load();
    const listener = vi.fn();
    onPointer(listener);
    win.fire("pointermove", move(0, 0, 1000));
    win.fire("pointermove", move(100, 0, 1010));

    root.fire("pointerleave");

    expect(pointer()).toMatchObject({ inside: false, vx: 0, vy: 0, speed: 0 });
    expect(listener).toHaveBeenLastCalledWith(expect.anything(), null);
  });

  it("lets a listener unsubscribe while an event is delivered", async () => {
    const { onPointer } = await load();
    const calls: string[] = [];
    const offA = onPointer(() => {
      calls.push("a");
      offA();
    });
    onPointer(() => calls.push("b"));

    win.fire("pointermove", move(1, 1, 1000));

    expect(calls).toEqual(["a", "b"]);
  });
});

describe("finePointer", () => {
  it("asks for a hovering fine pointer", async () => {
    const { finePointer } = await load();

    expect(finePointer()).toBe(true);
    expect(win.matchMedia).toHaveBeenCalledWith("(hover: hover) and (pointer: fine)");

    win.matchMedia.mockReturnValue({ matches: false });
    expect(finePointer()).toBe(false);
  });
});
