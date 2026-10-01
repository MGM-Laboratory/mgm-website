import type { QualityTier } from "@/components/articles/world/world-api";

/**
 * Adaptive quality for the library world. The engine starts at the level
 * its device guess allows (world-host.tsx's `qualityTier()`), then watches
 * real frame times for the first seconds of visible time and steps down a
 * ladder of levels (pixel ratio first, then the tier, which thins the
 * library and the particles) while frames miss. It never steps back up in
 * a visit: a device that struggled once will struggle again, and quality
 * that climbs and falls is worse than quality that holds.
 *
 * Only visible, steady frames count: the first second after a start or a
 * change (shader warm-up, texture uploads), hidden tabs and long stalls
 * (a tab switch, a debugger) are skipped. A display that is capped at
 * 30 Hz (a phone's low-power mode) shows steady 33 ms frames: that is the
 * refresh rate, not the GPU, so it is left alone.
 */

export type QualityLevel = { tier: QualityTier; pixelRatio: number };

export const QUALITY_LADDER: readonly QualityLevel[] = [
  { tier: "high", pixelRatio: 1.75 },
  { tier: "high", pixelRatio: 1.5 },
  { tier: "medium", pixelRatio: 1.35 },
  { tier: "medium", pixelRatio: 1.15 },
  { tier: "low", pixelRatio: 1 },
  { tier: "low", pixelRatio: 0.85 },
];

/** Frames to skip after a start or a change (compiles, uploads, the lens settle). */
const GRACE_SECONDS = 1.1;
/** Frames per judgement (about 1.5 s at 60 fps). */
const WINDOW = 90;
/** Mean frame time (ms) that asks for one step down, and for two. */
const SLOW_MS = 1000 / 50;
const VERY_SLOW_MS = 1000 / 33;
/** Good windows in a row before the governor stops watching. */
const SETTLED_AFTER = 2;
/** Anything longer is a stall (tab switch, debugger), not a frame. */
const STALL_MS = 250;

export class QualityGovernor {
  private readonly ladder: readonly QualityLevel[];
  private index: number;
  private grace = GRACE_SECONDS;
  private readonly samples = new Float32Array(WINDOW);
  private count = 0;
  private good = 0;
  private done: boolean;

  constructor(
    initial: QualityTier,
    private readonly onChange: (level: QualityLevel) => void,
    options: { locked?: boolean; ladder?: readonly QualityLevel[] } = {},
  ) {
    // Another stage (the homepage story) may walk its own ladder; it starts
    // at the first level of the initial tier, as the world's does.
    this.ladder = options.ladder ?? QUALITY_LADDER;
    this.index = Math.max(
      0,
      this.ladder.findIndex((level) => level.tier === initial),
    );
    this.done = options.locked ?? false;
  }

  get level(): QualityLevel {
    return this.ladder.at(this.index) ?? QUALITY_LADDER[0];
  }

  get settled() {
    return this.done;
  }

  /** Restarts the grace period (after a resize or a route change). */
  rest() {
    this.grace = Math.max(this.grace, 0.6);
    this.count = 0;
  }

  /** One rendered frame: `ms` since the previous one. */
  sample(ms: number) {
    if (this.done) return;
    if (ms > STALL_MS || typeof document === "undefined" || document.hidden) {
      this.count = 0;
      return;
    }
    if (this.grace > 0) {
      this.grace -= ms / 1000;
      return;
    }
    this.samples[this.count] = ms;
    this.count += 1;
    if (this.count < WINDOW) return;
    this.count = 0;
    this.judge();
  }

  private judge() {
    const sorted = Array.from(this.samples).sort((a, b) => a - b);
    const low = sorted[Math.floor(WINDOW * 0.1)];
    const high = sorted[Math.floor(WINDOW * 0.9)];
    // Mean of the middle 80%: a single hitch neither saves nor dooms a window.
    let sum = 0;
    let n = 0;
    for (const value of sorted.slice(Math.floor(WINDOW * 0.1), Math.ceil(WINDOW * 0.9))) {
      sum += value;
      n += 1;
    }
    const mean = sum / n;
    const cappedRefresh = low > 30 && high < 36;
    if (mean <= SLOW_MS || cappedRefresh) {
      this.good += 1;
      if (this.good >= SETTLED_AFTER) this.done = true;
      return;
    }
    this.good = 0;
    const steps = mean > VERY_SLOW_MS ? 2 : 1;
    const next = Math.min(this.ladder.length - 1, this.index + steps);
    if (next === this.index) {
      this.done = true;
      return;
    }
    this.index = next;
    this.grace = GRACE_SECONDS;
    this.onChange(this.level);
    if (this.index === this.ladder.length - 1) this.done = true;
  }
}

/** Visible seconds after a start before the world may be judged too slow for anyone. */
const HOPELESS_GRACE_SECONDS = 2.5;
/** Frames per judgement, or fewer once they span this much time (ms): multi-second frames are judged within seconds. */
const HOPELESS_WINDOW = 24;
const HOPELESS_SPAN_MS = 3000;
const HOPELESS_MIN_FRAMES = 3;
/** Median frame time (ms) past which the world gives the visit to the DOM list (under 8 fps). */
const HOPELESS_MS = 125;
/** Longer than this is a stall (a tab switch, a debugger), not a frame. */
const HOPELESS_STALL_MS = 3000;

/**
 * The ladder's last resort. A renderer that hides what it is (WebKit reports
 * no renderer string, so a software rasteriser gets past the host's check)
 * can draw the world at a few frames a second: far below anything the
 * ladder can fix, and with frames too long for the governor, which ignores
 * anything past 250 ms as a stall. Once the median of a window of visible
 * frames is still past `HOPELESS_MS` after the start, `onHopeless` runs
 * (once): the host hands the visit to the DOM list, as it does for a lost
 * context.
 *
 * Another stage may judge by its own limit (`thresholdMs`, read at each
 * judgement): the homepage story gives up on sustained frames over 50 ms
 * once its governor has nothing lower left to try.
 */
export type HopelessOptions = {
  /** The median frame time (ms) past which the renderer is hopeless; HOPELESS_MS when unset. */
  thresholdMs?: () => number;
};

export class HopelessWatch {
  private grace = HOPELESS_GRACE_SECONDS;
  private readonly samples: number[] = [];
  private span = 0;
  private fired = false;

  constructor(
    private readonly onHopeless: () => void,
    private readonly options: HopelessOptions = {},
  ) {}

  /** Drops the frames so far and waits a moment (after a quality change, whose first frames compile). */
  rest(seconds = 1) {
    this.samples.length = 0;
    this.span = 0;
    this.grace = Math.max(this.grace, seconds);
  }

  /** One rendered frame: `ms` since the previous one. */
  sample(ms: number) {
    if (this.fired || ms <= 0 || ms > HOPELESS_STALL_MS) return;
    if (typeof document === "undefined" || document.hidden) return;
    if (this.grace > 0) {
      this.grace -= ms / 1000;
      return;
    }
    this.samples.push(ms);
    this.span += ms;
    const count = this.samples.length;
    if (count < HOPELESS_WINDOW && (this.span < HOPELESS_SPAN_MS || count < HOPELESS_MIN_FRAMES)) {
      return;
    }
    const median = [...this.samples].sort((a, b) => a - b)[count >> 1];
    this.samples.length = 0;
    this.span = 0;
    if (median > (this.options.thresholdMs?.() ?? HOPELESS_MS)) {
      this.fired = true;
      this.onHopeless();
    }
  }
}

/** Dev and support overrides: `?worldtier=low|medium|high`, `?worlddpr=1.25`. */
export function qualityOverrides(search: string) {
  const params = new URLSearchParams(search);
  const tier = params.get("worldtier");
  const dpr = Number(params.get("worlddpr"));
  return {
    tier: tier === "high" || tier === "medium" || tier === "low" ? tier : null,
    pixelRatio: Number.isFinite(dpr) && dpr >= 0.5 && dpr <= 3 ? dpr : null,
  } as { tier: QualityTier | null; pixelRatio: number | null };
}
