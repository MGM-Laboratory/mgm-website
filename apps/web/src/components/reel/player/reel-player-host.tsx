"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { X } from "lucide-react";

import { onPointer, pointer } from "@/lib/motion/pointer";
import {
  onReelPlayerRequest,
  openReelPlayer,
  reportReelPlayerClosed,
  type ReelPlayerClosed,
  type ReelPlayerRequest,
} from "@/lib/reel-player";
import { isRouteCoverActive, onRouteCoverChange } from "@/lib/route-reveal";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

import type { PlayerSession, PlayerUiProps } from "./session";

const LOCK_OWNER = "reel-player";
/**
 * The reel's muted loop hands over its current time. Continuing from it
 * keeps the open seamless, but a visitor who presses Play wants the whole
 * film with sound, so only a loop that has barely started is continued;
 * later than this, the player starts from the beginning.
 */
const CONTINUE_WITHIN_SECONDS = 12;
/** Closing this close to the end counts as done: the next open starts over. */
const NEAR_END_SECONDS = 8;
const DEV_VIDEO = "/api/home-cms/video/home-video-08102fd9-ea7f-4939-b929-28e86b231709.mp4";

type PlayerUi = ComponentType<PlayerUiProps>;

// The player UI (and everything it animates with) is its own chunk: fetched
// when the browser is idle, well before anyone can press Play, and awaited
// at the click only if that hasn't happened yet.
let loadedUi: PlayerUi | null = null;
let loadingUi: Promise<PlayerUi> | null = null;

function loadPlayerUi() {
  loadingUi ??= import("./reel-player").then((module) => {
    loadedUi = module.ReelPlayer;
    return module.ReelPlayer;
  });
  loadingUi.catch(() => {
    // A failed fetch (offline) is retried by the next open.
    loadingUi = null;
  });
  return loadingUi;
}

/** Where each video was left this visit, to pick up from there on the next open. */
const resumeAt = new Map<string, number>();
let lastInput: "keyboard" | "pointer" = "pointer";
let sessionCount = 0;

function startTimeFor(request: ReelPlayerRequest) {
  const remembered = resumeAt.get(request.src);
  if (remembered !== undefined) return remembered;
  const loopTime = request.startTime ?? 0;
  return loopTime > 0 && loopTime < CONTINUE_WITHIN_SECONDS ? loopTime : 0;
}

/**
 * Everything that has to happen inside the click itself: the video starts
 * here, with sound, because this is the moment browsers allow it. The
 * page is covered by the shell straight away, so the sound never plays
 * over an unchanged page even if the UI has yet to arrive.
 */
function createSession(request: ReelPlayerRequest): PlayerSession {
  const shell = document.createElement("div");
  shell.dataset.reelPlayer = "";
  shell.className = "fixed inset-0 z-[90]";
  const video = document.createElement("video");
  video.className = "absolute inset-0 size-full object-contain opacity-0";
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.setAttribute("disableremoteplayback", "");
  video.src = request.src;
  const startTime = startTimeFor(request);
  if (startTime > 0) video.currentTime = startTime;
  shell.appendChild(video);
  document.body.appendChild(shell);
  acquireScrollLock(LOCK_OWNER);

  // Without the visitor's click (a console call, a replayed event) there is
  // no autoplay: the player opens paused on its big Play button.
  let playAttempt: Promise<void> | null = null;
  const activation = navigator.userActivation;
  if (!activation || activation.isActive) {
    try {
      playAttempt = video.play() ?? null;
    } catch {
      playAttempt = null;
    }
    playAttempt?.catch(() => {});
  }
  const at = pointer();
  return {
    id: ++sessionCount,
    request,
    video,
    shell,
    playAttempt,
    startTime,
    fromKeyboard: lastInput === "keyboard",
    pointerAt: at.x >= 0 && at.type !== "touch" && at.inside ? { x: at.x, y: at.y } : null,
    coveredEarly: false,
  };
}

/** The last way to watch when the player UI can't load: the browser's own controls. */
function showNativeControls(video: HTMLVideoElement) {
  video.controls = true;
  video.style.opacity = "1";
}

/**
 * What shows while the player UI is still on its way (a slow network on
 * the very first click), or if it failed to load: a dark stage, a close
 * button, and in the failed case the browser's own video controls.
 */
function PlayerCover({
  session,
  failed,
  onClose,
}: {
  session: PlayerSession;
  failed: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node) gsap.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none" });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (failed) showNativeControls(session.video);
  }, [failed, session]);
  return (
    <div
      aria-label="Company profile video"
      aria-modal="true"
      className="absolute inset-0"
      data-header-tone="ignore"
      role="dialog"
    >
      <div ref={ref} className="absolute inset-0 -z-10 bg-[#0e1116]" />
      <button
        aria-label="Close video"
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,4vw)] grid size-11 place-items-center rounded-full bg-[var(--brand-yellow)] text-[#0e1116] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden className="size-[18px]" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * The full-screen reel player, mounted once on the homepage. It answers
 * `openReelPlayer()` (lib/reel-player.ts), renders into document.body
 * above the header (the homepage content is transformed by ScrollSmoother,
 * where `fixed` would scroll away), holds the page's scroll lock while
 * open, and reports back exactly once when it has closed, whichever way it
 * closed: the visitor, the end of the video, a route change or an unmount.
 */
export function ReelPlayerHost() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [ui, setUi] = useState<PlayerUi | null>(() => loadedUi);
  const [failed, setFailed] = useState(false);
  const current = useRef<PlayerSession | null>(null);
  const pathname = usePathname();
  const shownPath = useRef(pathname);

  const end = useCallback((result: ReelPlayerClosed) => {
    const ending = current.current;
    if (!ending) return;
    current.current = null;
    const { video, shell, request } = ending;
    try {
      video.pause();
    } catch {
      // A video torn down mid-load can throw; it's going away either way.
    }
    const duration = video.duration;
    const nearEnd = Number.isFinite(duration) && duration - result.currentTime < NEAR_END_SECONDS;
    if (result.finished || nearEnd || result.currentTime < 5) resumeAt.delete(request.src);
    else resumeAt.set(request.src, Math.max(0, result.currentTime - 1.5));
    video.removeAttribute("src");
    video.load();
    shell.remove();
    releaseScrollLock(LOCK_OWNER);
    setSession(null);
    reportReelPlayerClosed({ currentTime: result.currentTime, finished: result.finished });
    const back = request.returnFocus;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, []);

  const endNow = useCallback(() => {
    const open = current.current;
    if (open) end({ currentTime: open.video.currentTime || 0, finished: false });
  }, [end]);

  useEffect(() => {
    return onReelPlayerRequest((request) => {
      if (current.current) return;
      const next = createSession(request);
      if (!loadedUi) {
        next.coveredEarly = true;
        setFailed(false);
        loadPlayerUi().then(
          (loaded) => setUi(() => loaded),
          () => setFailed(true),
        );
      }
      current.current = next;
      setSession(next);
    });
  }, []);

  // Fetch the player UI once the page has settled, so a click finds it ready.
  useEffect(() => {
    if (loadedUi) return;
    const load = () => {
      loadPlayerUi().then(
        (loaded) => setUi(() => loaded),
        () => {},
      );
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(load, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  // Where the next open's cursor should appear, and whether it came from the keyboard.
  useEffect(() => {
    const offPointer = onPointer(() => {});
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") lastInput = "keyboard";
    };
    const onDown = () => {
      lastInput = "pointer";
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      offPointer();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, []);

  // Leaving the page (or the curtain starting to cover it) ends the session
  // at once, without its close animation.
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    endNow();
  }, [pathname, endNow]);

  useEffect(
    () =>
      onRouteCoverChange(() => {
        if (isRouteCoverActive()) endNow();
      }),
    [endNow],
  );

  useEffect(() => () => endNow(), [endNow]);

  // Development only: open the player from the console without the reel,
  // for example `__openReelPlayer()` or `__openReelPlayer({ src })`.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const target = window as unknown as {
      __openReelPlayer?: (options?: Partial<ReelPlayerRequest>) => boolean;
    };
    target.__openReelPlayer = (options) =>
      openReelPlayer({
        src: DEV_VIDEO,
        startTime: 0,
        returnFocus: document.activeElement as HTMLElement | null,
        ...options,
      });
    return () => {
      delete target.__openReelPlayer;
    };
  }, []);

  if (!session) return null;
  const Ui = ui ?? loadedUi;
  return createPortal(
    Ui ? (
      <Ui key={session.id} onDone={end} session={session} />
    ) : (
      <PlayerCover failed={failed} onClose={endNow} session={session} />
    ),
    session.shell,
  );
}
