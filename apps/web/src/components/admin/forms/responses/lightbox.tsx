"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  DownloadSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  X,
} from "@phosphor-icons/react";
import type { FormFileAnswer } from "@repo/shared";

import { formFileUrl } from "@/lib/forms/admin-api";

import { FileTypeIcon, formatBytes, isImageFile, isVideoFile } from "./cells";

export type LightboxItem = FormFileAnswer & { caption?: string };

/**
 * A full-screen viewer for respondents' uploads: images (zoom with the
 * buttons, the wheel, + and -; drag to pan when zoomed), videos playable
 * inline, anything else as a download card. Arrow keys move through the
 * set, Escape closes, focus returns to where it was.
 */
export function Lightbox({
  formId,
  items,
  index,
  onIndex,
  onClose,
}: {
  formId: string;
  items: LightboxItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const item = items[index];

  const go = useCallback(
    (delta: number) => {
      if (items.length < 2) return;
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      onIndex((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(6, value * 1.4));
      else if (event.key === "-") setZoom((value) => Math.max(1, value / 1.4));
      else if (event.key === "0") {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!item) return null;
  const image = isImageFile(item);
  const video = isVideoFile(item);
  const buttonClass =
    "inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30";

  return (
    <div
      aria-label={`File ${index + 1} of ${items.length}: ${item.name}`}
      aria-modal="true"
      className="fixed inset-0 z-[70] flex flex-col bg-[#0e1116]/95 text-white outline-none"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <p className="truncate text-xs text-white/55">
            {[
              item.caption,
              formatBytes(item.size),
              items.length > 1 ? `${index + 1} / ${items.length}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {image ? (
          <>
            <button
              aria-label="Zoom out"
              className={buttonClass}
              disabled={zoom <= 1}
              onClick={() => setZoom((value) => Math.max(1, value / 1.4))}
              type="button"
            >
              <MagnifyingGlassMinus size={18} />
            </button>
            <button
              aria-label="Zoom in"
              className={buttonClass}
              disabled={zoom >= 6}
              onClick={() => setZoom((value) => Math.min(6, value * 1.4))}
              type="button"
            >
              <MagnifyingGlassPlus size={18} />
            </button>
          </>
        ) : null}
        <a
          aria-label="Open in a new tab"
          className={buttonClass}
          href={formFileUrl(formId, item.key)}
          rel="noreferrer"
          target="_blank"
        >
          <ArrowSquareOut size={18} />
        </a>
        <a
          aria-label="Download"
          className={buttonClass}
          download={item.name}
          href={formFileUrl(formId, item.key, "download")}
        >
          <DownloadSimple size={18} />
        </a>
        <button aria-label="Close" className={buttonClass} onClick={onClose} type="button">
          <X size={18} />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pb-4 sm:px-16"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed per-response file
          <img
            alt={item.caption ? `${item.caption}: ${item.name}` : item.name}
            className={`max-h-full max-w-full select-none object-contain ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
            draggable={false}
            key={item.key}
            onClick={() => {
              if (zoom === 1) setZoom(2);
            }}
            onPointerDown={(event) => {
              if (zoom <= 1) return;
              drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
              setDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setOffset({
                x: drag.current.ox + event.clientX - drag.current.x,
                y: drag.current.oy + event.clientY - drag.current.y,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
              setDragging(false);
            }}
            onWheel={(event) => {
              setZoom((value) =>
                Math.max(1, Math.min(6, value * (event.deltaY < 0 ? 1.15 : 1 / 1.15))),
              );
            }}
            src={formFileUrl(formId, item.key)}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transition: dragging ? "none" : "transform 160ms ease-out",
            }}
          />
        ) : video ? (
          <video
            className="max-h-full max-w-full rounded-lg"
            controls
            key={item.key}
            playsInline
            preload="metadata"
            src={formFileUrl(formId, item.key)}
          />
        ) : (
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white/5 p-8 text-center">
            <FileTypeIcon file={item} size={48} />
            <p className="break-all text-sm font-semibold">{item.name}</p>
            <p className="text-xs text-white/55">
              {item.type || "File"} · {formatBytes(item.size)}
            </p>
            <a
              className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0e1116]"
              download={item.name}
              href={formFileUrl(formId, item.key, "download")}
            >
              <DownloadSimple size={16} weight="bold" /> Download
            </a>
          </div>
        )}
        {items.length > 1 ? (
          <>
            <button
              aria-label="Previous file"
              className={`${buttonClass} absolute top-1/2 left-2 -translate-y-1/2 sm:left-4`}
              onClick={() => go(-1)}
              type="button"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              aria-label="Next file"
              className={`${buttonClass} absolute top-1/2 right-2 -translate-y-1/2 sm:right-4`}
              onClick={() => go(1)}
              type="button"
            >
              <ArrowRight size={18} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
