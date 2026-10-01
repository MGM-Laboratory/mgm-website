import {
  HopelessWatch,
  QualityGovernor,
  type QualityLevel,
} from "@/components/articles/world/quality";
import type { StoryTier } from "@/components/story/assets/types";

/**
 * Quality for the homepage story: the device guess, a timed warm-up that
 * picks the start tier during the loading screen, the runtime governor
 * (the articles world's `QualityGovernor` walking the story's own ladder)
 * and the hopeless watch that hands the visit to the storybook. No three.js.
 *
 * The hopeless watch (SPEC 1.1, "Slow device"): any window with a median
 * over 125 ms gives up at once (the articles world's limit, frames no ladder
 * can fix), and once the governor stands on the ladder's last level, a
 * median over 50 ms does too: sustained frames that slow get the storybook.
 *
 * Pixel ratio caps by tier (SPEC section 2.2): high min(dpr, 1.75), medium
 * min(dpr, 1.4), low min(dpr, 1.15), and never more than 2560 x 1440 device
 * pixels in all. The governor steps the ratio down first, then the tier.
 */

export const STORY_LADDER: readonly QualityLevel[] = [
  { tier: "high", pixelRatio: 1.75 },
  { tier: "high", pixelRatio: 1.5 },
  { tier: "medium", pixelRatio: 1.4 },
  { tier: "medium", pixelRatio: 1.2 },
  { tier: "low", pixelRatio: 1.15 },
  { tier: "low", pixelRatio: 1 },
  { tier: "low", pixelRatio: 0.85 },
];

const MAX_PIXELS = 2560 * 1440;

/** Frame times (ms) of the warm-up that start the story one tier lower, two lower, or not at all. */
const WARM_SLOW_MS = 20;
const WARM_VERY_SLOW_MS = 33;
const WARM_HOPELESS_MS = 90;

const TIERS: readonly StoryTier[] = ["high", "medium", "low"];

/** The device's starting guess: coarse pointers and small machines start lower. */
export function guessStoryTier(): StoryTier {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const small = memory <= 4 || cores <= 4;
  if (coarse) return memory <= 3 || cores <= 4 ? "low" : "medium";
  return small ? "medium" : "high";
}

/** `?storytier=high|medium|low` (support and verification). */
export function storyTierOverride(search: string): StoryTier | null {
  const value = new URLSearchParams(search).get("storytier");
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

/** The tier `steps` below `tier` (clamped at low). */
export function lowerTier(tier: StoryTier, steps: number): StoryTier {
  const index = Math.min(TIERS.length - 1, TIERS.indexOf(tier) + Math.max(0, steps));
  return TIERS.at(index) ?? "low";
}

/** The device pixel ratio for `level` on a `width` x `height` CSS px canvas. */
export function storyPixelRatio(level: QualityLevel, width: number, height: number) {
  const device = window.devicePixelRatio || 1;
  const budget = Math.sqrt(MAX_PIXELS / Math.max(1, width * height));
  return Math.max(0.5, Math.min(device, level.pixelRatio, budget));
}

/** The first ladder level of `tier`. */
export function levelOf(tier: StoryTier): QualityLevel {
  return STORY_LADDER.find((level) => level.tier === tier) ?? { tier, pixelRatio: 1 };
}

export type WarmVerdict = Readonly<{
  /** The tier to start at, or null when the renderer is hopeless (storybook). */
  tier: StoryTier | null;
  /** Median milliseconds per warm frame. */
  frameMs: number;
}>;

/**
 * Times `render` (one full story frame that ends in a pixel read, so the
 * GPU work is inside the measurement) and judges the start tier from the
 * median: over 20 ms one tier lower, over 33 ms two, over 90 ms hopeless.
 * `frames` stays small: this runs during the loading screen or the first
 * visit, and a software rasteriser takes a second a frame.
 */
export function judgeWarmup(start: StoryTier, render: () => void, frames = 3): WarmVerdict {
  const samples: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    const begin = performance.now();
    render();
    const ms = performance.now() - begin;
    samples.push(ms);
    // One frame that slow already says enough; don't block for more.
    if (ms > WARM_HOPELESS_MS * 3) break;
  }
  samples.sort((a, b) => a - b);
  const frameMs = samples.at(samples.length >> 1) ?? 0;
  if (frameMs > WARM_HOPELESS_MS) return { tier: null, frameMs };
  const steps = frameMs > WARM_VERY_SLOW_MS ? 2 : frameMs > WARM_SLOW_MS ? 1 : 0;
  return { tier: lowerTier(start, steps), frameMs };
}

/** Sustained median frame time (ms) at the ladder's last level that hands the visit to the storybook. */
export const STORY_HOPELESS_MS = 50;

/** Whether `level` is the ladder's last: nothing lower is left to try. */
export function isLastStoryLevel(level: QualityLevel) {
  const last = STORY_LADDER.at(-1);
  return last !== undefined && level.tier === last.tier && level.pixelRatio === last.pixelRatio;
}

/** The articles world's limit, which the story keeps for every level. */
const HOPELESS_MS_ANY_LEVEL = 125;

/** The story's hopeless watch: 125 ms at any level, 50 ms once `level()` is the last one. */
export function createStoryHopelessWatch(level: () => QualityLevel, onHopeless: () => void) {
  return new HopelessWatch(onHopeless, {
    thresholdMs: () => (isLastStoryLevel(level()) ? STORY_HOPELESS_MS : HOPELESS_MS_ANY_LEVEL),
  });
}

/** The runtime governor on the story ladder, starting at `tier`. */
export function createStoryGovernor(
  tier: StoryTier,
  onChange: (level: QualityLevel) => void,
  locked = false,
) {
  return new QualityGovernor(tier, onChange, { ladder: STORY_LADDER, locked });
}

export { HopelessWatch, type QualityLevel };
