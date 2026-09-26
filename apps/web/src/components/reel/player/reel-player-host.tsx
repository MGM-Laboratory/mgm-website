"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";
import {
  onReelPlayerRequest,
  reportReelPlayerClosed,
  type ReelPlayerRequest,
} from "@/lib/reel-player";

const subscribeNothing = () => () => {};

/**
 * The full-screen reel player, mounted once on the homepage. It answers
 * `openReelPlayer()` (lib/reel-player.ts), renders into document.body (the
 * homepage content is transformed by ScrollSmoother, so `fixed` inside it
 * would scroll away), holds the page's scroll lock while open, closes on
 * Escape, and hands focus back to the button that opened it.
 */
export function ReelPlayerHost() {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [request, setRequest] = useState<ReelPlayerRequest | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onReelPlayerRequest(setRequest), []);

  useEffect(() => {
    if (!request) return;
    acquireScrollLock("reel-player");
    const video = videoRef.current;
    if (video) {
      video.currentTime = request.startTime ?? 0;
      void video.play().catch(() => {});
    }
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseScrollLock("reel-player");
    };
    // `close` only reads refs and the request it closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  function close() {
    const video = videoRef.current;
    const current = request;
    setRequest(null);
    reportReelPlayerClosed({
      currentTime: video?.currentTime ?? 0,
      finished: Boolean(video?.ended),
    });
    current?.returnFocus?.focus();
  }

  if (!mounted || !request) return null;
  return createPortal(
    <div
      aria-label="Company profile video"
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center bg-[#0e1116]"
      role="dialog"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        controls
        playsInline
        src={request.src}
      />
      <button
        ref={closeRef}
        className="absolute top-4 right-4 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
        onClick={close}
        type="button"
      >
        Close
      </button>
    </div>,
    document.body,
  );
}
