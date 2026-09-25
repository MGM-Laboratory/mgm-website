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

const START_INDEX: Record<QualityTier, number> = { high: 0, medium: 2, low: 4 };

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
  private index: number;
  private grace = GRACE_SECONDS;
  private readonly samples = new Float32Array(WINDOW);
  private count = 0;
  private good = 0;
  private done: boolean;

  constructor(
    initial: QualityTier,
    private readonly onChange: (level: QualityLevel) => void,
    options: { locked?: boolean } = {},
  ) {
    this.index = START_INDEX[initial];
    this.done = options.locked ?? false;
  }

  get level(): QualityLevel {
    return QUALITY_LADDER[this.index];
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
    for (let i = Math.floor(WINDOW * 0.1); i < Math.ceil(WINDOW * 0.9); i++) {
      sum += sorted[i];
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
    const next = Math.min(QUALITY_LADDER.length - 1, this.index + steps);
    if (next === this.index) {
      this.done = true;
      return;
    }
    this.index = next;
    this.grace = GRACE_SECONDS;
    this.onChange(this.level);
    if (this.index === QUALITY_LADDER.length - 1) this.done = true;
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
