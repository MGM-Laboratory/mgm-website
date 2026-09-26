"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { X } from "lucide-react";

import {
  noteDuration,
  onLabNote,
  type LabNote,
  type LabNoteShape,
  type LabNoteTone,
} from "@/lib/lab-notes";
import { motionAllowed } from "@/lib/reduced-motion";

const subscribeNothing = () => () => {};

const TONE: Record<LabNoteTone, string> = {
  blue: "var(--brand-blue)",
  red: "var(--brand-red)",
  yellow: "var(--brand-yellow)",
  green: "var(--brand-green)",
};

function NoteShape({ shape, color }: { shape: LabNoteShape; color: string }) {
  switch (shape) {
    case "x":
      return (
        <path
          d="M6 6L18 18M18 6L6 18"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      );
    case "plus":
      return <path d="M12 4V20M4 12H20" stroke={color} strokeWidth="4" strokeLinecap="round" />;
    case "triangle":
      return <polygon points="3,3 3,21 21,21" fill={color} />;
    case "leaf":
      return <path d="M3 3C13 3 21 11 21 21C11 21 3 13 3 3Z" fill={color} />;
    case "star":
      return (
        <path
          d="M12 2A10 10 0 0 0 22 12A10 10 0 0 0 12 22A10 10 0 0 0 2 12A10 10 0 0 0 12 2Z"
          fill={color}
        />
      );
    default:
      return <circle cx="12" cy="12" r="9.5" fill={color} />;
  }
}

/**
 * Shows lab notes (lib/lab-notes.ts) one at a time in the bottom-left
 * corner: the shape pops and spins in, the words rise, a hairline counts
 * the note's time down, and hovering or focusing it holds it. Rendered into
 * document.body, since the homepage's content lives inside ScrollSmoother's
 * transformed wrapper where `position: fixed` would scroll away.
 */
export function LabNotes() {
  // Portals need the DOM: false on the server and during hydration, so the
  // server HTML carries no note (there is nothing to say before any input).
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [current, setCurrent] = useState<LabNote | null>(null);
  const queue = useRef<LabNote[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const shapeRef = useRef<SVGSVGElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const hold = useRef(false);

  useEffect(() => {
    return onLabNote((note) => {
      queue.current.push(note);
      setCurrent((showing) => showing ?? queue.current.shift() ?? null);
    });
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!current || !card) return;
    const animated = motionAllowed();
    const words = textRef.current
      ? Array.from(textRef.current.querySelectorAll(".lab-note-word"))
      : [];
    const duration = noteDuration(current) / 1000;
    const finish = () => {
      setCurrent(queue.current.shift() ?? null);
    };

    const tl = gsap.timeline({ onComplete: finish });
    if (animated) {
      tl.fromTo(
        card,
        { autoAlpha: 0, y: 24, scale: 0.92, rotate: -2 },
        { autoAlpha: 1, y: 0, scale: 1, rotate: 0, duration: 0.55, ease: "back.out(1.8)" },
      )
        .fromTo(
          shapeRef.current,
          { scale: 0, rotate: -160 },
          { scale: 1, rotate: 0, duration: 0.6, ease: "back.out(2.6)" },
          0.1,
        )
        .fromTo(
          words,
          { yPercent: 110, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.45, ease: "power3.out", stagger: 0.035 },
          0.18,
        );
    } else {
      tl.set(card, { autoAlpha: 1 });
    }
    tl.fromTo(
      barRef.current,
      { scaleX: 1 },
      { scaleX: 0, duration, ease: "none", transformOrigin: "0% 50%" },
      animated ? 0.4 : 0,
    );
    if (animated) {
      tl.to(card, { autoAlpha: 0, y: 12, scale: 0.96, duration: 0.35, ease: "power2.in" });
    } else {
      tl.set(card, { autoAlpha: 0 });
    }
    timeline.current = tl;
    if (hold.current) tl.pause();
    return () => {
      tl.kill();
      timeline.current = null;
    };
  }, [current]);

  const setHold = (value: boolean) => {
    hold.current = value;
    const tl = timeline.current;
    if (!tl) return;
    if (value) tl.pause();
    else tl.play();
  };

  if (!mounted) return null;

  const color = TONE[current?.tone ?? "blue"];
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 z-[46] max-w-[min(22rem,calc(100vw-2rem))] sm:bottom-6 sm:left-6"
    >
      {current ? (
        <div
          key={current.id + current.text}
          ref={cardRef}
          className="lab-note pointer-events-auto invisible relative flex items-start gap-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] py-3 pr-10 pl-3 text-sm leading-snug text-foreground opacity-0 shadow-[var(--shadow-2)]"
          onBlur={() => setHold(false)}
          onFocus={() => setHold(true)}
          onPointerEnter={() => setHold(true)}
          onPointerLeave={() => setHold(false)}
        >
          <svg ref={shapeRef} aria-hidden className="mt-0.5 size-5 shrink-0" viewBox="0 0 24 24">
            <NoteShape shape={current.shape ?? "circle"} color={color} />
          </svg>
          <p ref={textRef} className="font-medium">
            {current.text.split(" ").map((word, index) => (
              <span key={index} className="inline-block overflow-hidden align-bottom">
                <span className="lab-note-word inline-block">{word}</span>
                {" "}
              </span>
            ))}
          </p>
          <button
            aria-label="Dismiss note"
            className="absolute top-2 right-2 grid size-7 place-items-center rounded-full text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
            onClick={() => {
              timeline.current?.kill();
              setCurrent(queue.current.shift() ?? null);
            }}
            type="button"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
          <span
            ref={barRef}
            aria-hidden
            className="absolute bottom-0 left-0 h-[2px] w-full"
            style={{ background: color }}
          />
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
