"use client";

import { MagnifyingGlassPlus, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/**
 * The cover image, clickable to open a full-screen viewer: scroll/pinch to
 * zoom, drag to pan once zoomed in, double-click or the X to reset/close.
 */
export function EventCoverLightbox({ alt, src }: { alt: string; src: string }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startPan: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    setScale((current) =>
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, current - event.deltaY * 0.0015)),
    );
  };

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    dragRef.current = { startPan: pan, x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.startPan.x + (event.clientX - dragRef.current.x),
      y: dragRef.current.startPan.y + (event.clientY - dragRef.current.y),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <>
      <button
        aria-label="View cover image full-screen"
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-3xl"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} className="block aspect-[16/9] w-full object-cover" src={src} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <MagnifyingGlassPlus className="text-white" size={30} weight="bold" />
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] bg-black/90"
          onDoubleClick={reset}
          role="dialog"
          aria-modal="true"
          aria-label="Cover image viewer"
        >
          <button
            aria-label="Close image viewer"
            className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X size={20} weight="bold" />
          </button>
          <div
            className="flex size-full touch-none items-center justify-center overflow-hidden"
            onWheel={onWheel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={alt}
              className="max-h-full max-w-full select-none"
              draggable={false}
              onPointerDown={onPointerDown}
              onPointerLeave={onPointerUp}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              src={src}
              style={{
                cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transition: dragging ? "none" : "transform 0.08s ease-out",
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
