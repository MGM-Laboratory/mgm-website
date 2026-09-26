"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { X } from "lucide-react";

import { motionAllowed } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

import { timecode } from "./format";
import { PlayerEngine, type LetterboxBar, type PlayerUiState } from "./player-engine";
import { BURST, Bit, TONES } from "./player-shapes";
import type { PlayerUiProps } from "./session";

/** Room between two plus marks in the letterbox bars, px. */
const MARK_SPACING = 56;

/** Plus ticks on the timeline: one a minute, or tenths for very short or long videos. */
function tickTimes(duration: number) {
  if (!duration) return [];
  if (duration >= 90 && duration <= 20 * 60) {
    const out: number[] = [];
    for (let t = 60; t < duration - 5; t += 60) out.push(t);
    return out;
  }
  return Array.from({ length: 9 }, (_, i) => ((i + 1) * duration) / 10);
}

/** A word whose letters roll in when it changes (the control labels). */
function Rolling({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const node = ref.current;
    if (!node || !motionAllowed()) return;
    const tween = gsap.fromTo(
      node.children,
      { yPercent: 110, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.34, ease: "back.out(2)", stagger: 0.022 },
    );
    return () => {
      tween.kill();
    };
  }, [text]);
  return (
    <span ref={ref} aria-hidden className="inline-flex overflow-hidden py-0.5">
      {Array.from(text).map((char, index) => (
        <span key={`${text}-${index}`} className="inline-block">
          {char}
        </span>
      ))}
    </span>
  );
}

function PlayGlyph({
  playing,
  className,
  dock,
}: {
  playing: boolean;
  className?: string;
  dock?: boolean;
}) {
  return (
    <svg aria-hidden className={className} data-dock={dock ? "" : undefined} viewBox="0 0 12 12">
      {playing ? (
        <path d="M2 1.5H4.8V10.5H2ZM7.2 1.5H10V10.5H7.2Z" fill="var(--brand-blue)" />
      ) : (
        <path d="M2.5 1.2L10.6 6L2.5 10.8Z" fill="var(--brand-blue)" />
      )}
    </svg>
  );
}

function SoundGlyph({ muted, className }: { muted: boolean; className?: string }) {
  return (
    <svg aria-hidden className={className} data-dock="" viewBox="0 0 12 12">
      <path
        d="M3.5 1.5A4.5 4.5 0 0 1 3.5 10.5Z"
        fill={muted ? "none" : "var(--brand-yellow)"}
        stroke="var(--brand-yellow)"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function PlusMark() {
  return (
    <svg aria-hidden className="size-[9px]" viewBox="0 0 10 10">
      <path d="M5 1V9M1 5H9" stroke="var(--ink-2)" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

const control =
  "inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full px-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/90 outline-none transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-yellow)]";

/**
 * The full-screen reel player's markup. Everything that moves per frame is
 * driven by `PlayerEngine`; React renders the structure and the labels
 * that change a few times per visit. Always a dark stage, whatever the
 * site theme; only the accents come from the brand tokens.
 */
export function ReelPlayer({ session, onDone }: PlayerUiProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const iris = useRef<HTMLCanvasElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const soundButton = useRef<HTMLButtonElement>(null);
  const bigPlay = useRef<HTMLButtonElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const ticks = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const waitHead = useRef<HTMLDivElement>(null);
  const waitCentre = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const star = useRef<HTMLDivElement>(null);
  const bursts = useRef<HTMLDivElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const cursorRoot = useRef<HTMLDivElement>(null);
  const cursorScale = useRef<SVGGElement>(null);
  const cursorBody = useRef<SVGGElement>(null);
  const cursorFill = useRef<SVGPathElement>(null);
  const cursorOutline = useRef<SVGPathElement>(null);
  const cursorLiquid = useRef<SVGPathElement>(null);
  const cursorX = useRef<SVGGElement>(null);
  const cursorPlate = useRef<SVGCircleElement>(null);
  const cursorLabel = useRef<HTMLDivElement>(null);
  const cursorTip = useRef<HTMLDivElement>(null);
  const cursorTipText = useRef<HTMLSpanElement>(null);
  const engine = useRef<PlayerEngine | null>(null);

  const [ui, setUi] = useState<PlayerUiState>(() => ({
    playing: !session.video.paused,
    muted: session.video.muted,
    duration: Number.isFinite(session.video.duration) ? session.video.duration : 0,
    refused: false,
    error: false,
    ended: false,
    touch: false,
  }));
  const [bars, setBars] = useState<LetterboxBar[]>([]);
  const [message, setMessage] = useState("");
  const tickList = useMemo(() => tickTimes(ui.duration), [ui.duration]);

  useLayoutEffect(() => {
    const player = new PlayerEngine(
      {
        root: root.current!,
        stage: stage.current!,
        slot: slot.current!,
        iris: iris.current!,
        top: top.current!,
        controls: controls.current!,
        closeButton: closeButton.current!,
        playButton: playButton.current!,
        soundButton: soundButton.current!,
        bigPlay: bigPlay.current!,
        track: track.current!,
        bar: bar.current!,
        fill: fill.current!,
        preview: preview.current!,
        head: head.current!,
        ticks: ticks.current!,
        time: time.current!,
        waitHead: waitHead.current!,
        waitCentre: waitCentre.current!,
        ripple: ripple.current!,
        flash: flash.current!,
        star: star.current!,
        bursts: bursts.current!,
        marks: marks.current!,
        cursor: {
          root: cursorRoot.current!,
          scale: cursorScale.current!,
          body: cursorBody.current!,
          fill: cursorFill.current!,
          outline: cursorOutline.current!,
          liquid: cursorLiquid.current!,
          x: cursorX.current!,
          plate: cursorPlate.current!,
          label: cursorLabel.current!,
          tip: cursorTip.current!,
          tipText: cursorTipText.current!,
        },
      },
      session,
      { onState: setUi, onBars: setBars, announce: setMessage, onDone },
    );
    engine.current = player;
    player.start();
    return () => {
      player.destroy();
      engine.current = null;
    };
  }, [session, onDone]);

  // Labels change the controls' widths: the zones follow them.
  useLayoutEffect(() => {
    engine.current?.measure();
  }, [ui.playing, ui.muted, ui.refused, ui.duration, ui.touch, ui.error, bars]);

  const playLabel = ui.playing ? "Pause" : "Play";
  const soundLabel = ui.muted ? "Sound" : "Mute";

  return (
    <div
      ref={root}
      aria-describedby={`${uid}-keys`}
      aria-label="Company profile video"
      aria-modal="true"
      className="absolute inset-0 overflow-hidden text-white outline-none select-none data-[cursor=custom]:cursor-none data-[cursor=custom]:[&_*]:cursor-none"
      data-header-tone="ignore"
      role="dialog"
      tabIndex={-1}
    >
      <div ref={stage} className="absolute inset-0 bg-[#0e1116]">
        <div ref={slot} className="absolute inset-0" />

        <div ref={marks} aria-hidden className="pointer-events-none absolute inset-0">
          {bars.map((b) => {
            const across = b.side === "top" || b.side === "bottom";
            const length = (across ? b.width : b.height) + MARK_SPACING * 2;
            const count = Math.ceil(length / MARK_SPACING);
            return (
              <div
                key={b.side}
                className="absolute overflow-hidden"
                data-side={b.side}
                data-spacing={MARK_SPACING}
                style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
              >
                <div
                  className={cn(
                    "absolute flex",
                    across
                      ? "top-1/2 left-0 -mt-[4.5px] flex-row"
                      : "top-0 left-1/2 -ml-[4.5px] flex-col",
                  )}
                >
                  {Array.from({ length: count }, (_, i) => (
                    <span
                      key={i}
                      className="flex shrink-0 items-center justify-center"
                      style={across ? { width: MARK_SPACING } : { height: MARK_SPACING }}
                    >
                      <PlusMark />
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div
          ref={waitCentre}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 opacity-0"
        >
          <Bit kind="circle" color={TONES[0]} className="absolute top-0 left-0 size-[18px]" />
          <Bit kind="triangle" color={TONES[1]} className="absolute top-0 left-0 size-[18px]" />
          <Bit kind="plus" color={TONES[2]} className="absolute top-0 left-0 size-[18px]" />
        </div>

        <div
          ref={flash}
          aria-hidden
          className="group/flash pointer-events-none invisible absolute top-1/2 left-1/2 -mt-12 -ml-12 grid size-24 place-items-center rounded-full bg-[#0e1116]/70 opacity-0"
          data-glyph="play"
        >
          <PlayGlyph
            playing={false}
            className="hidden size-9 group-data-[glyph=play]/flash:block"
          />
          <PlayGlyph playing className="hidden size-9 group-data-[glyph=pause]/flash:block" />
        </div>

        <div
          ref={star}
          aria-hidden
          className="pointer-events-none invisible absolute top-1/2 left-1/2 -mt-14 -ml-14 size-28 opacity-0"
        >
          <Bit kind="star" color="var(--brand-yellow)" className="size-full" />
        </div>

        <button
          ref={bigPlay}
          aria-label="Play video"
          className="absolute top-1/2 left-1/2 -mt-14 -ml-14 grid size-28 place-items-center rounded-full bg-[var(--brand-yellow)] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          data-control
          hidden={!ui.refused || ui.error}
          onClick={() => engine.current?.playFromRefused()}
          type="button"
        >
          <svg aria-hidden className="ml-1.5 size-10" viewBox="0 0 12 12">
            <path d="M2.5 1.2L10.6 6L2.5 10.8Z" fill="var(--brand-blue)" />
          </svg>
        </button>

        {ui.error ? (
          <p className="absolute inset-x-6 top-1/2 -mt-4 text-center text-sm text-white/80">
            This video could not load right now. Please try again a little later.
          </p>
        ) : null}

        <div ref={bursts} aria-hidden className="pointer-events-none absolute inset-0">
          {BURST.map((bit, index) => (
            <div
              key={index}
              className="absolute top-0 left-0 opacity-0"
              style={{ width: bit.size, height: bit.size }}
            >
              <Bit kind={bit.kind} color={bit.color} className="size-full" />
            </div>
          ))}
        </div>

        <div
          ref={ripple}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 size-20 rounded-full border-[3px] opacity-0"
        />

        <div
          ref={top}
          className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-[max(1rem,4vw)] pt-[max(1rem,env(safe-area-inset-top))] opacity-0"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+3rem)] bg-linear-to-b from-[#0e1116]/60 to-transparent"
          />
          <p
            aria-hidden
            className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.16em] text-white/60 uppercase"
          >
            <Bit kind="circle" color="var(--brand-yellow)" className="size-2.5" />
            Company profile
          </p>
          <button
            ref={closeButton}
            aria-label="Close video"
            className="group/close grid size-11 shrink-0 place-items-center rounded-full bg-[var(--brand-yellow)] text-[#0e1116] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            data-control
            onClick={(event) =>
              engine.current?.requestClose(
                event.detail === 0 ? "key" : ui.touch ? "touch" : "pointer",
              )
            }
            type="button"
          >
            <X
              aria-hidden
              className="size-[18px] transition-transform duration-300 ease-out group-hover/close:rotate-90"
              strokeWidth={2.5}
            />
          </button>
        </div>

        <div
          ref={controls}
          className="absolute inset-x-0 bottom-0 px-[max(1rem,4vw)] pb-[max(1rem,4.5vh,env(safe-area-inset-bottom))] opacity-0"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[calc(100%+4rem)] bg-linear-to-t from-[#0e1116]/75 via-[#0e1116]/35 to-transparent"
          />
          <div className="flex items-center gap-3 sm:gap-6">
            <button
              ref={playButton}
              aria-keyshortcuts="k"
              aria-label={playLabel}
              className={cn(control, "min-w-[5.6rem]")}
              data-control
              onClick={(event) => engine.current?.togglePlay(event.detail === 0 ? "key" : "button")}
              type="button"
            >
              <PlayGlyph playing={ui.playing} className="size-3" />
              <Rolling text={playLabel} />
            </button>

            <div className="relative flex min-w-0 flex-1 items-center gap-6">
              <div
                ref={track}
                aria-label="Seek"
                aria-valuemax={Math.floor(ui.duration)}
                aria-valuemin={0}
                aria-valuenow={Math.floor(session.startTime)}
                className="relative h-11 min-w-0 flex-1 touch-none rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-yellow)]"
                data-control
                role="slider"
                tabIndex={0}
              >
                <div
                  ref={ticks}
                  aria-hidden
                  className="absolute inset-x-0 top-1/2 -mt-[15px] h-[9px]"
                >
                  {ui.duration
                    ? tickList.map((at) => (
                        <span
                          key={at}
                          className="absolute top-0 -ml-[4.5px] size-[9px]"
                          data-at={at}
                          style={{ left: `${(at / ui.duration) * 100}%` }}
                        >
                          <svg className="size-full" viewBox="0 0 10 10">
                            <path
                              d="M5 1.5V8.5M1.5 5H8.5"
                              stroke="rgb(255 255 255 / 0.4)"
                              strokeLinecap="round"
                              strokeWidth="1.6"
                            />
                          </svg>
                        </span>
                      ))
                    : null}
                </div>
                <div
                  ref={bar}
                  className="absolute inset-x-0 top-1/2 -mt-[2px] h-1 overflow-hidden rounded-full bg-white/20"
                >
                  <div ref={preview} className="absolute inset-0 bg-white/25 opacity-0" />
                  <div ref={fill} className="absolute inset-0 bg-[var(--brand-green)]" />
                </div>
                <div
                  ref={head}
                  className="absolute top-1/2 left-0 -mt-[6px] size-3 rounded-full bg-[var(--brand-green)] shadow-[0_0_0_3px_#0e1116]"
                />
                <div
                  ref={waitHead}
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 opacity-0"
                >
                  <Bit
                    kind="circle"
                    color={TONES[0]}
                    className="absolute top-0 left-0 size-[7px]"
                  />
                  <Bit
                    kind="triangle"
                    color={TONES[1]}
                    className="absolute top-0 left-0 size-[7px]"
                  />
                  <Bit kind="plus" color={TONES[2]} className="absolute top-0 left-0 size-[7px]" />
                </div>
              </div>
              <span
                aria-hidden
                className="pointer-events-none absolute -top-1.5 right-0 font-mono text-[11px] text-white/70 tabular-nums sm:static sm:text-[12px]"
              >
                <span ref={time}>{timecode(session.startTime)}</span>
                <span className="text-white/40"> / </span>
                {timecode(ui.duration)}
              </span>
            </div>

            <button
              ref={soundButton}
              aria-keyshortcuts="m"
              aria-label={ui.muted ? "Sound on" : "Mute"}
              className={cn(control, "min-w-[5.6rem] justify-end")}
              data-control
              onClick={() => engine.current?.toggleMute("button")}
              type="button"
            >
              <SoundGlyph muted={ui.muted} className="size-3" />
              <Rolling text={soundLabel} />
            </button>
          </div>
        </div>
      </div>

      <canvas ref={iris} aria-hidden className="pointer-events-none absolute top-0 left-0 hidden" />

      <div
        ref={cursorRoot}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 opacity-0"
      >
        <svg
          className="absolute -top-[160px] -left-[160px] size-[320px] overflow-visible"
          viewBox="-160 -160 320 320"
        >
          <defs>
            <clipPath id={`${uid}-liquid`}>
              <path ref={cursorLiquid} />
            </clipPath>
          </defs>
          <g ref={cursorScale}>
            <circle ref={cursorPlate} fill="#0e1116" fillOpacity="0.5" r="0" />
            <g ref={cursorBody}>
              <path ref={cursorFill} clipPath={`url(#${uid}-liquid)`} />
              <path ref={cursorOutline} fill="none" strokeLinejoin="round" />
            </g>
            <g ref={cursorX}>
              <path
                d="M-14 -14L14 14M14 -14L-14 14"
                fill="none"
                stroke="#0e1116"
                strokeLinecap="round"
                strokeWidth="5"
              />
            </g>
          </g>
        </svg>
        <div
          ref={cursorLabel}
          className="absolute top-0 left-0 h-6 overflow-hidden rounded-full border border-white/10 bg-[#0e1116]/80 text-[11px] leading-6 font-semibold tracking-[0.16em] text-white uppercase opacity-0"
        />
        <div
          ref={cursorTip}
          className="absolute top-0 left-0 rounded-md border border-white/10 bg-[#0e1116]/85 px-2 py-1 font-mono text-[12px] leading-none text-white tabular-nums opacity-0"
        >
          <span ref={cursorTipText} />
        </div>
      </div>

      <p className="sr-only" id={`${uid}-keys`}>
        Space or K plays and pauses. M turns the sound off and on. The left and right arrow keys
        move five seconds. Escape closes the video.
      </p>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
