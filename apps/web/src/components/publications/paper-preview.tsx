"use client";

import { BookOpenText, DownloadSimple } from "@phosphor-icons/react";
import { getDocument } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { ensurePdfJsWorker } from "@/lib/pdfjs-client";

/**
 * Renders the first page of the paper as a cover and invites the reader to
 * open the full PDF viewer. The single page is drawn on demand, so the page
 * loads without touching the rest of the file. The canvas mounts from the
 * first paint — it only becomes visible once the page is drawn — so the
 * render effect never waits on a ref that would only exist after it ran.
 */
export function PaperPreview({
  fileName,
  onOpenViewer,
  url,
}: {
  fileName: string;
  onOpenViewer: () => void;
  url: string;
}) {
  ensurePdfJsWorker();
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const document = await getDocument({ url }).promise;
        const page = await document.getPage(1);
        const frame = frameRef.current;
        const canvas = canvasRef.current;
        if (!frame || !canvas || cancelled) return;
        const width = frame.clientWidth || 720;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(width / base.width, 2);
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context || cancelled) return;
        await page.render({
          canvas,
          canvasContext: context,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
          viewport,
        }).promise;
        if (!cancelled) setReady(true);
        await document.cleanup();
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error ? renderError.message : "This PDF could not be previewed.",
          );
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      className="group relative overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface-muted)] shadow-[var(--shadow-2)] dark:border-white/10 dark:bg-white/[0.03]"
      ref={frameRef}
    >
      <button
        aria-label="Read the full text"
        className="block w-full text-left"
        onClick={onOpenViewer}
        type="button"
      >
        <div className="relative mx-auto flex max-h-[560px] items-start justify-center overflow-hidden px-6 pt-8 pb-10">
          {/* The canvas mounts empty and hidden until the first page is drawn. */}
          <canvas
            className={`rounded-lg bg-white shadow-[0_24px_60px_-30px_rgba(14,17,22,0.35)] ${ready ? "" : "invisible"}`}
            ref={canvasRef}
          />
          {!ready && !error ? (
            <div className="absolute inset-0 grid place-items-center">
              <span className="size-7 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-brand-blue" />
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <p className="max-w-sm rounded-xl bg-white px-5 py-4 text-center text-sm leading-6 text-[var(--ink-3)] shadow">
                {error}
              </p>
            </div>
          ) : null}
          {/* Fade + invitation overlay across the bottom of the page. */}
          <div
            className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/80 to-transparent px-6 pt-28 pb-9 transition ${ready ? "opacity-100" : "opacity-0"}`}
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition group-hover:bg-[#2f5db4]">
              <BookOpenText size={17} />
              Read the full text
            </span>
            <span className="text-xs text-[var(--ink-3)]">
              Opens the PDF reader — zoom, jump to page, and download.
            </span>
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between gap-4 border-t border-[var(--line)] px-6 py-3.5 dark:border-white/10">
        <p className="min-w-0 truncate font-mono text-xs text-[var(--ink-3)]">{fileName}</p>
        <a
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-blue transition hover:text-[#2f5db4]"
          download={fileName}
          href={url}
        >
          <DownloadSimple size={15} />
          Download PDF
        </a>
      </div>
    </div>
  );
}
