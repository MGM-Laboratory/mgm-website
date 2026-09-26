import gsap from "gsap";

import { random, randomBetween, randomInt } from "@/lib/random";

import {
  DT,
  clamp,
  launchSpeed,
  offsetIn,
  settled,
  setter,
  spring,
  step,
  type Setter,
  type Spring,
  type SpringConfig,
  type Stage,
  type StageSystem,
} from "./stage";

/**
 * The headline's letters have mass. Near the cursor they lift, lean away
 * and gain ink on Hanken Grotesk's variable `wght` axis; a click makes one
 * jump and spin (the "i" in Media flips into its "!" again); a fast flick
 * through a word sends a ripple along it; and now and then, while nobody
 * touches them, one letter bounces or blinks.
 *
 * Two layers per letter, with separate owners: the entrance owns the
 * SplitText char (its transform and opacity) and never touches the inner
 * glyph this module wraps it in; the solver below is the only writer of the
 * glyph's transform and weight. A heavier weight is a wider glyph, so every
 * char is first locked to its rest width (in em, so a resize scales it with
 * the type and nothing needs re-measuring at a raised weight) and the glyph
 * is centred in it: no row ever changes size, and the ResizeObserver in
 * hero.tsx that rebuilds rows 2 and 3 and the arrow never fires from play.
 */

const REST_WEIGHT = 500;
// Sideways push: a fast pass leaves a small wobble behind.
const KX: SpringConfig = [170, 14];
// Lean: a little jelly.
const KR: SpringConfig = [150, 9];
// Squash and stretch: quick and bouncy.
const KS: SpringConfig = [420, 15];
// Weight: critically damped, so ink never over- or undershoots.
const KW: SpringConfig = [120, 22];
// Lift: settles quickly without a bounce.
const KL: SpringConfig = [190, 20];

/** Gravity for hops, em/s^2 of the headline's font size. */
const GRAVITY_EM = 17;
const RESTITUTION = 0.3;
/** Landings slower than this (em/s) just stop instead of bouncing. */
const MIN_BOUNCE_EM = 0.5;
/** The proximity field's radius, em. */
const FIELD_EM = 0.62;
/** A pointer faster than this (px/s) through a word ripples it. */
const FLICK_SPEED = 1400;
/** How fast a ripple runs along a word, em/s. */
const RIPPLE_EM = 16;
/**
 * The baseline sits this far below a glyph's box centre, em. Glyphs turn
 * about their centre (a spin stays on the spot), while lean and squash are
 * compensated to pivot on the baseline, so a leaning letter stays planted.
 */
const BASELINE_EM = 0.34;
/** Idle beats: one letter every 4 to 9 s. */
const BEAT_MIN = 4;
const BEAT_MAX = 9;

type Kick = { at: number; vy: number; rv: number };

type Glyph = {
  char: HTMLElement;
  glyph: HTMLElement;
  word: number;
  line: Line;
  /** The "i" in Media, whose trick is a flip into "!". */
  flipper: boolean;
  /** Rest centre in hero-local px, without the line's parallax. */
  cx: number;
  cy: number;
  /** Font size, px (every length below is px). */
  em: number;
  x: Spring;
  r: Spring;
  s: Spring;
  w: Spring;
  lift: Spring;
  /** Height above the baseline (px, negative is up) and its speed. */
  hy: number;
  hvy: number;
  /** Tween-driven extras: a full spin, the "i" flip, a blink (0 to 1). */
  spin: number;
  flip: number;
  blink: number;
  kicks: Kick[];
  trick: gsap.core.Animation | null;
  live: boolean;
  wasLive: boolean;
  lastWeight: number;
  saved: { display: string; justifyContent: string; width: string };
  put: Record<"x" | "y" | "r" | "sx" | "sy" | "rx", Setter>;
};

type Line = { el: HTMLElement | null; ox: number; oy: number };

type Word = {
  glyphs: Glyph[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  line: Line;
  cooldown: number;
};

export type LettersSystem = StageSystem & {
  /** Handles a press on a letter; returns whether it was one. */
  press(target: Element, x: number): boolean;
  /** 0 (awake) to 1 (dozing): lighter, slightly sunk letters. */
  setDoze(amount: number): void;
  /** A little startled hop across every letter. */
  startle(): void;
  /** Whether the pointer is over or right next to the headline. */
  near(): boolean;
};

const CHAR_SELECTOR = ".media-char, .game-char, .mobile-char";

/**
 * Where the segment from (x0, y0) to (x1, y1) passes through the word's
 * box: the x of the middle of the part inside it, or null when it misses
 * (Liang-Barsky clipping).
 */
function crossing(x0: number, y0: number, x1: number, y1: number, box: Word) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x0 - box.x0],
    [dx, box.x1 - x0],
    [-dy, y0 - box.y0],
    [dy, box.y1 - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return x0 + dx * ((t0 + t1) / 2);
}

/**
 * `words` lists each word's SplitText chars in reading order ("Media,",
 * "Game,", "&", "Mobile", "Laboratory"). `flipper` is the "i" in Media.
 */
export function createLetters(
  stage: Stage,
  words: HTMLElement[][],
  flipper: HTMLElement | null,
): LettersSystem {
  const { root, pointer } = stage;
  const lines = new Map<HTMLElement | null, Line>();
  const lineOf = (char: HTMLElement) => {
    const el = char.closest<HTMLElement>(".parallax-el");
    let line = lines.get(el);
    if (!line) {
      line = { el, ox: 0, oy: 0 };
      lines.set(el, line);
    }
    return line;
  };

  // ---- lock every char to its rest width, then wrap its glyph ----
  // All reads first, then all writes: one layout pass.
  const chars = words.flat();
  const reads = chars.map((char) => {
    const style = getComputedStyle(char);
    return { em: parseFloat(style.fontSize) || 16, width: parseFloat(style.width) || 0 };
  });

  const glyphs: Glyph[] = [];
  const byChar = new Map<Element, Glyph>();
  let index = 0;
  words.forEach((wordChars, word) => {
    for (const char of wordChars) {
      const { em, width } = reads[index++];
      const saved = {
        display: char.style.display,
        justifyContent: char.style.justifyContent,
        width: char.style.width,
      };
      // Full precision plus a hair: a rounded (or float-truncated) em lands
      // below the layout's 1/64 px units, which shifts the glyphs after it.
      char.style.width = `${width / em + 1e-6}em`;
      char.style.display = "inline-flex";
      char.style.justifyContent = "center";
      const glyph = document.createElement("span");
      glyph.className = "hero-glyph";
      glyph.style.display = "inline-block";
      glyph.style.whiteSpace = "pre";
      while (char.firstChild) glyph.appendChild(char.firstChild);
      char.appendChild(glyph);
      const isFlipper = char === flipper;
      // Only the "i" turns in 3D (its flip), so only it needs a perspective.
      gsap.set(glyph, { transformOrigin: "50% 50%", transformPerspective: isFlipper ? 500 : 0 });
      const g: Glyph = {
        char,
        glyph,
        word,
        line: lineOf(char),
        flipper: isFlipper,
        cx: 0,
        cy: 0,
        em,
        x: spring(),
        r: spring(),
        s: spring(),
        w: spring(REST_WEIGHT),
        lift: spring(),
        hy: 0,
        hvy: 0,
        spin: 0,
        flip: 0,
        blink: 0,
        kicks: [],
        trick: null,
        live: false,
        wasLive: false,
        lastWeight: REST_WEIGHT,
        saved,
        put: {
          x: setter(glyph, "x", "px"),
          y: setter(glyph, "y", "px"),
          r: setter(glyph, "rotation", "deg"),
          sx: setter(glyph, "scaleX"),
          sy: setter(glyph, "scaleY"),
          rx: setter(glyph, "rotationX", "deg"),
        },
      };
      glyphs.push(g);
      byChar.set(char, g);
    }
  });

  const wordList: Word[] = words.map((_, word) => {
    const members = glyphs.filter((g) => g.word === word);
    return {
      glyphs: members,
      x0: 0,
      x1: 0,
      y0: 0,
      y1: 0,
      line: members[0]?.line ?? { el: null, ox: 0, oy: 0 },
      cooldown: 0,
    };
  });

  let doze = 0;
  let alive = true;

  function measure() {
    for (const g of glyphs) {
      const { x, y } = offsetIn(g.char, root);
      g.cx = x + g.char.offsetWidth / 2;
      g.cy = y + g.char.offsetHeight * 0.55;
      g.em = parseFloat(getComputedStyle(g.char).fontSize) || g.em;
    }
    for (const word of wordList) {
      const first = word.glyphs[0];
      if (!first) continue;
      const pad = first.em * 0.12;
      word.x0 = Math.min(...word.glyphs.map((g) => g.cx - g.char.offsetWidth / 2)) - pad;
      word.x1 = Math.max(...word.glyphs.map((g) => g.cx + g.char.offsetWidth / 2)) + pad;
      word.y0 = first.cy - first.em * 0.5 - pad;
      word.y1 = first.cy + first.em * 0.4 + pad;
    }
  }

  function readLines() {
    for (const line of lines.values()) {
      line.ox = line.el ? Number(gsap.getProperty(line.el, "x")) || 0 : 0;
      line.oy = line.el ? Number(gsap.getProperty(line.el, "y")) || 0 : 0;
    }
  }

  const gravity = (g: Glyph) => GRAVITY_EM * g.em;
  const hop = (g: Glyph, heightEm: number) => {
    g.hvy = Math.min(g.hvy, -launchSpeed(heightEm * g.em, gravity(g)));
  };

  function targets(g: Glyph): [x: number, r: number, lift: number, w: number] {
    let tx = 0;
    let tr = 0;
    let tl = 0;
    let tw = REST_WEIGHT;
    if (pointer.over) {
      // Gaussian falloff around the cursor (vertical distance slightly
      // flattened), so two or three letters react at once. Push and lean
      // scale with the sideways offset, so they pass smoothly through zero
      // as the cursor crosses a letter.
      const R = FIELD_EM * g.em;
      const dx = g.cx + g.line.ox - pointer.x;
      const dy = (g.cy + g.line.oy - pointer.y) * 0.75;
      const f = Math.exp(-(dx * dx + dy * dy) / (2 * R * R));
      if (f > 0.002) {
        const side = clamp(-1, 1, dx / R);
        tx = side * 0.06 * g.em * f;
        tr = side * 7 * f;
        tl = -0.085 * g.em * f;
        tw += 210 * f;
      }
    }
    if (doze > 0) {
      // Dozing: a touch lighter and sunk, like breathing out.
      tw -= 70 * doze;
      tl += 0.018 * g.em * doze;
    }
    return [tx, tr, tl, tw];
  }

  const now = () => stage.now();

  function stepGlyph(g: Glyph) {
    const t = now();
    if (g.kicks.length) {
      g.kicks = g.kicks.filter((kick) => {
        if (kick.at > t) return true;
        g.hvy = Math.min(g.hvy, -kick.vy);
        g.r.v += kick.rv;
        return false;
      });
    }
    const [tx, tr, tl, tw] = targets(g);
    step(g.x, KX, tx);
    step(g.r, KR, tr);
    step(g.s, KS, 0);
    step(g.w, KW, tw);
    step(g.lift, KL, tl);
    if (g.hy < 0 || g.hvy !== 0) {
      g.hvy += gravity(g) * DT;
      g.hy += g.hvy * DT;
      if (g.hy > 0) {
        // Landed on the baseline.
        const impact = g.hvy / g.em;
        g.hy = 0;
        if (impact > MIN_BOUNCE_EM) {
          g.hvy = -g.hvy * RESTITUTION;
          g.s.v -= impact * 0.6;
        } else {
          g.hvy = 0;
        }
      }
    }
    const calm =
      g.hvy === 0 &&
      g.hy === 0 &&
      g.kicks.length === 0 &&
      !g.trick &&
      settled(g.x, tx, 0.02, 0.1) &&
      settled(g.r, tr, 0.02, 0.1) &&
      settled(g.s, 0, 0.0005, 0.003) &&
      settled(g.w, tw, 0.5, 0.5) &&
      settled(g.lift, tl, 0.02, 0.1);
    if (calm) {
      // Exactly on target, so a letter at rest carries no sub-pixel residue.
      g.x.x = tx;
      g.r.x = tr;
      g.s.x = 0;
      g.w.x = tw;
      g.lift.x = tl;
      g.x.v = g.r.v = g.s.v = g.w.v = g.lift.v = 0;
    }
    g.live = !calm;
    return calm;
  }

  function write() {
    for (const g of glyphs) {
      if (!g.live && !g.wasLive) continue;
      g.wasLive = g.live;
      // Airborne letters stretch a little with their speed.
      const stretch = Math.min((Math.abs(g.hvy) / g.em) * 0.025, 0.08);
      const sy = clamp(0.72, 1.25, (1 + g.s.x) * (1 + stretch));
      const blinkY = sy * (1 - 0.88 * g.blink);
      // Lean about the baseline: rotating about the centre, then moving the
      // centre so the baseline point stays put. Squash keeps it planted too.
      const d = BASELINE_EM * g.em;
      const lean = (g.r.x * Math.PI) / 180;
      g.put.x(g.x.x + d * Math.sin(lean));
      g.put.y(g.lift.x + g.hy + d * (1 - Math.cos(lean)) - (blinkY - 1) * d);
      g.put.r(g.r.x + g.spin);
      // Near area-preserving: a squashed letter spreads sideways.
      g.put.sx(1 + (1 / sy - 1) * 0.8);
      g.put.sy(blinkY);
      g.put.rx(g.flip);
      const weight = Math.round(g.w.x);
      if (weight !== g.lastWeight) {
        g.glyph.style.fontWeight = weight === REST_WEIGHT ? "" : String(weight);
        g.lastWeight = weight;
      }
    }
  }

  function rest(g: Glyph) {
    g.trick?.kill();
    g.trick = null;
    g.x = spring();
    g.r = spring();
    g.s = spring();
    g.w = spring(REST_WEIGHT);
    g.lift = spring();
    g.hy = 0;
    g.hvy = 0;
    g.spin = 0;
    g.flip = 0;
    g.blink = 0;
    g.kicks = [];
    g.live = false;
    g.wasLive = false;
  }

  function park() {
    for (const g of glyphs) rest(g);
    gsap.set(
      glyphs.map((g) => g.glyph),
      { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, rotationX: 0 },
    );
    for (const g of glyphs) {
      g.glyph.style.fontWeight = "";
      g.lastWeight = REST_WEIGHT;
    }
  }

  /** Runs a tween-driven trick with the solver held awake for its length. */
  function trick(g: Glyph, build: (tl: gsap.core.Timeline) => void) {
    g.trick?.kill();
    const release = stage.hold();
    const tl = gsap.timeline({
      onComplete: done,
      onInterrupt: done,
    });
    function done() {
      release();
      if (g.trick === tl) g.trick = null;
      g.spin = 0;
      g.flip = 0;
      g.blink = 0;
    }
    build(tl);
    g.trick = tl;
  }

  function jump(g: Glyph, dir: number) {
    if (g.flipper) {
      if (g.trick) return;
      hop(g, 0.3);
      // The entrance's trick again: a tumble into "!", a beat to read it,
      // then a few decelerating turns back into "i", like a coin settling.
      trick(g, (tl) => {
        tl.to(g, { flip: 180, duration: 0.32, ease: "back.out(1.6)" })
          .to(g, { flip: 1440, duration: 1.5, ease: "power2.out" }, "+=0.42")
          .set(g, { flip: 0 });
      });
      return;
    }
    hop(g, 0.34);
    g.s.v += 2.2;
    trick(g, (tl) => {
      tl.fromTo(g, { spin: 0 }, { spin: 360 * dir, duration: 0.66, ease: "power2.out" });
    });
    // The neighbours flinch.
    const i = glyphs.indexOf(g);
    for (const k of [-1, 1]) {
      const n = glyphs[i + k];
      if (n && n.word === g.word) {
        n.r.v += k * 70;
        n.x.v += k * 0.4 * n.em;
      }
    }
  }

  function press(target: Element, x: number) {
    const char = target.closest(CHAR_SELECTOR);
    const g = char ? byChar.get(char) : undefined;
    if (!g) return false;
    // Spin away from the side it was clicked on.
    const dir = x < g.cx + g.line.ox ? 1 : -1;
    jump(g, dir);
    stage.wake();
    return true;
  }

  function near() {
    if (!pointer.over) return false;
    return wordList.some(
      (word) =>
        pointer.x > word.x0 + word.line.ox - 40 &&
        pointer.x < word.x1 + word.line.ox + 40 &&
        pointer.y > word.y0 + word.line.oy - 40 &&
        pointer.y < word.y1 + word.line.oy + 40,
    );
  }

  // Where the pointer was on the previous frame, for flicks that cross a
  // whole word between two frames.
  let lastX = Number.NaN;
  let lastY = Number.NaN;

  function frame() {
    readLines();
    const fromX = lastX;
    const fromY = lastY;
    lastX = pointer.x;
    lastY = pointer.y;
    // A fast flick through a word: a ripple runs out from where it crossed.
    if (!pointer.over || !pointer.moved || pointer.speed < FLICK_SPEED) return;
    if (Number.isNaN(fromX)) return;
    const t = now();
    for (const word of wordList) {
      if (t < word.cooldown) continue;
      const hit = crossing(
        fromX - word.line.ox,
        fromY - word.line.oy,
        pointer.x - word.line.ox,
        pointer.y - word.line.oy,
        word,
      );
      if (hit === null) continue;
      word.cooldown = t + 0.55;
      const amp = clamp(0.6, 1.3, pointer.speed / 2600);
      const dir = Math.sign(pointer.vx) || 1;
      for (const g of word.glyphs) {
        const distance = Math.abs(g.cx - hit);
        const falloff = Math.exp(-distance / (g.em * 2.2));
        g.kicks.push({
          at: t + distance / (RIPPLE_EM * g.em),
          vy: launchSpeed(0.2 * g.em * amp * (0.5 + 0.5 * falloff), gravity(g)),
          rv: dir * 130 * amp * falloff,
        });
      }
    }
  }

  // ---- idle beats: one letter bounces or blinks now and then ----
  let beatCall: gsap.core.Tween | null = null;
  function scheduleBeat() {
    beatCall = gsap.delayedCall(randomBetween(BEAT_MIN, BEAT_MAX), beat);
  }
  function beat() {
    if (!alive) return;
    if (stage.active() && doze === 0 && !near()) {
      const g = glyphs[randomInt(0, glyphs.length - 1)];
      if (g && !g.trick && g.hy === 0) {
        if (random() < 0.55) {
          hop(g, randomBetween(0.1, 0.17));
          g.r.v += (random() < 0.5 ? -1 : 1) * randomBetween(40, 90);
        } else {
          // A blink: a quick squash shut and open again.
          trick(g, (tl) => {
            tl.to(g, { blink: 1, duration: 0.07, ease: "power2.in" })
              .to(g, { blink: 0, duration: 0.2, ease: "back.out(2)" }, "+=0.06")
              .to(g, { blink: 0.9, duration: 0.06, ease: "power2.in" }, "+=0.12")
              .to(g, { blink: 0, duration: 0.18, ease: "back.out(2)" }, "+=0.05");
          });
        }
        stage.wake();
      }
    }
    scheduleBeat();
  }
  scheduleBeat();

  return {
    measure,
    frame,
    step() {
      let calm = true;
      for (const g of glyphs) if (!stepGlyph(g)) calm = false;
      return calm;
    },
    write,
    park,
    press,
    near,
    setDoze(amount) {
      doze = amount;
      stage.wake();
    },
    startle() {
      glyphs.forEach((g, i) => {
        g.kicks.push({ at: now() + i * 0.012, vy: launchSpeed(0.07 * g.em, gravity(g)), rv: 0 });
      });
      stage.wake();
    },
    destroy() {
      alive = false;
      beatCall?.kill();
      park();
      for (const g of glyphs) {
        gsap.killTweensOf(g);
        gsap.set(g.glyph, { clearProps: "all" });
        while (g.glyph.firstChild) g.char.insertBefore(g.glyph.firstChild, g.glyph);
        g.glyph.remove();
        g.char.style.display = g.saved.display;
        g.char.style.justifyContent = g.saved.justifyContent;
        g.char.style.width = g.saved.width;
      }
    },
  };
}
