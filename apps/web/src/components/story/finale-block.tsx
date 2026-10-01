"use client";

import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ArrowUpRight } from "lucide-react";

import { easeSettle } from "@/components/reel/reel-math";
import { finaleSignal } from "@/components/story/finale-signal";
import { STORY_FINALE } from "@/data/story";
import { attachMagnetic } from "@/lib/motion/magnetic";
import { motionAllowed } from "@/lib/reduced-motion";
import { random } from "@/lib/random";
import { cn } from "@/lib/utils";

/**
 * "Let's work together.": the story's last words and its one action. The
 * WebGL story keeps it at the end of the section (Godette stands on its
 * letters); the storybook ends on it too.
 *
 * The words are server HTML, letter by letter (each letter in a mask, with
 * an identical clone under it for the idle roll), with the plain sentence
 * for screen readers. After hydration:
 *
 * - In the WebGL story the letters rise out of their masks when the act
 *   latches the title on (`finaleSignal`), and sink back if the visitor
 *   scrolls above it: a time-driven play or reverse, lusion's end title.
 * - In the storybook they rise once, the first time the block comes into
 *   view.
 * - Then one random letter rolls over every 2 s, a pen stroke underlines
 *   the words on hover (it skips the descenders), and the action pulls
 *   toward the pointer and throws little stars.
 *
 * Under reduced motion everything stays at rest (the storybook is the only
 * version then). Every animated element has no CSS transform of its own
 * (docs/animation-system.md gotcha #1).
 */

/** The site's ease, cubic-bezier(0.35, 0, 0, 1). */
const EASE = easeSettle;
const DESCENDERS = new Set(["g", "j", "p", "q", "y", ","]);
const PEN_COLORS = ["var(--brand-blue)", "var(--brand-red)", "var(--brand-green)"];

type Word = { text: string; chars: string[] };

function splitWords(text: string): Word[] {
  return text.split(" ").map((word) => ({ text: word, chars: Array.from(word) }));
}

const TITLE_WORDS = splitWords(STORY_FINALE.title);
const LINE_WORDS = STORY_FINALE.line.split(" ");

/** A hand-drawn stroke from x0 to x1 at y, broken around `gaps`, as an SVG path. */
function penPath(
  x0: number,
  x1: number,
  y: number,
  gaps: readonly (readonly [number, number])[],
  seed: number,
) {
  const wobble = (i: number) => Math.sin(seed * 12.9898 + i * 78.233) * 0.5;
  const parts: string[] = [];
  const spans: [number, number][] = [];
  let cursor = x0;
  for (const [a, b] of gaps) {
    if (a > cursor + 2) spans.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (x1 > cursor + 2) spans.push([cursor, x1]);
  const width = Math.max(1, x1 - x0);
  spans.forEach(([a, b], s) => {
    const steps = Math.max(2, Math.round((b - a) / 40));
    const lift = (x: number) => ((x - x0) / width) * -3 + wobble(s * 7 + x * 0.01) * 2.2;
    let d = `M${a.toFixed(1)} ${(y + lift(a)).toFixed(1)}`;
    for (let i = 1; i <= steps; i += 1) {
      const x = a + ((b - a) * i) / steps;
      const cx = a + ((b - a) * (i - 0.5)) / steps;
      const cy = y + lift(cx) + wobble(i + s * 3) * 2.6;
      d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${(y + lift(x)).toFixed(1)}`;
    }
    parts.push(d);
  });
  return parts.join(" ");
}

function useFinaleMotion(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const block = root.current;
    if (!block) return;
    const inStory = block.closest("[data-story-gl]") !== null;
    const motion = motionAllowed();
    const title = block.querySelector<HTMLElement>("[data-finale-title]");
    const rises = Array.from(block.querySelectorAll<HTMLElement>("[data-finale-rise]"));
    const rolls = Array.from(block.querySelectorAll<HTMLElement>("[data-finale-roll]"));
    const lineWords = Array.from(block.querySelectorAll<HTMLElement>("[data-finale-line-word]"));
    const actionEl = block.querySelector<HTMLElement>("[data-finale-action]");
    const pen = block.querySelector<SVGSVGElement>("[data-finale-pen]");
    const pens = pen ? Array.from(pen.querySelectorAll<SVGPathElement>("path")) : [];
    const cleanups: Array<() => void> = [];

    if (!motion || !title) {
      block.setAttribute("data-finale-ready", "");
      return () => {
        block.removeAttribute("data-finale-ready");
      };
    }

    // ---- the entrance (title letters, the line's words, the action)
    const words = Array.from(title.querySelectorAll<HTMLElement>("[data-finale-word]"));
    const tl = gsap.timeline({ paused: true, defaults: { ease: EASE } });
    words.forEach((word, w) => {
      const letters = Array.from(word.querySelectorAll<HTMLElement>("[data-finale-rise]"));
      letters.forEach((letter, i) => {
        const at = w * 0.15 + (letters.length > 1 ? (i / (letters.length - 1)) * 0.28 : 0);
        tl.fromTo(
          letter,
          { yPercent: 118, rotate: 9 },
          { yPercent: 0, rotate: 0, duration: 0.85, immediateRender: true },
          at,
        );
      });
    });
    tl.fromTo(
      lineWords,
      { yPercent: 200, rotate: 18, opacity: 0 },
      {
        yPercent: 0,
        rotate: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.035,
        immediateRender: true,
      },
      0.5,
    );
    if (actionEl) {
      tl.fromTo(
        actionEl,
        { opacity: 0, y: 26, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.9,
          ease: "back.out(1.7)",
          immediateRender: true,
        },
        0.78,
      );
    }
    // Only opacity hides the line and the action, so they stay in the accessibility tree and
    // focusable; whatever takes focus in the block finishes the entrance at once.
    let shown = false;
    // A rolled letter shows its clone (the roll element rests at -130%). Before the letters
    // rise or sink, every roll goes back to its original, so no letter rises in double.
    const settleRolls = () => {
      gsap.killTweensOf(rolls);
      gsap.set(rolls, { yPercent: 0 });
    };
    const show = (on: boolean) => {
      shown = on;
      settleRolls();
      if (on) tl.timeScale(1).play();
      else tl.timeScale(1.7).reverse();
    };
    const onFocus = () => {
      shown = true;
      tl.progress(1).pause();
    };
    block.addEventListener("focusin", onFocus);
    cleanups.push(() => {
      block.removeEventListener("focusin", onFocus);
    });

    if (inStory) {
      // The act decides: on once she has waved, off when the visitor scrolls back.
      show(finaleSignal.title);
      if (!finaleSignal.title) tl.progress(0).pause();
      cleanups.push(
        finaleSignal.subscribe(() => {
          show(finaleSignal.title);
        }),
      );
    } else {
      // The storybook: once, the first time it comes into view (already in view: at rest).
      const box = block.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) {
        tl.progress(1).pause();
        shown = true;
      } else {
        const io = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            io.disconnect();
            show(true);
          },
          { threshold: 0.3 },
        );
        io.observe(block);
        cleanups.push(() => {
          io.disconnect();
        });
      }
    }
    block.setAttribute("data-finale-ready", "");

    // ---- near the viewport (the idle roll sleeps otherwise)
    let near = false;
    const nearObserver = new IntersectionObserver(
      (entries) => {
        near = entries.some((entry) => entry.isIntersecting);
      },
      { rootMargin: "20% 0px" },
    );
    nearObserver.observe(block);
    cleanups.push(() => {
      nearObserver.disconnect();
    });

    // ---- one letter rolls over every 2 s (an identical clone rolls in from below)
    let last = -1;
    const roll = () => {
      if (near && shown && tl.progress() > 0.98 && !document.hidden && rolls.length > 0) {
        let pick = Math.floor(random() * rolls.length);
        if (pick === last) pick = (pick + 1) % rolls.length;
        last = pick;
        const el = rolls.at(pick);
        if (el) {
          gsap.fromTo(
            el,
            { yPercent: 0 },
            { yPercent: -130, duration: 1, ease: EASE, overwrite: true, immediateRender: false },
          );
        }
      }
      rollCall = gsap.delayedCall(2, roll);
    };
    let rollCall = gsap.delayedCall(2.4, roll);
    cleanups.push(() => {
      rollCall.kill();
      gsap.killTweensOf(rolls);
    });

    // ---- the pen stroke: drawn under each word on hover, skipping the descenders
    const drawPen = () => {
      if (!pen || pens.length === 0) return;
      const box = title.getBoundingClientRect();
      pen.setAttribute("viewBox", `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
      const size = Number.parseFloat(getComputedStyle(title).fontSize) || 64;
      words.forEach((word, w) => {
        const path = pens.at(w);
        if (!path) return;
        const r = word.getBoundingClientRect();
        const gaps: [number, number][] = [];
        for (const letter of word.querySelectorAll<HTMLElement>("[data-finale-char]")) {
          if (!DESCENDERS.has(letter.dataset.finaleChar ?? "")) continue;
          const lr = letter.getBoundingClientRect();
          gaps.push([lr.left - box.left - size * 0.03, lr.right - box.left + size * 0.03]);
        }
        const y = r.top - box.top + size * 0.86;
        path.setAttribute("d", penPath(r.left - box.left, r.right - box.left, y, gaps, w + 1));
        path.style.strokeWidth = `${Math.max(2, size * 0.045).toFixed(1)}px`;
      });
    };
    const strokes = () =>
      pens.map((path) => {
        const length = path.getTotalLength();
        return { path, length };
      });
    const onEnter = () => {
      finaleSignal.setHover("title");
      // the pen waits for the words to be up
      if (!shown || tl.progress() < 0.9) return;
      drawPen();
      strokes().forEach(({ path, length }, i) => {
        gsap.fromTo(
          path,
          { strokeDasharray: length, strokeDashoffset: length, opacity: 1 },
          {
            strokeDashoffset: 0,
            duration: 0.55 + length / 2400,
            delay: i * 0.12,
            ease: "power2.out",
            overwrite: true,
            immediateRender: true,
          },
        );
      });
    };
    const onLeave = () => {
      finaleSignal.setHover(null);
      strokes().forEach(({ path, length }, i) => {
        gsap.to(path, {
          strokeDashoffset: -length,
          duration: 0.4,
          delay: i * 0.05,
          ease: "power2.in",
          overwrite: true,
        });
      });
    };
    title.addEventListener("pointerenter", onEnter);
    title.addEventListener("pointerleave", onLeave);
    cleanups.push(() => {
      title.removeEventListener("pointerenter", onEnter);
      title.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(pens);
    });

    return () => {
      for (const off of cleanups.splice(0)) off();
      // leaving the page under a hovered title or action fires no pointerleave
      finaleSignal.setHover(null);
      tl.kill();
      gsap.set([...rises, ...rolls, ...lineWords, ...(actionEl ? [actionEl] : [])], {
        clearProps: "all",
      });
      block.removeAttribute("data-finale-ready");
    };
  }, [root]);
}

/** The action: a pill that pulls toward the pointer and throws a few of her stars when hovered. */
function FinaleAction() {
  const magnet = useRef<HTMLSpanElement>(null);
  const sparks = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = magnet.current;
    if (!el) return;
    return attachMagnetic(el, { radius: 120, strength: 0.3, max: 16 });
  }, []);

  const burst = () => {
    const host = sparks.current;
    if (!host || !motionAllowed()) return;
    const count = host.childElementCount;
    Array.from(host.children).forEach((star, i) => {
      const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.55 + (random() - 0.5) * 0.3;
      const reach = 34 + random() * 26;
      gsap.fromTo(
        star,
        { x: 0, y: 0, scale: 0.2, rotate: 0, autoAlpha: 1 },
        {
          x: Math.cos(angle) * reach,
          y: Math.sin(angle) * reach,
          scale: 1,
          rotate: 90 + random() * 90,
          autoAlpha: 0,
          duration: 0.8 + random() * 0.3,
          ease: "power3.out",
          overwrite: true,
          immediateRender: true,
        },
      );
    });
  };

  return (
    <span data-finale-action className="story-finale-action-wrap mt-9 inline-flex">
      <span ref={magnet} className="inline-flex">
        <Link
          href={STORY_FINALE.action.href}
          className="story-finale-action group relative inline-flex items-center gap-2 rounded-full bg-brand-blue px-7 py-3.5 text-base font-medium text-white transition-colors duration-300 hover:bg-[color-mix(in_srgb,var(--brand-blue)_84%,black)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"
          onPointerEnter={() => {
            finaleSignal.setHover("action");
            burst();
          }}
          onPointerLeave={() => {
            finaleSignal.setHover(null);
          }}
          onFocus={() => {
            finaleSignal.setHover("action");
          }}
          onBlur={() => {
            finaleSignal.setHover(null);
          }}
          onPointerDown={() => {
            finaleSignal.press();
          }}
        >
          <span ref={sparks} aria-hidden className="story-finale-sparks">
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} viewBox="-10 -10 20 20" data-tone={i % 4}>
                <path d="M0 -10 L2.2 -2.2 L10 0 L2.2 2.2 L0 10 L-2.2 2.2 L-10 0 L-2.2 -2.2 Z" />
              </svg>
            ))}
          </span>
          <span className="relative">{STORY_FINALE.action.label}</span>
          <span
            aria-hidden
            className="story-finale-arrow relative inline-flex size-4 overflow-hidden"
          >
            <ArrowUpRight className="story-finale-arrow-a size-4" />
            <ArrowUpRight className="story-finale-arrow-b absolute inset-0 size-4" />
          </span>
        </Link>
      </span>
    </span>
  );
}

export function FinaleBlock({
  headingId,
  className,
  children,
}: Readonly<{ headingId: string; className?: string; children?: ReactNode }>) {
  const root = useRef<HTMLDivElement>(null);
  useFinaleMotion(root);
  return (
    <div ref={root} className={cn("story-finale", className)}>
      {children}
      <h2
        id={headingId}
        data-finale-title
        className="story-finale-title font-display font-semibold text-foreground"
      >
        <span className="sr-only">{STORY_FINALE.title}</span>
        <span aria-hidden className="story-finale-words">
          {TITLE_WORDS.map((word, w) => (
            <Fragment key={`${word.text}-${w}`}>
              {w > 0 ? " " : null}
              <span data-finale-word className="story-finale-word">
                {word.chars.map((char, i) => (
                  <span key={`${char}-${i}`} data-finale-char={char} className="story-finale-char">
                    <span data-finale-rise className="story-finale-rise">
                      <span data-finale-roll className="story-finale-roll">
                        {char}
                        <span className="story-finale-clone">{char}</span>
                      </span>
                    </span>
                  </span>
                ))}
              </span>
            </Fragment>
          ))}
        </span>
        <svg data-finale-pen aria-hidden className="story-finale-pen" preserveAspectRatio="none">
          {TITLE_WORDS.map((word, w) => (
            <path
              key={`${word.text}-${w}`}
              fill="none"
              stroke={PEN_COLORS.at(w % PEN_COLORS.length)}
              strokeLinecap="round"
            />
          ))}
        </svg>
      </h2>
      <p className="story-finale-line mt-5 max-w-md text-base leading-relaxed text-foreground/70 sm:text-lg">
        {LINE_WORDS.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            {i > 0 ? " " : null}
            <span className="story-finale-line-mask">
              <span data-finale-line-word className="story-finale-line-word">
                {word}
              </span>
            </span>
          </Fragment>
        ))}
      </p>
      <FinaleAction />
    </div>
  );
}
