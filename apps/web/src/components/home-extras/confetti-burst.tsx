"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Physics2DPlugin } from "gsap/Physics2DPlugin";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { random, randomBetween, randomPick } from "@/lib/random";

if (typeof window !== "undefined") {
  gsap.registerPlugin(Physics2DPlugin);
}

const KINDS: PatternKind[] = [
  "fans",
  "square",
  "arcs",
  "circle",
  "leaves",
  "plus",
  "clover",
  "domes",
  "quads",
  "x",
];
const TONES: PatternTone[] = ["red", "yellow", "blue", "green"];

export type Burst = { x: number; y: number; id: number };

type Piece = { kind: PatternKind; tone: PatternTone; size: number };

/**
 * Confetti made of the lab's Bauhaus shapes: a pop of small pieces that fly
 * out of `burst` (viewport px) in physics arcs, spin, fall and fade, all in
 * under 1.5 s. Rendered into `document.body` (the homepage's content sits
 * inside ScrollSmoother's transformed wrapper, where `position: fixed`
 * would scroll away), `aria-hidden` and click-through. `onDone` runs once
 * the last piece has gone. Key it by `burst.id`.
 */
export function ConfettiBurst({
  burst,
  count = 30,
  onDone,
}: {
  burst: Burst;
  count?: number;
  onDone: () => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });

  // One set of pieces per burst: the caller keys this component by the
  // burst's id, so a new burst mounts a fresh set.
  const [pieces] = useState<Piece[]>(() =>
    Array.from({ length: count }, () => ({
      kind: randomPick(KINDS),
      tone: randomPick(TONES),
      size: Math.round(randomBetween(12, 26)),
    })),
  );

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const els = [...layer.children] as HTMLElement[];
    const tl = gsap.timeline({ onComplete: () => done.current() });
    els.forEach((el, i) => {
      // Mostly up and out, a few straight up, so it reads as a pop.
      const angle = randomBetween(-165, -15);
      const speed =
        randomBetween(520, 1050) * (0.75 + 0.25 * Math.abs(Math.sin((angle * Math.PI) / 180)));
      const life = randomBetween(1.05, 1.4);
      gsap.set(el, {
        x: burst.x,
        y: burst.y,
        xPercent: -50,
        yPercent: -50,
        scale: 0,
        rotation: randomBetween(0, 360),
      });
      tl.to(
        el,
        {
          physics2D: { velocity: speed, angle, gravity: 1700, friction: 0.02 },
          rotation: `+=${(random() < 0.5 ? -1 : 1) * randomBetween(240, 720)}`,
          duration: life,
          ease: "none",
        },
        i * 0.006,
      )
        .to(el, { scale: randomBetween(0.8, 1.15), duration: 0.22, ease: "back.out(3)" }, i * 0.006)
        .to(el, { opacity: 0, duration: 0.3, ease: "power1.in" }, i * 0.006 + life - 0.3);
    });
    return () => {
      tl.kill();
    };
  }, [burst, pieces]);

  return createPortal(
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[44] overflow-hidden"
      data-confetti=""
    >
      {pieces.map((piece, i) => (
        <div
          key={i}
          className="absolute top-0 left-0"
          style={{ width: piece.size, height: piece.size }}
        >
          <FlairShape kind={piece.kind} tone={piece.tone} className="h-full w-full" />
        </div>
      ))}
    </div>,
    document.body,
  );
}
