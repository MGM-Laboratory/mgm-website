import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Plays an entrance once, the first time `trigger` crosses `start`, the way
 * `fadeUpOnScroll` (lib/scroll-reveal.ts) does for plain fades, for
 * entrances that need their own choreography (the kinetic headings, the
 * footer's finale).
 *
 * Same safety rules as that helper (docs/animation-system.md gotchas #4, #10
 * and #11): a timeline-level trigger, `once: false` with the trigger killed
 * on complete, and a catch-up that jumps straight to the end state when the
 * trigger mounted already past its start (a reload mid-page, a return to a
 * page scrolled down), through ScrollTrigger's refresh event, two timers,
 * and a DOM-measured fallback that needs no ScrollTrigger bookkeeping.
 *
 * `build` adds the tweens; they should use `fromTo` so the hidden "from"
 * state renders at once. `onDone` runs once the entrance has finished or
 * was skipped to its end, never after a kill.
 */
export function playOnScroll(
  trigger: Element,
  build: (tl: gsap.core.Timeline) => void,
  {
    start = "top 85%",
    viewportShare = 0.85,
    onDone,
  }: { start?: string; viewportShare?: number; onDone?: () => void } = {},
) {
  let handled = false;
  let done = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const finish = () => {
    if (done) return;
    done = true;
    onDone?.();
  };
  const onRefresh = () => {
    catchUp();
  };
  const resolve = () => {
    if (handled) return;
    handled = true;
    timers.forEach(clearTimeout);
    ScrollTrigger.removeEventListener("refresh", onRefresh);
  };

  const tl = gsap.timeline({
    scrollTrigger: { trigger, start, once: false, onKill: () => resolve() },
  });
  build(tl);
  tl.eventCallback("onComplete", () => {
    tl.scrollTrigger?.kill();
    finish();
  });

  const jumpToEnd = () => {
    tl.progress(1);
    tl.scrollTrigger?.kill();
    finish();
  };

  function catchUp() {
    if (handled) return true;
    const st = tl.scrollTrigger;
    if (!st) {
      resolve();
      return true;
    }
    if (tl.progress() > 0) {
      resolve();
      return true;
    }
    if (!(st.progress > 0)) return false;
    jumpToEnd();
    resolve();
    return true;
  }

  timers = [250, 750].map((ms) => setTimeout(() => catchUp(), ms));
  timers.push(
    setTimeout(() => {
      if (handled || tl.progress() > 0 || !trigger.isConnected) {
        resolve();
        return;
      }
      if (trigger.getBoundingClientRect().top < window.innerHeight * viewportShare) jumpToEnd();
      resolve();
    }, 1500),
  );
  ScrollTrigger.addEventListener("refresh", onRefresh);
  catchUp();

  return {
    timeline: tl,
    kill() {
      resolve();
      tl.scrollTrigger?.kill();
      tl.kill();
    },
  };
}
