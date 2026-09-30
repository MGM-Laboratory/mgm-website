/**
 * THE beat table of the homepage story (SPEC section 1): every beat's id,
 * its act, its scroll length in story viewport heights (vh), its hands-off
 * auto-advance speed (vh per second) and its rest. Every length and speed
 * is a starting value to tune in the browser: this file is the one place to
 * change them, and everything else (the section height, the rests, each
 * act's range) is computed from it.
 *
 * Positions: `t` is the story position in vh. `t = 0` is the story
 * section's top at the viewport top. The entrance (`c-enter`) is the
 * screen before that, `t` in [-1, 0), while the section scrolls in as
 * normal content. The laid-out beats follow from `t = 0` to `TIMELINE.end`
 * (the last beat, `f-out`, is the finale block scrolling away with the
 * footer). Types only and plain numbers: no three.js, no DOM.
 */

export type StoryActId = "cards" | "room" | "worlds" | "finale";

/**
 * How auto-advance treats a beat's edge.
 * - `none`: passes through.
 * - `hard-end`: stops at the beat's end in both directions.
 * - `backstop-start`: a backward advance stops at the beat's start; a forward one passes.
 * - `terminal`: stops at the beat's end, and nothing advances past it.
 */
export type BeatRest = "none" | "hard-end" | "backstop-start" | "terminal";

type BeatRow = Readonly<{
  id: string;
  act: StoryActId;
  vh: number;
  /** Hands-off auto-advance speed in vh/s; null where auto-advance never runs. */
  speed: number | null;
  rest: BeatRest;
}>;

/** The table, in order. `c-enter` is not laid out: it is the entrance before `t = 0`. */
const ROWS = [
  // Act 1: the deck (cards)
  { id: "c-rise", act: "cards", vh: 1.0, speed: 1.0, rest: "hard-end" },
  { id: "c-open", act: "cards", vh: 0.8, speed: 1.0, rest: "none" },
  { id: "c-spring", act: "cards", vh: 0.8, speed: 1.0, rest: "none" },
  { id: "c-snake", act: "cards", vh: 1.6, speed: 1.0, rest: "none" },
  { id: "c-fan", act: "cards", vh: 1.0, speed: 1.0, rest: "none" },
  { id: "c-draw", act: "cards", vh: 0.8, speed: 1.0, rest: "none" },
  { id: "c-turn", act: "cards", vh: 2.0, speed: 0.8, rest: "hard-end" },
  { id: "c-hold", act: "cards", vh: 0.6, speed: 1.0, rest: "none" },
  { id: "c-gather", act: "cards", vh: 1.6, speed: 1.0, rest: "none" },
  { id: "c-drop", act: "cards", vh: 1.4, speed: 0.8, rest: "none" },
  // Act 2: the table (room)
  { id: "r-land", act: "room", vh: 1.0, speed: 0.7, rest: "none" },
  { id: "r-figure", act: "room", vh: 1.2, speed: 0.7, rest: "hard-end" },
  { id: "r-break", act: "room", vh: 1.6, speed: 0.6, rest: "none" },
  { id: "r-spark", act: "room", vh: 1.4, speed: 0.6, rest: "none" },
  { id: "r-dragged", act: "room", vh: 1.6, speed: 0.6, rest: "none" },
  { id: "r-learn", act: "room", vh: 1.8, speed: 0.6, rest: "none" },
  { id: "r-tv", act: "room", vh: 1.2, speed: 0.6, rest: "none" },
  { id: "r-dive", act: "room", vh: 1.2, speed: 0.7, rest: "none" },
  // Act 3: five worlds (worlds)
  { id: "w-hole", act: "worlds", vh: 2.0, speed: 1.0, rest: "backstop-start" },
  { id: "w-1", act: "worlds", vh: 5.5, speed: 1.0, rest: "backstop-start" },
  { id: "w-1r", act: "worlds", vh: 1.0, speed: 1.0, rest: "none" },
  { id: "w-2", act: "worlds", vh: 5.5, speed: 1.0, rest: "backstop-start" },
  { id: "w-2r", act: "worlds", vh: 1.0, speed: 1.0, rest: "none" },
  { id: "w-3", act: "worlds", vh: 5.5, speed: 1.0, rest: "backstop-start" },
  { id: "w-3r", act: "worlds", vh: 1.0, speed: 1.0, rest: "none" },
  { id: "w-4", act: "worlds", vh: 5.5, speed: 1.0, rest: "backstop-start" },
  { id: "w-4r", act: "worlds", vh: 1.0, speed: 1.0, rest: "none" },
  { id: "w-5", act: "worlds", vh: 4.0, speed: 0.9, rest: "backstop-start" },
  { id: "w-loss", act: "worlds", vh: 1.2, speed: 0.7, rest: "none" },
  { id: "w-fall", act: "worlds", vh: 1.2, speed: 0.8, rest: "none" },
  // Act 4: your turn (finale)
  { id: "f-cut", act: "finale", vh: 0.2, speed: 1.0, rest: "none" },
  { id: "f-land", act: "finale", vh: 1.0, speed: 0.6, rest: "none" },
  { id: "f-stand", act: "finale", vh: 1.0, speed: 0.6, rest: "none" },
  { id: "f-wave", act: "finale", vh: 0.8, speed: 0.6, rest: "terminal" },
  { id: "f-out", act: "finale", vh: 1.0, speed: null, rest: "none" },
] as const satisfies readonly BeatRow[];

/** Every laid-out beat id, in order. */
export type BeatId = (typeof ROWS)[number]["id"];

/** A beat id, or the entrance before `t = 0`. */
export type StoryBeatId = BeatId | "c-enter";

export const ACT_ORDER: readonly StoryActId[] = ["cards", "room", "worlds", "finale"];

/** Length of the entrance (`c-enter`), the screen before `t = 0`, in vh. */
export const ENTRANCE_VH = 1;

export type LaidBeat = Readonly<{
  id: BeatId;
  act: StoryActId;
  index: number;
  start: number;
  end: number;
  vh: number;
  speed: number | null;
  rest: BeatRest;
}>;

export type ActRange = Readonly<{
  act: StoryActId;
  start: number;
  end: number;
  first: LaidBeat;
  last: LaidBeat;
}>;

/** A place where auto-advance stops. `forward` and `backward` say which travel directions it stops. */
export type RestPoint = Readonly<{
  t: number;
  beat: BeatId | null;
  forward: boolean;
  backward: boolean;
}>;

export type Timeline = Readonly<{
  beats: readonly LaidBeat[];
  /** Beat lookup by id. */
  byId: ReadonlyMap<BeatId, LaidBeat>;
  acts: ReadonlyMap<StoryActId, ActRange>;
  /** End of the last beat (`f-out`), in vh. The section's height is this many story vh. */
  end: number;
  /** Where auto-advance may run: from `t = 0` to the terminal rest. */
  advance: Readonly<{ start: number; end: number }>;
  /** Rest points in ascending `t` (the section start is a backward stop). */
  rests: readonly RestPoint[];
  /** The start of `f-cut`: where "Skip the story" lands. */
  finaleStart: number;
}>;

function layout(): Timeline {
  const beats: LaidBeat[] = [];
  let t = 0;
  ROWS.forEach((row, index) => {
    beats.push({ ...row, index, start: t, end: t + row.vh });
    t += row.vh;
  });
  // Rounding: every edge is a sum of tenths.
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const laid = beats.map((beat) => ({ ...beat, start: round(beat.start), end: round(beat.end) }));
  const byId = new Map(laid.map((beat) => [beat.id, beat] as const));
  const acts = new Map<StoryActId, ActRange>();
  for (const act of ACT_ORDER) {
    const own = laid.filter((beat) => beat.act === act);
    const first = own.at(0);
    const last = own.at(-1);
    if (!first || !last) throw new Error(`story timeline: act ${act} has no beats`);
    acts.set(act, { act, start: first.start, end: last.end, first, last });
  }
  const rests: RestPoint[] = [{ t: 0, beat: null, forward: false, backward: true }];
  let terminal = round(t);
  for (const beat of laid) {
    if (beat.rest === "hard-end") {
      rests.push({ t: beat.end, beat: beat.id, forward: true, backward: true });
    } else if (beat.rest === "backstop-start") {
      rests.push({ t: beat.start, beat: beat.id, forward: false, backward: true });
    } else if (beat.rest === "terminal") {
      rests.push({ t: beat.end, beat: beat.id, forward: true, backward: true });
      terminal = beat.end;
    }
  }
  rests.sort((a, b) => a.t - b.t);
  const finale = byId.get("f-cut");
  return {
    beats: laid,
    byId,
    acts,
    end: round(t),
    advance: { start: 0, end: terminal },
    rests,
    finaleStart: finale ? finale.start : terminal,
  };
}

export const TIMELINE: Timeline = layout();

/** The laid-out beat for `id` (every id in `BeatId` exists). */
export function beatOf(id: BeatId): LaidBeat {
  const beat = TIMELINE.byId.get(id);
  if (!beat) throw new Error(`story timeline: unknown beat ${id}`);
  return beat;
}

/** The act range for `act`. */
export function actOf(act: StoryActId): ActRange {
  const range = TIMELINE.acts.get(act);
  if (!range) throw new Error(`story timeline: unknown act ${act}`);
  return range;
}

/** The beat under `t`: `c-enter` before 0, the last beat at or after the end. */
export function beatAt(t: number): LaidBeat | null {
  if (t < 0) return null;
  const beats = TIMELINE.beats;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const beat = beats.at(mid);
    if (beat && beat.start <= t) lo = mid;
    else hi = mid - 1;
  }
  return beats.at(lo) ?? null;
}

/** The act that owns position `t` (the entrance belongs to the cards, past the end to the finale). */
export function actAt(t: number): StoryActId {
  const beat = beatAt(t);
  return beat ? beat.act : "cards";
}

/** Progress of `beat` at position `t`: 0 before it, 1 after it. */
export function beatProgress(beat: LaidBeat, t: number) {
  if (t <= beat.start) return 0;
  if (t >= beat.end) return 1;
  return (t - beat.start) / beat.vh;
}

/**
 * The next rest in `direction` from `t` (strictly ahead, beyond `epsilon`),
 * or null when nothing stops that way inside the advance range.
 */
export function nextRest(t: number, direction: 1 | -1, epsilon = 1e-3): RestPoint | null {
  const rests = TIMELINE.rests;
  if (direction > 0) {
    for (const rest of rests) {
      if (rest.forward && rest.t > t + epsilon) return rest;
    }
    return null;
  }
  for (let i = rests.length - 1; i >= 0; i -= 1) {
    const rest = rests.at(i);
    if (rest && rest.backward && rest.t < t - epsilon) return rest;
  }
  return null;
}

/** The hands-off speed at `t` in vh/s (the beat's own speed; 1 outside the table). */
export function speedAt(t: number) {
  return beatAt(t)?.speed ?? 1;
}
