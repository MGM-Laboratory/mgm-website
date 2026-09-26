"use client";

import { Fragment, useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { Vibrate } from "lucide-react";

import { cn } from "@/lib/utils";
import { hasAppAlreadyBooted } from "@/lib/app-boot";
import { motionAllowed, useMotionPreference } from "@/lib/reduced-motion";
import { isRouteCoverActive, onRouteCoverChange } from "@/lib/route-reveal";
import { SeeWorkButton } from "@/components/hero/see-work-button";

import type { Toybox, ToyNodes } from "./toybox-engine";
import { POSTER, TOYS, type Toy, type ToyId } from "./toybox-shapes";
import styles from "./toybox.module.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(SplitText);
}

const COMPACT_QUERY = "(max-width: 879px)";

function subscribeCompact(listener: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

const LINES = [
  ["Media,", "Game,"],
  ["& Mobile", "Laboratory"],
] as const;

// The call to action shows by this much visible time at the latest, however
// slowly the physics loads or runs.
const CTA_FAILSAFE_MS = 4500;
// A return whose physics takes longer than this to arrive drops the shapes in.
const LATE_MS = 350;

function posterStyle(toy: Toy) {
  const stack = POSTER.stack[toy.id];
  const wide = POSTER.wide[toy.id];
  return {
    "--ratio": toy.w / toy.h,
    "--stack-x": `${stack.x}em`,
    "--stack-y": `${stack.y}em`,
    "--stack-size": `${stack.size}em`,
    "--stack-rotate": `${stack.rotate ?? 0}deg`,
    "--wide-x": `${wide.x}em`,
    "--wide-y": `${wide.y}em`,
    "--wide-size": `${wide.size}em`,
    "--wide-rotate": `${wide.rotate ?? 0}deg`,
  } as CSSProperties;
}

function collectNodes(layer: HTMLElement) {
  const nodes = {} as Record<ToyId, ToyNodes>;
  for (const outer of layer.querySelectorAll<HTMLElement>("[data-toy]")) {
    const pick = (name: string) => outer.querySelector<HTMLElement>(`[data-toy-layer='${name}']`)!;
    nodes[outer.dataset.toy as ToyId] = {
      outer,
      lift: pick("lift"),
      squash: pick("squash"),
      rot: pick("rot"),
      art: pick("art"),
      hit: pick("hit"),
    };
  }
  return nodes;
}

/**
 * The compact hero (under 880px): "Media, Game & Mobile Laboratory" set big
 * and left-aligned, with the desktop hero's shapes as a box of toys. On a
 * fresh visit they drop in one by one, in the desktop entrance's order, and
 * pile up on the words and the floor. Then they can be tapped, dragged and
 * thrown, tipped over by tilting the phone, shaken up, or pushed around by a
 * cursor. Reduced motion, and a page without JavaScript, get the same words
 * with the shapes set beside them as a still poster.
 *
 * The words are in the server HTML and visible from the first paint (they
 * are the page's largest paint on phones). The physics loads after it.
 *
 * Mount it once inside the hero root, in place of the old compact block; it
 * owns its entrance and the `.compact-hero-cta` reveal. No props.
 */
export function CompactHero() {
  // Read during the first render, as hero.tsx does: by the time any effect
  // runs, the root layout's boot tracker has already flipped the flag.
  const returningRef = useRef<boolean | null>(null);
  if (returningRef.current === null) returningRef.current = hasAppAlreadyBooted();
  const playedRef = useRef(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLButtonElement>(null);
  const engineRef = useRef<Toybox | null>(null);

  const compact = useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
  const motionOk = useMotionPreference();

  useEffect(() => {
    const box = boxRef.current;
    const words = wordsRef.current;
    const layer = layerRef.current;
    const shakeButton = shakeRef.current;
    if (!compact || !box || !words || !layer) return;
    const cta = box.querySelector<HTMLElement>(".compact-hero-cta");

    let revealed = false;
    const revealCta = (animated: boolean) => {
      if (revealed || !cta) return;
      revealed = true;
      if (animated) {
        gsap.fromTo(
          cta,
          { opacity: 0, y: 16, scale: 0.9 },
          { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(2.2)" },
        );
      } else {
        gsap.set(cta, { opacity: 1, y: 0, scale: 1 });
      }
    };

    if (!motionAllowed()) {
      box.dataset.toybox = "static";
      revealCta(false);
      return () => {
        delete box.dataset.toybox;
      };
    }

    // When the page was last uncovered (the route curtain lifts after a
    // return), to tell whether the physics arrived late.
    let uncoveredAt = isRouteCoverActive() ? Infinity : performance.now();
    const offCover = onRouteCoverChange(() => {
      uncoveredAt = isRouteCoverActive() ? Infinity : performance.now();
    });
    const entrance = !playedRef.current && !returningRef.current && window.scrollY <= 40;
    if (!entrance) revealCta(false);

    // Counts visible time only: a tab opened in the background must not
    // reveal the call to action over an entrance nobody has seen.
    let visibleMs = 0;
    const failsafe = window.setInterval(() => {
      if (document.hidden) return;
      visibleMs += 250;
      if (visibleMs >= CTA_FAILSAFE_MS) {
        window.clearInterval(failsafe);
        revealCta(true);
      }
    }, 250);

    let cancelled = false;
    let engine: Toybox | null = null;
    let splits: SplitText[] = [];

    const fallBack = (error: unknown) => {
      console.error("The toy box could not start; showing the still arrangement.", error);
      box.dataset.toybox = "static";
      revealCta(false);
    };

    // After the first paint: the physics (and matter-js with it) is its own
    // chunk, fetched once the words are already on screen.
    const frame = requestAnimationFrame(() => {
      Promise.all([import("./toybox-engine"), document.fonts.ready])
        .then(([module]) => {
          if (cancelled) return;
          const wordEls = Array.from(words.querySelectorAll<HTMLElement>("[data-word]"));
          splits = wordEls.map((el) =>
            SplitText.create(el, { type: "chars", aria: "none", charsClass: "toybox-char" }),
          );
          // A return normally finds the physics already loaded and shows the
          // pile at rest before the page is uncovered. When it arrives late,
          // with the hero already on screen, the shapes drop in instead of
          // popping up.
          const rect = box.getBoundingClientRect();
          const onScreen = rect.bottom > 0 && rect.top < window.innerHeight;
          const late = performance.now() - uncoveredAt > LATE_MS;
          engine = module.createToybox({
            box,
            words,
            layer,
            wordEls,
            chars: splits.map((split) => split.chars as HTMLElement[]),
            nodes: collectNodes(layer),
            entrance: entrance ? "full" : late && onScreen ? "drop" : "settled",
            onReveal: () => revealCta(true),
          });
          engineRef.current = engine;
          if (entrance) playedRef.current = true;
          box.dataset.toybox = "live";
          if (shakeButton) {
            gsap.fromTo(
              shakeButton,
              { opacity: 0 },
              { opacity: 1, duration: 0.5, delay: entrance ? 2.8 : 0 },
            );
          }
        })
        .catch(fallBack);
    });

    return () => {
      cancelled = true;
      offCover();
      cancelAnimationFrame(frame);
      window.clearInterval(failsafe);
      engine?.destroy();
      engineRef.current = null;
      splits.forEach((split) => split.revert());
      if (shakeButton) gsap.killTweensOf(shakeButton);
      delete box.dataset.toybox;
    };
  }, [compact, motionOk]);

  return (
    <div ref={boxRef} className={styles.box}>
      <noscript>
        <style>{".toybox-poster{visibility:visible !important}"}</style>
      </noscript>

      <div className={styles.sky} />

      <div
        ref={wordsRef}
        aria-hidden="true"
        className={cn(
          styles.words,
          "compact-hero-words font-display font-medium tracking-tight text-foreground",
        )}
      >
        {LINES.map((line) => (
          <span key={line.join(" ")} className={styles.line}>
            {line.map((word, index) => (
              <Fragment key={word}>
                {index ? " " : null}
                <span data-word className={styles.word}>
                  {word}
                </span>
              </Fragment>
            ))}
          </span>
        ))}
        <div className={cn(styles.poster, "toybox-poster")}>
          {TOYS.map((toy) => (
            <div key={toy.id} className={styles.posterItem} style={posterStyle(toy)}>
              {toy.art()}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.cta}>
        <SeeWorkButton animationClassName="compact-hero-cta" />
        <button
          ref={shakeRef}
          type="button"
          onClick={() => engineRef.current?.shake()}
          className={cn(
            styles.shake,
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
          )}
        >
          <Vibrate aria-hidden className="size-4" strokeWidth={2.25} />
          <span className="max-[349px]:sr-only">Shake the box</span>
        </button>
      </div>

      <div ref={layerRef} aria-hidden="true" className={styles.bodies}>
        {TOYS.map((toy) => (
          <div key={toy.id} data-toy={toy.id} className={styles.body}>
            <div data-toy-layer="lift" className={styles.lift}>
              <div data-toy-layer="squash" className={styles.squash}>
                <div data-toy-layer="rot" className={styles.rot}>
                  <div data-toy-layer="art" className={styles.art}>
                    {toy.art()}
                  </div>
                  <div data-toy-layer="hit" data-hit={toy.hit} className={styles.hit} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
