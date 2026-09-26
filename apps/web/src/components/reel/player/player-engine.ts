import gsap from "gsap";

import { labNote } from "@/lib/lab-notes";
import { finePointer } from "@/lib/motion/pointer";
import { motionAllowed } from "@/lib/reduced-motion";

import { Burst } from "./burst";
import { spokenTime, timecode } from "./format";
import { Iris, type IrisPoint } from "./iris";
import { PlayerCursor, type CursorElements, type CursorLook } from "./player-cursor";
import type { PlayerResult, PlayerSession } from "./session";
import { approach, clamp, ease, saturate } from "./springs";

export type PlayerElements = {
  root: HTMLDivElement;
  stage: HTMLDivElement;
  slot: HTMLDivElement;
  iris: HTMLCanvasElement;
  top: HTMLDivElement;
  controls: HTMLDivElement;
  closeButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  soundButton: HTMLButtonElement;
  bigPlay: HTMLButtonElement;
  track: HTMLDivElement;
  bar: HTMLDivElement;
  fill: HTMLDivElement;
  preview: HTMLDivElement;
  head: HTMLDivElement;
  ticks: HTMLDivElement;
  time: HTMLSpanElement;
  waitHead: HTMLDivElement;
  waitCentre: HTMLDivElement;
  ripple: HTMLDivElement;
  flash: HTMLDivElement;
  star: HTMLDivElement;
  bursts: HTMLDivElement;
  marks: HTMLDivElement;
  cursor: CursorElements;
};

export type PlayerUiState = {
  playing: boolean;
  muted: boolean;
  duration: number;
  /** The browser refused to start playback: show the big play button. */
  refused: boolean;
  error: boolean;
  ended: boolean;
  /** Whether the visitor is using touch (no custom cursor, a visible close). */
  touch: boolean;
};

export type LetterboxBar = {
  side: "top" | "bottom" | "left" | "right";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlayerCallbacks = {
  onState: (state: PlayerUiState) => void;
  onBars: (bars: LetterboxBar[]) => void;
  announce: (message: string) => void;
  onDone: (result: PlayerResult) => void;
};

type Zone = "close" | "toggle" | "seek" | "sound" | "end";
type Phase = "opening" | "open" | "ending" | "closing" | "done";
type CloseReason = "pointer" | "key" | "touch" | "end";
type Box = { x: number; y: number; width: number; height: number };

/**
 * Development only: `__reelPlayer.slowdown(6)` in the console plays every
 * transition six times slower, to inspect it frame by frame.
 */
let slowdown = 1;
function installDevHooks() {
  if (process.env.NODE_ENV !== "development") return;
  (window as unknown as { __reelPlayer?: object }).__reelPlayer = {
    slowdown(factor: number) {
      slowdown = Math.max(1, factor);
      gsap.globalTimeline.timeScale(1 / slowdown);
    },
  };
}

/** Seconds of stillness before the controls and cursor step aside. */
const IDLE_SECONDS = 2.5;
/** Seconds the end celebration holds before the player closes itself. */
const ENDING_SECONDS = 1.6;
/** Input this soon after opening belongs to the gesture that opened it. */
const OPEN_GUARD_MS = 250;
/** Watching at least this share of the video earns the thank-you note. */
const WATCHED_SHARE = 0.8;

function inside(box: Box | null, x: number, y: number, pad = 0) {
  return (
    !!box &&
    x >= box.x - pad &&
    x <= box.x + box.width + pad &&
    y >= box.y - pad &&
    y <= box.y + box.height + pad
  );
}

/** An element's layout box inside `stage`, ignoring every transform on the way. */
function layoutBox(el: HTMLElement, stage: HTMLElement): Box | null {
  if (el.hidden || !el.offsetParent) return null;
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stage) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

function centre(box: Box | null) {
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
}

/** The centre of a button's small glyph (`[data-dock]`), on the stage. */
function glyphCentre(button: HTMLElement, box: Box | null) {
  const glyph = button.querySelector("[data-dock]");
  if (!box || !glyph) return centre(box);
  // Both rects share the controls' transform, so their offset is layout only.
  const outer = button.getBoundingClientRect();
  const inner = glyph.getBoundingClientRect();
  return {
    x: box.x + inner.left - outer.left + inner.width / 2,
    y: box.y + inner.top - outer.top + inner.height / 2,
  };
}

/**
 * Everything the full-screen reel player does frame by frame: the video and
 * its controls, the cursor that says what a click will do, the iris in and
 * out, idle hiding, buffering, the letterbox marks and the end celebration.
 * The React component renders the markup; this drives it, from one GSAP
 * ticker callback that runs only while the player is up.
 */
export class PlayerEngine {
  private readonly video: HTMLVideoElement;
  private readonly iris: Iris;
  private readonly cursor: PlayerCursor;
  private readonly burst: Burst;
  private phase: Phase = "opening";
  private readonly startedAt = performance.now();
  private reduced = !motionAllowed();
  private touch: boolean;
  private stageWidth = 0;
  private stageHeight = 0;
  private boxes: {
    close: Box | null;
    play: Box | null;
    sound: Box | null;
    big: Box | null;
    track: Box | null;
    video: Box;
  } = {
    close: null,
    play: null,
    sound: null,
    big: null,
    track: null,
    video: { x: 0, y: 0, width: 0, height: 0 },
  };
  private px = -1;
  private py = -1;
  private pointerInside = false;
  private down = false;
  private downAt: {
    x: number;
    y: number;
    zone: Zone;
    onControl: boolean;
    touch: boolean;
  } | null = null;
  private zone: Zone = "close";
  /** Where the cursor docks over each button: onto the button's own glyph. */
  private docks: Record<"close" | "play" | "sound" | "big", { x: number; y: number } | null> = {
    close: null,
    play: null,
    sound: null,
    big: null,
  };
  /** The control under the pointer, if any: the cursor docks smaller over buttons. */
  private control: "close" | "play" | "sound" | "big" | null = null;
  private idle = 0;
  private controls = 0;
  private scrub: { id: number; wasPlaying: boolean; ratio: number } | null = null;
  private wantTime: number | null = null;
  private shownTime: number | null = null;
  private seekHover = 0;
  private thick = 0;
  private stall = 0;
  private buffering = 0;
  private frameless = 0;
  private waitingCentre = 0;
  private endingFor = 0;
  private finished = false;
  private watched = 0;
  private lastTime = 0;
  private lastSecond = -1;
  private lastTickTime = 0;
  private starSpin = { turn: 0 };
  private closeReason: CloseReason | null = null;
  private closeProgress = { value: 0 };
  private failsafe = 0;
  private time = 0;
  private drift = 0;
  private orbit = 0;
  private fullscreen = false;
  private ui: PlayerUiState;
  private bars: LetterboxBar[] = [];
  private readonly cleanups: (() => void)[] = [];
  private tweens: gsap.core.Animation[] = [];

  constructor(
    private readonly el: PlayerElements,
    private readonly session: PlayerSession,
    private readonly cb: PlayerCallbacks,
  ) {
    this.video = session.video;
    this.touch = !finePointer();
    this.iris = new Iris({ root: el.root, stage: el.stage, canvas: el.iris }, () => this.reduced);
    this.cursor = new PlayerCursor(el.cursor);
    this.burst = new Burst(Array.from(el.bursts.children) as HTMLElement[]);
    this.ui = {
      playing: !this.video.paused,
      muted: this.video.muted,
      duration: Number.isFinite(this.video.duration) ? this.video.duration : 0,
      refused: false,
      error: false,
      ended: false,
      touch: this.touch,
    };
    if (session.pointerAt && !session.fromKeyboard) {
      this.px = session.pointerAt.x;
      this.py = session.pointerAt.y;
      this.pointerInside = true;
    }
  }

  start() {
    installDevHooks();
    const { el, video, session } = this;
    // An atomic move into the stage: a playing video keeps playing.
    if (video.parentElement !== el.slot) el.slot.appendChild(video);
    video.style.opacity = "1";
    this.setInputMode(this.touch);
    this.measure();

    this.listen(el.root, "pointermove", this.onPointerMove);
    this.listen(el.root, "pointerdown", this.onPointerDown);
    this.listen(el.root, "pointerup", this.onPointerUp);
    this.listen(el.root, "pointercancel", this.onPointerCancel);
    this.listen(el.root, "pointerleave", this.onPointerLeave);
    this.listen(el.track, "pointerdown", this.onTrackDown);
    this.listen(el.track, "pointermove", this.onTrackMove);
    this.listen(el.track, "pointerup", this.onTrackUp);
    this.listen(el.track, "pointercancel", this.onTrackUp);
    this.listen(window, "keydown", this.onKeyDown);
    this.listen(document, "focusin", this.onFocusIn);
    this.listen(window, "resize", this.onResize);
    this.listen(window, "wheel", this.onActivity, { passive: true });
    for (const type of ["play", "pause", "volumechange", "durationchange", "loadedmetadata"]) {
      this.listen(video, type, this.onMediaState);
    }
    this.listen(video, "ended", this.onEnded);
    this.listen(video, "seeked", this.onSeeked);
    this.listen(video, "error", this.onError);
    this.listen(video, "loadedmetadata", this.onMetadata);
    const observer = new ResizeObserver(this.onResize);
    observer.observe(el.root);
    this.cleanups.push(() => observer.disconnect());

    session.playAttempt?.then(
      () => this.setUi({ playing: !video.paused, refused: false }),
      (error: unknown) => this.onPlayRefused(error),
    );
    if (!session.playAttempt) this.setUi({ refused: video.paused });
    if (video.error) this.onError();

    this.mediaSession();
    this.enterFullscreen();

    this.iris.ringColor =
      getComputedStyle(document.documentElement).getPropertyValue("--brand-yellow").trim() ||
      "#f7bf33";
    this.iris.open(this.openOrigin(), session.coveredEarly, () => {
      if (this.phase === "opening") this.phase = "open";
    });
    gsap.ticker.add(this.tick);
    this.cleanups.push(() => gsap.ticker.remove(this.tick));
    this.tick(0, 0);
    el.playButton.focus({ preventScroll: true });
  }

  destroy() {
    this.iris.kill();
    for (const tween of this.tweens) tween.kill();
    this.tweens = [];
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    window.clearTimeout(this.failsafe);
    this.cursor.destroy();
    this.burst.clear();
    this.exitFullscreen();
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        for (const action of ["play", "pause", "seekbackward", "seekforward", "seekto"] as const) {
          navigator.mediaSession.setActionHandler(action, null);
        }
      } catch {
        // Some browsers throw for actions they don't support.
      }
    }
  }

  // ---------------------------------------------------------------- actions

  togglePlay(source: "button" | "key" | "centre" | "tap" | "big") {
    if (this.phase === "closing" || this.phase === "done" || this.ui.error) return;
    const { video } = this;
    const willPlay = video.paused || video.ended;
    if (willPlay) {
      if (this.phase === "ending") this.cancelEnding();
      this.play();
    } else {
      video.pause();
    }
    this.onActivity();
    if (source === "key" || source === "tap" || source === "big")
      this.flash(willPlay ? "play" : "pause");
    if (source === "centre" || source === "button") this.rippleAt(this.cursorPoint(), "blue");
    if (source === "key") this.cb.announce(willPlay ? "Playing" : "Paused");
  }

  toggleMute(source: "button" | "key") {
    if (this.phase === "closing" || this.phase === "done") return;
    const { video } = this;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    this.onActivity();
    if (source === "button") this.rippleAt(this.cursorPoint(), "yellow");
    if (source === "key") this.cb.announce(video.muted ? "Sound off" : "Sound on");
  }

  playFromRefused() {
    this.togglePlay("big");
  }

  /** Closes the player: a pointer close lands on the cursor, anything else on the Play button. */
  requestClose(reason: CloseReason) {
    if (this.phase === "closing" || this.phase === "done") return;
    const wasEnding = this.phase === "ending";
    this.phase = "closing";
    this.closeReason = reason;
    const duration = this.duration();
    if (wasEnding && duration && this.watched >= duration * WATCHED_SHARE) {
      labNote({
        id: "reel-finished",
        text: "Thanks for watching all of it. That means a lot to us.",
        shape: "star",
        tone: "yellow",
      });
    }
    const onCursor = reason === "pointer" && this.cursorActive();
    const target: IrisPoint = onCursor
      ? { ...this.cursor.position, r: Math.max(12, this.cursor.radius) }
      : this.returnTarget();
    this.el.root.style.pointerEvents = "none";
    this.exitFullscreen();
    this.closeProgress.value = 0;
    this.tweens.push(
      gsap.to(this.closeProgress, { value: 1, duration: this.reduced ? 0.15 : 0.62, ease: "none" }),
    );
    this.iris.close(target, () => this.finish());
    // Lag smoothing on a slow machine, or a tab hidden mid-close, must never
    // leave the player (and its report) hanging: finish on the clock too.
    this.failsafe = window.setTimeout(() => this.finish(), 1800 * slowdown);
  }

  private finish() {
    if (this.phase === "done") return;
    this.phase = "done";
    window.clearTimeout(this.failsafe);
    this.cb.onDone({
      currentTime: this.video.currentTime || 0,
      finished: this.finished,
      watched: this.watched,
    });
  }

  // ------------------------------------------------------------ media state

  private play() {
    const attempt = this.video.play();
    attempt?.then(
      () => this.setUi({ refused: false }),
      (error: unknown) => this.onPlayRefused(error),
    );
  }

  private onPlayRefused(error: unknown) {
    const name = error instanceof DOMException ? error.name : "";
    // An AbortError is a play() interrupted by a pause or a new source, not a refusal.
    if (name === "AbortError") return;
    this.setUi({ refused: true, playing: false });
  }

  private onMediaState = () => {
    const { video } = this;
    const scrubbing = this.scrub;
    this.setUi({
      playing: scrubbing ? scrubbing.wasPlaying : !video.paused && !video.ended,
      muted: video.muted || video.volume === 0,
      duration: this.duration(),
      refused: !video.paused ? false : this.ui.refused,
    });
  };

  private onMetadata = () => {
    const start = this.session.startTime;
    // Safari can drop a start position set before the metadata arrived.
    if (start > 0 && Math.abs(this.video.currentTime - start) > 1) this.video.currentTime = start;
    this.lastTime = this.video.currentTime;
    this.measure();
  };

  private onEnded = () => {
    if (this.phase === "open" || this.phase === "opening") this.startEnding();
  };

  private onError = () => {
    this.setUi({ error: true, playing: false });
  };

  private onSeeked = () => {
    if (this.wantTime !== null) this.applySeek(!!this.scrub);
    else if (!this.scrub) this.shownTime = null;
    this.lastTime = this.video.currentTime;
  };

  private setUi(patch: Partial<PlayerUiState>) {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof PlayerUiState)[]) {
      if (this.ui[key] !== patch[key]) changed = true;
    }
    if (!changed) return;
    this.ui = { ...this.ui, ...patch };
    this.cb.onState(this.ui);
    if (this.ui.duration) {
      const { track } = this.el;
      track.setAttribute("aria-valuemax", String(Math.floor(this.ui.duration)));
    }
  }

  private duration() {
    const d = this.video.duration;
    return Number.isFinite(d) && d > 0 ? d : 0;
  }

  private mediaSession() {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Company profile",
        artist: "MGM Laboratory",
      });
      navigator.mediaSession.setActionHandler("play", () => this.play());
      navigator.mediaSession.setActionHandler("pause", () => this.video.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => this.seekBy(-5));
      navigator.mediaSession.setActionHandler("seekforward", () => this.seekBy(5));
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) this.seek(details.seekTime, false);
      });
    } catch {
      // Media Session is a nicety; a browser without an action is fine.
    }
  }

  // ------------------------------------------------------------------ seeks

  private seekBy(delta: number) {
    const base = this.shownTime ?? this.video.currentTime;
    this.seek(base + delta, false);
    this.cb.announce(spokenTime(clamp(base + delta, 0, this.duration())));
  }

  private seek(time: number, fast: boolean) {
    const duration = this.duration();
    if (!duration) return;
    const t = clamp(time, 0, duration);
    if (this.phase === "ending" && t < duration - 0.25) this.cancelEnding();
    this.shownTime = t;
    this.wantTime = t;
    // One seek at a time: Safari queues rapid seeks and falls behind a scrub.
    if (!this.video.seeking) this.applySeek(fast);
  }

  private applySeek(fast: boolean) {
    const t = this.wantTime;
    if (t === null) return;
    this.wantTime = null;
    const { video } = this;
    if (fast && typeof video.fastSeek === "function") video.fastSeek(t);
    else video.currentTime = t;
    this.lastTime = t;
  }

  private ratioAt(clientX: number) {
    const track = this.boxes.track;
    if (!track || !track.width) return 0;
    return saturate((clientX - track.x) / track.width);
  }

  // ------------------------------------------------------------ the ending

  private startEnding() {
    this.phase = "ending";
    this.endingFor = 0;
    this.finished = true;
    this.setUi({ ended: true, playing: false });
    const track = this.boxes.track;
    if (!this.reduced && track) {
      this.burst.fire(track.x + track.width, track.y + track.height / 2, {
        from: -172,
        to: -38,
        speed: [420, 1050],
      });
      const ticks = Array.from(this.el.ticks.children);
      this.tweens.push(
        gsap.fromTo(
          ticks,
          { scale: 1 },
          {
            scale: 1.9,
            duration: 0.16,
            ease: "power2.out",
            yoyo: true,
            repeat: 1,
            stagger: 0.04,
          },
        ),
      );
    }
    this.starSpin.turn = 0;
    this.tweens.push(
      gsap.to(this.starSpin, {
        turn: this.reduced ? 0 : 360,
        duration: 1.1,
        ease: "back.out(1.4)",
      }),
    );
    if (!this.cursorActive()) {
      const { star } = this.el;
      this.tweens.push(
        gsap.fromTo(
          star,
          { autoAlpha: 0, scale: this.reduced ? 1 : 0.2, rotate: this.reduced ? 0 : -140 },
          {
            autoAlpha: 1,
            scale: 1,
            rotate: 0,
            duration: this.reduced ? 0 : 0.7,
            ease: "back.out(2.2)",
          },
        ),
      );
    }
  }

  private cancelEnding() {
    if (this.phase !== "ending") return;
    this.phase = "open";
    this.finished = false;
    this.endingFor = 0;
    this.setUi({ ended: false });
    gsap.to(this.el.star, { autoAlpha: 0, duration: 0.2 });
  }

  // ------------------------------------------------------------------ input

  private listen(
    target: EventTarget,
    type: string,
    handler: EventListener | ((event: never) => void),
    options?: AddEventListenerOptions,
  ) {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  private onActivity = () => {
    this.idle = 0;
  };

  private setInputMode(touch: boolean) {
    this.touch = touch;
    const root = this.el.root;
    root.dataset.input = touch ? "touch" : "mouse";
    root.dataset.cursor = this.cursorActive() ? "custom" : "native";
    this.setUi({ touch });
  }

  private cursorActive() {
    return !this.touch && this.pointerInside && this.px >= 0;
  }

  private cursorPoint() {
    return this.cursorActive() ? this.cursor.position : null;
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      if (!this.touch) this.setInputMode(true);
      return;
    }
    const moved = Math.abs(event.clientX - this.px) + Math.abs(event.clientY - this.py) > 1;
    this.px = event.clientX;
    this.py = event.clientY;
    if (!this.pointerInside || this.touch) {
      this.pointerInside = true;
      this.setInputMode(false);
    }
    if (moved) this.onActivity();
  };

  private onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    this.onActivity();
    const touch = event.pointerType === "touch";
    if (touch !== this.touch) this.setInputMode(touch);
    if (!touch) {
      this.px = event.clientX;
      this.py = event.clientY;
      this.down = true;
    }
    const target = event.target as Element | null;
    this.downAt = {
      x: event.clientX,
      y: event.clientY,
      zone: this.zoneAt(event.clientX, event.clientY),
      onControl: !!target?.closest("[data-control]"),
      touch,
    };
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    this.down = false;
    const start = this.downAt;
    this.downAt = null;
    if (!start || start.onControl) return;
    if (performance.now() - this.startedAt < OPEN_GUARD_MS) return;
    if (this.phase === "closing" || this.phase === "done") return;
    if ((event.target as Element | null)?.closest("[data-control]")) return;
    // A drag isn't a click.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
    if (start.touch) {
      // Touch: a tap on the video plays or pauses and brings the controls back.
      this.togglePlay("tap");
      return;
    }
    const zone = this.zoneAt(event.clientX, event.clientY);
    if (zone !== start.zone) return;
    if (zone === "close" || zone === "end") this.requestClose("pointer");
    else if (zone === "toggle") this.togglePlay("centre");
  };

  private onPointerCancel = () => {
    this.down = false;
    this.downAt = null;
  };

  private onPointerLeave = (event: PointerEvent) => {
    // Closing turns pointer events off, which reads as the pointer leaving.
    if (event.pointerType === "touch" || this.phase === "closing") return;
    this.pointerInside = false;
    this.el.root.dataset.cursor = "native";
  };

  private onTrackDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (this.phase === "closing" || this.phase === "done" || !this.duration()) return;
    event.preventDefault();
    this.el.track.setPointerCapture(event.pointerId);
    const { video } = this;
    const wasPlaying = !video.paused && !video.ended;
    const ratio = this.ratioAt(event.clientX);
    this.scrub = { id: event.pointerId, wasPlaying, ratio };
    if (wasPlaying) video.pause();
    this.seek(ratio * this.duration(), true);
    this.onActivity();
  };

  private onTrackMove = (event: PointerEvent) => {
    const scrub = this.scrub;
    if (!scrub || scrub.id !== event.pointerId) return;
    scrub.ratio = this.ratioAt(event.clientX);
    this.seek(scrub.ratio * this.duration(), true);
    this.onActivity();
  };

  private onTrackUp = (event: PointerEvent) => {
    const scrub = this.scrub;
    if (!scrub || scrub.id !== event.pointerId) return;
    this.scrub = null;
    if (this.el.track.hasPointerCapture(event.pointerId)) {
      this.el.track.releasePointerCapture(event.pointerId);
    }
    this.seek(scrub.ratio * this.duration(), false);
    if (scrub.wasPlaying) this.play();
    this.onMediaState();
    const track = this.boxes.track;
    if (track) {
      this.rippleAt(
        { x: track.x + scrub.ratio * track.width, y: track.y + track.height / 2 },
        "red",
      );
    }
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.phase === "closing" || this.phase === "done") return;
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    this.onActivity();
    const target = event.target as HTMLElement | null;
    const inDialog = !!target && this.el.root.contains(target);
    const onButton = inDialog && target instanceof HTMLButtonElement;
    const onSlider = target === this.el.track;
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        this.requestClose("key");
        return;
      case "Tab":
        this.trapFocus(event);
        return;
      case " ":
        // A focused button answers Space itself (its click); handling it
        // here as well would toggle twice.
        if (onButton) return;
        event.preventDefault();
        this.togglePlay("key");
        return;
      case "k":
      case "K":
        event.preventDefault();
        this.togglePlay("key");
        return;
      case "m":
      case "M":
        event.preventDefault();
        this.toggleMute("key");
        return;
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        this.seekBy(event.key === "ArrowLeft" ? -5 : 5);
        return;
      case "ArrowUp":
      case "ArrowDown":
        if (!onSlider) return;
        event.preventDefault();
        this.seekBy(event.key === "ArrowDown" ? -5 : 5);
        return;
      case "PageUp":
      case "PageDown":
        if (!onSlider) return;
        event.preventDefault();
        this.seekBy(event.key === "PageDown" ? -30 : 30);
        return;
      case "Home":
        event.preventDefault();
        this.seek(0, false);
        this.cb.announce("Start");
        return;
      case "End":
        event.preventDefault();
        this.seek(this.duration(), false);
        return;
    }
  };

  private focusables() {
    return Array.from(this.el.root.querySelectorAll<HTMLElement>("button, [tabindex='0']")).filter(
      (node) => !node.hidden && node.offsetParent !== null && !node.hasAttribute("disabled"),
    );
  }

  private trapFocus(event: KeyboardEvent) {
    const items = this.focusables();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? index <= 0
        ? items.length - 1
        : index - 1
      : index === -1 || index === items.length - 1
        ? 0
        : index + 1;
    event.preventDefault();
    items[next].focus();
  }

  private onFocusIn = (event: FocusEvent) => {
    if (this.phase === "closing" || this.phase === "done") return;
    const target = event.target as Node | null;
    if (target && !this.el.root.contains(target)) this.el.playButton.focus({ preventScroll: true });
  };

  private onResize = () => {
    this.measure();
  };

  // ---------------------------------------------------------------- layout

  /** Re-reads every box the zones and the timeline depend on. */
  measure() {
    const { el } = this;
    const width = el.root.clientWidth || window.innerWidth;
    const height = el.root.clientHeight || window.innerHeight;
    this.stageWidth = width;
    this.stageHeight = height;
    this.iris.resize(width, height);
    this.cursor.setUnit(clamp(width / 1440, 0.85, 1.2));
    this.boxes.close = layoutBox(el.closeButton, el.stage);
    this.boxes.play = layoutBox(el.playButton, el.stage);
    this.boxes.sound = layoutBox(el.soundButton, el.stage);
    this.boxes.big = layoutBox(el.bigPlay, el.stage);
    this.boxes.track = layoutBox(el.track, el.stage);
    this.docks.close = centre(this.boxes.close);
    this.docks.play = glyphCentre(el.playButton, this.boxes.play);
    this.docks.sound = glyphCentre(el.soundButton, this.boxes.sound);
    const big = centre(this.boxes.big);
    this.docks.big = big && { x: big.x + 4, y: big.y };

    // The picture's box inside the stage (object-fit: contain).
    const vw = this.video.videoWidth || 16;
    const vh = this.video.videoHeight || 9;
    const aspect = vw / vh;
    let boxW = width;
    let boxH = width / aspect;
    if (boxH > height) {
      boxH = height;
      boxW = height * aspect;
    }
    const box = { x: (width - boxW) / 2, y: (height - boxH) / 2, width: boxW, height: boxH };
    this.boxes.video = box;

    // The plus marks live only in the part of each bar the controls leave free.
    const topUi = layoutBox(el.top, el.stage);
    const controlsUi = layoutBox(el.controls, el.stage);
    const freeTop = topUi ? topUi.y + topUi.height + 8 : 0;
    const freeBottom = controlsUi ? controlsUi.y - 8 : height;
    const bars: LetterboxBar[] = [];
    const MIN_BAND = 22;
    const band = (side: LetterboxBar["side"], x: number, y: number, w: number, h: number) => {
      if (w >= MIN_BAND && h >= MIN_BAND) bars.push({ side, x, y, width: w, height: h });
    };
    if (box.y >= MIN_BAND) {
      band("top", 0, freeTop, width, box.y - 6 - freeTop);
      const bottomStart = box.y + box.height + 6;
      band("bottom", 0, bottomStart, width, freeBottom - bottomStart);
    } else if (box.x >= MIN_BAND) {
      band("left", 0, freeTop, box.x, freeBottom - freeTop);
      band("right", box.x + box.width, freeTop, box.x, freeBottom - freeTop);
    }
    const key = (list: LetterboxBar[]) =>
      list
        .map(
          (b) =>
            `${b.side}${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}x${Math.round(b.height)}`,
        )
        .join();
    if (key(bars) !== key(this.bars)) {
      this.bars = bars;
      this.cb.onBars(bars);
    }
  }

  private openOrigin(): IrisPoint {
    const button = this.session.request.returnFocus;
    if (button?.isConnected) {
      const rect = button.getBoundingClientRect();
      if (rect.width && rect.height) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          r: Math.min(rect.width, rect.height) / 2,
        };
      }
    }
    const origin = this.session.request.originRect;
    if (origin && origin.width) {
      return { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2, r: 24 };
    }
    if (this.px >= 0) return { x: this.px, y: this.py, r: 24 };
    return { x: this.stageWidth / 2, y: this.stageHeight / 2, r: 24 };
  }

  /** Where a close that isn't aimed at the cursor lands: back on the Play button. */
  private returnTarget(): IrisPoint {
    const origin = this.openOrigin();
    return { ...origin, r: Math.max(8, origin.r * 0.5) };
  }

  private zoneAt(x: number, y: number): Zone {
    return this.hit(x, y).zone;
  }

  private hit(x: number, y: number): { zone: Zone; control: PlayerEngine["control"] } {
    if (this.phase === "ending") return { zone: "end", control: null };
    if (this.ui.error) return { zone: "close", control: null };
    const b = this.boxes;
    if (inside(b.close, x, y, 4)) return { zone: "close", control: "close" };
    if (inside(b.play, x, y, 2)) return { zone: "toggle", control: "play" };
    if (inside(b.sound, x, y, 2)) return { zone: "sound", control: "sound" };
    if (this.ui.refused && inside(b.big, x, y, 8)) return { zone: "toggle", control: "big" };
    if (inside(b.track, x, y, 4)) return { zone: "seek", control: null };
    return { zone: this.pictureZone(x, y), control: null };
  }

  private pictureZone(x: number, y: number): Zone {
    const b = this.boxes;
    // The generous centre of the picture plays and pauses; its edges close.
    const v = b.video;
    const rx = Math.max(110, v.width * 0.27);
    const ry = Math.max(90, v.height * 0.3);
    const dx = (x - (v.x + v.width / 2)) / rx;
    const dy = (y - (v.y + v.height / 2)) / ry;
    const reach = this.zone === "toggle" && !this.control ? 1.1 : 1;
    if (dx * dx + dy * dy <= reach * reach) return "toggle";
    return "close";
  }

  private look(): CursorLook {
    // Over a button the cursor docks: smaller, and without a word of its
    // own, since the button already says it.
    const docked = this.control === "play" || this.control === "sound" || this.control === "close";
    const base: CursorLook = {
      glyph: "disc",
      tone: "yellow",
      label: "Close",
      cross: true,
      level: 1,
      outlined: false,
      tip: null,
      rolls: false,
      spin: 0,
      speedGrowth: 1,
      size: this.control === "close" ? 0.56 : docked ? 0.58 : 1,
      plate: 0,
    };
    if (docked || this.phase === "closing") base.label = "";
    switch (this.zone) {
      case "toggle":
        return {
          ...base,
          glyph: this.ui.playing ? "pause" : "play",
          tone: "blue",
          label: base.label && (this.ui.playing ? "Pause" : "Play"),
          cross: false,
          speedGrowth: 0.35,
          plate: docked || this.control === "big" ? 0 : 31,
        };
      case "seek": {
        const duration = this.duration();
        const at = this.scrub ? this.scrub.ratio : this.ratioAt(this.px);
        return {
          ...base,
          glyph: "plus",
          tone: "red",
          // The timecode above the plus is this state's word.
          label: "",
          cross: false,
          tip: timecode(at * duration),
          rolls: true,
          speedGrowth: 0.2,
        };
      }
      case "sound":
        return {
          ...base,
          glyph: "half",
          tone: "yellow",
          label: base.label && (this.ui.muted ? "Sound" : "Mute"),
          cross: false,
          level: this.ui.muted ? 0 : 1,
          outlined: true,
          speedGrowth: 0.35,
        };
      case "end":
        return {
          ...base,
          glyph: "star",
          label: base.label && "Thanks",
          cross: false,
          spin: this.starSpin.turn,
        };
      default:
        return base;
    }
  }

  // ------------------------------------------------------------ the frame

  private tick = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs / 1000, 1 / 20) / slowdown;
    this.time += dt;
    this.reduced = !motionAllowed();
    const { el, video } = this;
    const duration = this.duration();
    const playing = !video.paused && !video.ended;

    // Watched time: natural playback only, so a seek never counts.
    const now = video.currentTime;
    if (playing && !this.scrub) {
      const step = now - this.lastTime;
      if (step > 0 && step < 0.75) this.watched += step;
    }
    this.lastTime = now;

    // Idle: the controls and the cursor step aside while the video plays.
    if (this.phase === "open" && playing && !this.scrub) this.idle += dt;
    else this.idle = 0;
    const focused =
      el.controls.contains(document.activeElement) || el.top.contains(document.activeElement);
    const keyboardFocus =
      focused && (document.activeElement as HTMLElement).matches(":focus-visible");
    const resting = this.idle > IDLE_SECONDS && !keyboardFocus;
    let controlsTarget = resting ? 0 : 1;
    // The controls wait for the iris to land, and leave first on a close.
    if (this.phase === "opening" && this.iris.busy) controlsTarget = 0;
    const leaving = this.phase === "closing" || this.phase === "done";
    if (leaving) controlsTarget = 0;
    this.controls = this.reduced
      ? approach(this.controls, controlsTarget, 6.5, dt)
      : approach(this.controls, controlsTarget, leaving ? 9 : controlsTarget ? 3.2 : 2.4, dt);
    const c = ease.cubicInOut(this.controls);
    el.controls.style.opacity = c.toFixed(3);
    el.controls.style.transform = `translate3d(0, ${((1 - c) * (this.reduced ? 0 : 14)).toFixed(2)}px, 0)`;
    el.top.style.opacity = c.toFixed(3);
    el.top.style.transform = `translate3d(0, ${(-(1 - c) * (this.reduced ? 0 : 10)).toFixed(2)}px, 0)`;
    // On touch the close button never hides: it's the only way out.
    el.closeButton.style.opacity =
      this.touch && this.phase !== "opening" && this.phase !== "closing" ? "1" : "";

    // The zone under the pointer decides what the cursor says.
    if (this.cursorActive()) {
      const hit = this.hit(this.px, this.py);
      this.zone = hit.zone;
      this.control = hit.control;
    } else if (this.phase === "ending") {
      this.zone = "end";
      this.control = null;
    }
    const inSeek = this.zone === "seek" && this.cursorActive();
    this.seekHover = approach(this.seekHover, inSeek ? 1 : 0, 8, dt);
    this.thick = approach(this.thick, inSeek || this.scrub ? 1 : 0, this.reduced ? 20 : 7, dt);

    // The timeline.
    const shown = this.scrub ? this.scrub.ratio * duration : (this.shownTime ?? now);
    const ratio = duration ? saturate(shown / duration) : 0;
    const track = this.boxes.track;
    const trackWidth = track?.width ?? 0;
    el.fill.style.transform = `translate3d(${((ratio - 1) * 100).toFixed(3)}%, 0, 0)`;
    const hoverRatio = this.ratioAt(this.px);
    el.preview.style.transform = `translate3d(${((hoverRatio - 1) * 100).toFixed(3)}%, 0, 0)`;
    el.preview.style.opacity = (this.seekHover * 0.9).toFixed(3);
    el.bar.style.transform = `scaleY(${(1 + ease.cubicInOut(this.thick)).toFixed(3)})`;
    el.head.style.transform = `translate3d(${(ratio * trackWidth - 6).toFixed(2)}px, 0, 0) scale(${(1 + 0.45 * ease.backOut(this.thick)).toFixed(3)})`;
    this.popPassedTicks(now, duration, playing);
    const second = Math.floor(shown);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      el.time.textContent = timecode(shown);
      el.track.setAttribute("aria-valuenow", String(second));
      el.track.setAttribute(
        "aria-valuetext",
        duration ? `${spokenTime(shown)} of ${spokenTime(duration)}` : spokenTime(shown),
      );
    }

    // Buffering: the brand shapes chase each other round the playhead.
    const stalled = playing && (video.readyState < 3 || video.seeking);
    this.stall = stalled ? this.stall + dt : 0;
    this.buffering = approach(this.buffering, this.stall > 0.22 ? 1 : 0, 4, dt);
    this.frameless = video.readyState < 2 && !this.ui.error ? this.frameless + dt : 0;
    this.waitingCentre = approach(this.waitingCentre, this.frameless > 0.3 ? 1 : 0, 4, dt);
    this.orbit += dt * (this.reduced ? 0 : (Math.PI * 2) / 1.05);
    this.drawWaiting(
      el.waitHead,
      ratio * trackWidth,
      (track?.height ?? 44) / 2,
      13,
      this.buffering,
    );
    this.drawWaiting(el.waitCentre, 0, 0, 36, this.waitingCentre);

    // Letterbox marks drift slowly (and stand still under reduced motion).
    if (this.bars.length && !this.reduced) {
      this.drift += dt * 9;
      for (const strip of Array.from(el.marks.children) as HTMLElement[]) {
        const inner = strip.firstElementChild as HTMLElement | null;
        if (!inner) continue;
        const spacing = Number(strip.dataset.spacing) || 56;
        const off = this.drift % spacing;
        const side = strip.dataset.side;
        inner.style.transform =
          side === "top"
            ? `translate3d(${(off - spacing).toFixed(2)}px, 0, 0)`
            : side === "bottom"
              ? `translate3d(${(-off).toFixed(2)}px, 0, 0)`
              : side === "left"
                ? `translate3d(0, ${(off - spacing).toFixed(2)}px, 0)`
                : `translate3d(0, ${(-off).toFixed(2)}px, 0)`;
      }
    }

    // The end holds a beat, then closes itself onto the Play button.
    if (this.phase === "ending") {
      this.endingFor += dt;
      if (this.endingFor > ENDING_SECONDS) this.requestClose("end");
    }
    this.burst.update(dt);

    // The cursor.
    const pointerClose = this.phase === "closing" && this.closeReason === "pointer";
    const showCursor =
      pointerClose ||
      (this.cursorActive() &&
        this.phase !== "done" &&
        this.phase !== "closing" &&
        !(resting && this.phase === "open"));
    const seekPin = inSeek && track;
    // Over a button the cursor springs onto the button's own glyph, as if
    // magnetised, and leaves the button's word readable.
    const dock = this.cursorActive() && this.control ? this.docks[this.control] : null;
    this.cursor.update(
      dt,
      {
        x: dock ? dock.x : seekPin ? clamp(this.px, track.x, track.x + track.width) : this.px,
        y: dock ? dock.y : seekPin ? track.y + track.height / 2 : this.py,
        pointerX: this.px,
        pointerY: this.py,
        down: this.down,
        shown: showCursor,
        // A close into the cursor keeps the disc whole until it swallows the circle.
        openness: pointerClose ? 1 : this.iris.openness,
        vanish: pointerClose ? saturate((this.closeProgress.value - 0.72) / 0.28) : 0,
        reduced: this.reduced,
        width: this.stageWidth,
        height: this.stageHeight,
      },
      this.look(),
    );
    if (pointerClose) {
      const { x, y } = this.cursor.position;
      this.iris.retarget(x, y, this.cursor.radius * 0.92);
    }
    this.iris.render(video, this.boxes.video);

    // The sound fades out with the close.
    if (this.phase === "closing") {
      try {
        video.volume = clamp(1 - ease.cubicInOut(this.closeProgress.value), 0, 1);
      } catch {
        // iOS keeps volume read-only.
      }
    }
    this.lastTickTime = now;
  };

  private popPassedTicks(now: number, duration: number, playing: boolean) {
    if (!playing || this.reduced || !duration) return;
    const from = this.lastTickTime;
    if (now <= from || now - from > 1) return;
    for (const tick of Array.from(this.el.ticks.children) as HTMLElement[]) {
      const at = Number(tick.dataset.at);
      if (at > from && at <= now) {
        this.tweens.push(
          gsap.fromTo(
            tick,
            { scale: 2.2, rotate: -90 },
            { scale: 1, rotate: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" },
          ),
        );
      }
    }
  }

  private drawWaiting(group: HTMLElement, cx: number, cy: number, radius: number, amount: number) {
    group.style.opacity = amount.toFixed(3);
    if (amount < 0.001) return;
    const bits = group.children;
    for (let i = 0; i < bits.length; i++) {
      const bit = bits[i] as HTMLElement;
      const size = bit.offsetWidth || 8;
      // Each shape trails the one ahead by a gap that breathes, so they
      // bunch up and stretch out like a chase.
      const gap = 0.95 + 0.4 * Math.sin(this.time * 2.6 + i * 0.8);
      const angle = this.orbit - i * gap;
      const r = radius * (0.6 + 0.4 * ease.backOut(amount));
      const x = cx + Math.cos(angle) * r - size / 2;
      const y = cy + Math.sin(angle) * r - size / 2;
      bit.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${((angle * 180) / Math.PI + 90).toFixed(1)}deg) scale(${amount.toFixed(3)})`;
    }
  }

  // --------------------------------------------------------------- feedback

  private rippleAt(point: { x: number; y: number } | null, tone: "blue" | "yellow" | "red") {
    if (!point || this.reduced) return;
    const { ripple } = this.el;
    ripple.style.borderColor = `var(--brand-${tone})`;
    this.tweens.push(
      gsap.fromTo(
        ripple,
        { x: point.x - 40, y: point.y - 40, scale: 0.35, opacity: 0.9 },
        { scale: 1.7, opacity: 0, duration: 0.55, ease: "power2.out" },
      ),
    );
  }

  private flash(glyph: "play" | "pause") {
    const { flash } = this.el;
    flash.dataset.glyph = glyph;
    const d = this.reduced ? 0 : 1;
    this.tweens.push(
      gsap
        .timeline()
        .fromTo(
          flash,
          { autoAlpha: 0, scale: 0.72 },
          { autoAlpha: 1, scale: 1, duration: 0.2 * d, ease: "back.out(2.4)" },
        )
        .to(flash, {
          autoAlpha: 0,
          scale: 1 + 0.12 * d,
          duration: 0.35 * d,
          delay: 0.35,
          ease: "power2.in",
        }),
    );
  }

  // ------------------------------------------------------------ fullscreen

  private enterFullscreen() {
    // Phones only, and only where the page itself can go fullscreen (not
    // iPhone Safari, which would hand the video to its own player instead).
    if (!this.touch || Math.min(this.stageWidth, this.stageHeight) >= 600) return;
    const root = this.el.root;
    if (!document.fullscreenEnabled || typeof root.requestFullscreen !== "function") return;
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        this.fullscreen = true;
      })
      .catch(() => {});
  }

  private exitFullscreen() {
    if (!this.fullscreen) return;
    this.fullscreen = false;
    if (document.fullscreenElement === this.el.root) document.exitFullscreen().catch(() => {});
  }
}
