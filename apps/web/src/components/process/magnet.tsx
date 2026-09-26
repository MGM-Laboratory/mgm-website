import { PROCESS_COPY, type ProcessMagnet } from "@/data/process-magnets";
import { cn } from "@/lib/utils";

import { PatternShape, toneColor, type PatternTone } from "./pattern-tile";

// The word and its tile share one size, so the tile reads as tall as the
// text beside it rather than as a bigger accent shape.
const wordType =
  "font-display font-semibold tracking-tight whitespace-nowrap text-[clamp(2.25rem,4vw_+_0.5rem,3.75rem)] leading-[1.1]";
const tileBox = "aspect-square w-[clamp(2.25rem,4vw_+_0.5rem,3.75rem)] shrink-0 rounded-md";

// Every tile's outline is its own accent colour (the one real brand colour
// it uses, whichever of bg/fg isn't the canvas tone). A canvas-background
// tile would otherwise blend straight into the board with no visible edge.
export function accentOf(step: { bg: PatternTone; fg: PatternTone }): PatternTone {
  return step.bg === "canvas" ? step.fg : step.bg;
}

/**
 * One fridge magnet: a word and its pattern tile. Every transform lives on
 * its own nested layer so no two animations ever write the same element
 * (docs/animation-system.md gotcha #1), and magnet-board.ts finds each
 * layer by its data-part:
 *
 * - the root (`.process-item`): x/y, its offset from home on the board;
 * - `pose`: the resting angle, idle slips and the little jiggles;
 * - `lift`: lift and drag tilt, written every frame by a spring (with the
 *   shadow that grows under it);
 * - `squash`: presses, clacks and landings;
 * - `flip`: the 3D turn that shows the back.
 *
 * Server HTML renders the magnet at home, straight and hidden only by
 * opacity (`reveal-hidden`), so no-JS visitors see the plain poster.
 */
export function Magnet({ step, index }: { step: ProcessMagnet; index: number }) {
  const accent = toneColor(accentOf(step));
  const backId = `process-magnet-back-${index}`;
  return (
    <div
      aria-describedby={backId}
      aria-label={`${step.word} ${PROCESS_COPY.instructions}`}
      aria-roledescription="magnet"
      className="process-item reveal-hidden relative cursor-grab touch-pan-y rounded-xl opacity-0 outline-none select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] focus-visible:outline-[3px] focus-visible:outline-offset-8 focus-visible:outline-[var(--focus)]"
      data-magnet={step.word}
      data-magnet-kind={step.kind}
      role="button"
      tabIndex={0}
    >
      <div className="relative" data-part="pose">
        <div className="relative" data-part="lift">
          {/* A blurred black copy of the magnet's silhouette, shown in
              proportion to the lift so the shadow grows as the magnet is
              pulled off the board. Its own element: a filter on the flip
              layer would flatten its 3D. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center gap-4 opacity-0 blur-[6px] sm:gap-5"
            data-part="shadow"
          >
            <span className={cn(wordType, "text-black")}>{step.word}</span>
            <span className={cn(tileBox, "bg-black")} />
          </div>
          <div className="relative" data-part="squash">
            <div className="relative [transform-style:preserve-3d]" data-part="flip">
              <div className="flex items-center gap-4 [backface-visibility:hidden] sm:gap-5">
                <span className={cn(wordType, "text-foreground")}>{step.word}</span>
                <span className="relative block shrink-0">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-md opacity-0"
                    data-part="ring"
                    style={{ border: `3px solid ${accent}` }}
                  />
                  <span
                    className={cn("process-tile block overflow-hidden", tileBox)}
                    style={{ border: `4px solid ${accent}` }}
                  >
                    <svg aria-hidden className="block h-full w-full" viewBox="0 0 100 100">
                      <rect width="100" height="100" fill={toneColor(step.bg)} />
                      <g data-part="motif">
                        <PatternShape fg={toneColor(step.fg)} kind={step.kind} />
                      </g>
                    </svg>
                  </span>
                </span>
              </div>
              {/* The back: how the lab does this step. Wider than most
                  fronts, so it floats centred over the magnet instead of
                  sizing it, and magnet-board.ts nudges it back inside the
                  board near the edges. Its static transform is safe: GSAP
                  never animates this element. */}
              <div
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 [backface-visibility:hidden]"
                data-part="back"
                style={{ transform: "translate(-50%, -50%) rotateX(180deg)" }}
              >
                <p
                  className="w-max max-w-[min(26rem,calc(100vw-3rem))] rounded-xl bg-[var(--surface)] px-4 py-3 text-[0.9375rem] leading-snug font-medium text-balance text-foreground shadow-[var(--shadow-2)] sm:max-w-none dark:bg-[#1c212a] sm:whitespace-nowrap"
                  id={backId}
                  style={{ border: `3px solid ${accent}` }}
                >
                  {step.back}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
