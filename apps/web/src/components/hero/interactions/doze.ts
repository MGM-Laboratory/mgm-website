import gsap from "gsap";

import { labNote } from "@/lib/lab-notes";
import { onIdle } from "@/lib/motion/idle";

import type { Stage } from "./stage";

/**
 * The hero dozes off when nobody does anything for a while: after 8 s the
 * idle loops slow down, the X stops between its quarter turns, the logo
 * breathes slower and every shape and letter settles a little lower. The
 * first input wakes it all with a small startled hop. After 20 s of quiet
 * the lab says so, once per visit.
 */

const DOZE_AFTER_MS = 8000;
const NOTE_AFTER_MS = 20000;

export type IdleLoops = {
  /** Every idle loop the hero runs. */
  all: gsap.core.Animation[];
  /** The X's quarter turns: `rest` s still, then a `turn` s turn, four times. */
  turns: gsap.core.Timeline | null;
  turnRest: number;
  turnDuration: number;
  /** The logo's breathing. */
  logo: gsap.core.Animation | null;
};

type Sleeper = { setDoze(amount: number): void; startle(): void };

export function startDoze(stage: Stage, loops: IdleLoops, sleepers: Sleeper[]) {
  const level = { value: 0 };
  let dozing = false;
  let fade: gsap.core.Tween | null = null;
  let stopTurns: gsap.core.Tween | null = null;
  const slowLoops = loops.all.filter((loop) => loop !== loops.turns);

  const apply = () => {
    for (const sleeper of sleepers) sleeper.setDoze(level.value);
  };

  function fallAsleep() {
    if (dozing || !stage.active()) return;
    dozing = true;
    fade?.kill();
    fade = gsap.to(level, { value: 1, duration: 2.6, ease: "sine.inOut", onUpdate: apply });
    gsap.to(slowLoops, {
      timeScale: (i: number) => (slowLoops[i] === loops.logo ? 0.3 : 0.4),
      duration: 2.6,
      ease: "sine.inOut",
      overwrite: "auto",
    });
    // The X finishes the turn it is in (if any) and stays still.
    const turns = loops.turns;
    if (turns) {
      const period = loops.turnRest + loops.turnDuration;
      const local = turns.time() % period;
      const wait =
        local < loops.turnRest ? 0 : (period - local) / Math.max(turns.timeScale(), 0.01);
      stopTurns?.kill();
      stopTurns = gsap.delayedCall(wait, () => {
        if (dozing) turns.timeScale(0);
      });
    }
  }

  function wakeUp() {
    if (!dozing) return;
    dozing = false;
    fade?.kill();
    stopTurns?.kill();
    fade = gsap.to(level, { value: 0, duration: 0.3, ease: "power2.out", onUpdate: apply });
    gsap.to(slowLoops, { timeScale: 1, duration: 0.5, ease: "power2.out", overwrite: "auto" });
    loops.turns?.timeScale(1);
    if (stage.active()) for (const sleeper of sleepers) sleeper.startle();
  }

  const offDoze = onIdle(DOZE_AFTER_MS, (idle) => (idle ? fallAsleep() : wakeUp()));
  const offNote = onIdle(NOTE_AFTER_MS, (idle) => {
    if (!idle || !stage.active()) return;
    labNote({
      id: "hero-idle",
      text: "Take your time. Everything here moves when you touch it.",
      shape: "x",
      tone: "blue",
    });
  });

  return () => {
    offDoze();
    offNote();
    fade?.kill();
    stopTurns?.kill();
    gsap.killTweensOf(slowLoops);
    for (const loop of loops.all) loop.timeScale(1);
    level.value = 0;
    apply();
  };
}
