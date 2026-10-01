import { beatOf, type BeatId } from "@/components/story/engine/timeline";
import { saturate, smoothstep } from "@/components/story/engine/act";

/**
 * The table act's timing, in one place. Everything scrubbed is a pure
 * function of the story position `t` (vh). Moves that should feel physical
 * (the pendulum, the chase lag, the clips) are written in beat seconds: a
 * beat's progress times its hands-off length (`vh / speed`), the time it
 * takes when the page carries itself. So a scroll at the auto-advance speed
 * plays every clip and swing at the pace it was designed for, and any
 * other speed scrubs the same curve faster or slower.
 */

export type RoomBeat =
  "r-land" | "r-figure" | "r-break" | "r-spark" | "r-dragged" | "r-learn" | "r-tv" | "r-dive";

export const ROOM_BEATS: readonly RoomBeat[] = [
  "r-land",
  "r-figure",
  "r-break",
  "r-spark",
  "r-dragged",
  "r-learn",
  "r-tv",
  "r-dive",
];

/** Hands-off seconds of a beat (its length over its auto-advance speed). */
export function beatSeconds(id: BeatId) {
  const beat = beatOf(id);
  return beat.vh / Math.max(0.05, beat.speed ?? 1);
}

/** The story position (vh) at `p` of beat `id`. */
export function at(id: BeatId, p: number) {
  const beat = beatOf(id);
  return beat.start + beat.vh * p;
}

/**
 * Seconds since the start of `from`, counted in each beat's own hands-off
 * time, at story position `t`, up to the end of `to`.
 */
export function beatClock(t: number, from: RoomBeat, to: RoomBeat) {
  const a = ROOM_BEATS.indexOf(from);
  const b = ROOM_BEATS.indexOf(to);
  let seconds = 0;
  for (const id of ROOM_BEATS.slice(a, b + 1)) {
    const beat = beatOf(id);
    seconds += saturate((t - beat.start) / beat.vh) * beatSeconds(id);
    if (t < beat.end) break;
  }
  return seconds;
}

/** Total hands-off seconds from the start of `from` to the end of `to`. */
export function spanSeconds(from: RoomBeat, to: RoomBeat) {
  const a = ROOM_BEATS.indexOf(from);
  const b = ROOM_BEATS.indexOf(to);
  let seconds = 0;
  for (const id of ROOM_BEATS.slice(a, b + 1)) seconds += beatSeconds(id);
  return seconds;
}

/** A soft window: 0 before `a`, rising to 1 at `b`, back to 0 from `c` to `d`. */
export function bump(x: number, a: number, b: number, c: number, d: number) {
  return smoothstep(a, b, x) * (1 - smoothstep(c, d, x));
}

/** A damped oscillation that starts at 0, peaks early and dies out: an impact's ring. */
export function ring(seconds: number, frequency: number, decay: number) {
  if (seconds <= 0) return 0;
  return Math.sin(seconds * frequency * Math.PI * 2) * Math.exp(-seconds * decay);
}
