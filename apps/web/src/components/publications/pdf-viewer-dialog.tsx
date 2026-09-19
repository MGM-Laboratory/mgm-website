"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsOutSimple,
  DownloadSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  X,
} from "@phosphor-icons/react";
import {
  AnnotationLayer,
  getDocument,
  TextLayer,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ensurePdfJsWorker } from "@/lib/pdfjs-client";

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.15;
const PAGE_GUTTER = 24;

type PageBox = { width: number; height: number };

/** Everything layered over one page's canvas, rebuilt on each render pass. */
type PageLayers = {
  textLayer: TextLayer;
  textDiv: HTMLDivElement;
  annotationLayer: AnnotationLayer;
  annotationDiv: HTMLDivElement;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * A full-screen PDF reading surface: zoom, fit-to-width, direct page jumps,
 * page navigation and download — the standard set of PDF viewer tools, drawn
 * on demand page by page so even a very large paper only ever renders what is
 * on screen.
 *
 * Every page carries a canvas plus a transparent text layer and an annotation
 * layer, so the text is selectable and copyable, and links — including the
 * hyperref/TOC links in LaTeX-generated PDFs — are clickable. Internal links
 * jump within the reader; external links open in a new tab.
 */
export function PdfViewerDialog({
  fileName,
  onClose,
  title,
  url,
}: {
  fileName: string;
  onClose: () => void;
  title: string;
  url: string;
}) {
  ensurePdfJsWorker();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const layersRef = useRef(new Map<number, PageLayers>());
  const tasks = useRef(new Map<number, RenderTask>());
  // Monotonic pass counter per page: the observer and the scale-change effect
  // can both schedule a render for the same page, and only the newest pass
  // may touch the DOM — stale passes bail out after every await.
  const renderPass = useRef(new Map<number, number>());
  const [attempt, setAttempt] = useState(0);
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [boxes, setBoxes] = useState<PageBox[]>([]);
  const [error, setError] = useState<string>();
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [fitWidth, setFitWidth] = useState(true);
  const [zoom, setZoom] = useState(1);

  // Load the document and collect the natural size of every page so each
  // page reserves its real aspect ratio in the scroll column.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(undefined);
      setDoc(undefined);
      setBoxes([]);
      try {
        const document = await getDocument({ url }).promise;
        if (cancelled) {
          void document.cleanup();
          return;
        }
        const nextBoxes: PageBox[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          nextBoxes.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) {
          void document.cleanup();
          return;
        }
        setDoc(document);
        setNumPages(document.numPages);
        setBoxes(nextBoxes);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "This PDF could not be opened.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt, url]);

  // Destroy the document when the dialog closes.
  useEffect(() => {
    return () => {
      void doc?.cleanup();
    };
  }, [doc]);

  // Track the reading column width; fit-to-width derives from it.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const measure = () => setContainerWidth(root.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // The render scale: explicit zoom, or fitted to the reading column.
  const scale = useMemo(() => {
    if (!fitWidth) return zoom;
    const pageBox = boxes[currentPage - 1];
    if (!pageBox || !containerWidth) return zoom;
    return clamp(containerWidth / pageBox.width, MIN_SCALE, MAX_SCALE);
  }, [boxes, containerWidth, currentPage, fitWidth, zoom]);

  const jumpTo = useCallback(
    (page: number) => {
      if (!numPages) return;
      const target = clamp(page, 1, numPages);
      const element = pageRefs.current.get(target);
      const root = scrollRef.current;
      if (element && root) root.scrollTo({ top: Math.max(0, element.offsetTop - PAGE_GUTTER) });
      setCurrentPage(target);
    },
    [numPages],
  );

  const clearPage = useCallback((pageNumber: number) => {
    renderPass.current.set(pageNumber, (renderPass.current.get(pageNumber) ?? 0) + 1);
    const task = tasks.current.get(pageNumber);
    if (task) {
      task.cancel();
      tasks.current.delete(pageNumber);
    }
    const layers = layersRef.current.get(pageNumber);
    if (layers) {
      layers.textLayer.cancel();
      layers.annotationLayer.destroy();
      layersRef.current.delete(pageNumber);
    }
    // A stale pass may have appended layer divs and bailed before registering
    // them here; sweeping the wrapper removes those orphans too.
    const wrapper = pageRefs.current.get(pageNumber);
    wrapper
      ?.querySelectorAll(".textLayer, .annotationLayer")
      .forEach((element) => element.remove());
    const canvas = canvasRefs.current.get(pageNumber);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.width = "";
      canvas.style.height = "";
    }
  }, []);

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!doc) return;
      const canvas = canvasRefs.current.get(pageNumber);
      const wrapper = pageRefs.current.get(pageNumber);
      if (!canvas || !wrapper) return;

      // A previous pass's layers (older scale) are torn down before the new
      // ones mount, so zooming can never stack duplicate text layers.
      clearPage(pageNumber);
      const pass = (renderPass.current.get(pageNumber) ?? 0) + 1;
      renderPass.current.set(pageNumber, pass);
      const stale = () => renderPass.current.get(pageNumber) !== pass;

      try {
        const page = await doc.getPage(pageNumber);
        if (stale()) return;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) return;
        const task = page.render({
          canvas,
          canvasContext: context,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
          viewport,
        });
        tasks.current.set(pageNumber, task);
        await task.promise;
        tasks.current.delete(pageNumber);
        if (stale()) return;

        // Links resolve destinations and named actions through this reader,
        // so internal jumps (LaTeX hyperref/TOC links) navigate the viewer
        // and external URLs open in a new tab.
        const linkService = {
          addLinkAttributes(link: HTMLAnchorElement, linkUrl: string, newWindow: boolean) {
            // Link annotations come from the document, so only known-safe
            // schemes may reach the href; anything else stays inert.
            let parsed: URL | undefined;
            try {
              parsed = new URL(linkUrl, window.location.href);
            } catch {
              parsed = undefined;
            }
            if (!parsed || !["http:", "https:", "mailto:"].includes(parsed.protocol)) {
              link.removeAttribute("href");
              link.setAttribute("aria-disabled", "true");
              link.setAttribute("role", "link");
              return;
            }
            link.href = parsed.href;
            if (newWindow || parsed.protocol === "http:" || parsed.protocol === "https:") {
              link.target = "_blank";
              link.rel = "noreferrer noopener";
            }
          },
          getDestinationHash() {
            return "#";
          },
          getAnchorUrl() {
            return "#";
          },
          goToDestination: async (destination: unknown) => {
            try {
              // The worker accepts both named destinations and explicit
              // destination arrays; the published type only names strings.
              const explicit = await doc.getDestination(destination as string);
              if (!explicit || !Array.isArray(explicit)) return;
              const pageIndex = await doc.getPageIndex(explicit[0]);
              const targetPage = pageIndex + 1;
              const element = pageRefs.current.get(targetPage);
              const root = scrollRef.current;
              if (!element || !root) return;
              // LaTeX TOC links use /XYZ destinations; land on the exact
              // vertical position instead of just the top of the page.
              let offset = Math.max(0, element.offsetTop - PAGE_GUTTER);
              const box = boxes[pageIndex];
              if (explicit[1] === "XYZ" && typeof explicit[3] === "number" && box) {
                offset += explicit[3] * box.height * scale;
              }
              root.scrollTo({ top: offset });
              setCurrentPage(targetPage);
            } catch {
              // Unresolvable destination; the link does nothing.
            }
          },
          executeNamedAction: (action: string) => {
            const page = currentPage;
            if (action === "NextPage") jumpTo(page + 1);
            else if (action === "PrevPage") jumpTo(page - 1);
            else if (action === "FirstPage") jumpTo(1);
            else if (action === "LastPage") jumpTo(numPages);
          },
        };

        // Selectable, copyable text — glyphs stay transparent because the
        // canvas underneath is the visual source of truth.
        const textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        wrapper.append(textDiv);
        const textContent = await page.getTextContent();
        if (stale()) return;
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textDiv,
          viewport,
        });
        await textLayer.render();
        if (stale()) return;

        // Clickable link annotations over the text layer.
        const annotationDiv = document.createElement("div");
        annotationDiv.className = "annotationLayer";
        wrapper.append(annotationDiv);
        const annotationLayer = new AnnotationLayer({
          div: annotationDiv,
          linkService,
          page,
          viewport,
        } as ConstructorParameters<typeof AnnotationLayer>[0]);
        // The shipped build reads annotations from the render params and the
        // rest from the constructor; the superset keeps both the current
        // runtime and the published type shape satisfied.
        const annotations = await page.getAnnotations();
        if (stale()) return;
        await annotationLayer.render({
          annotations,
          div: annotationDiv,
          enableScripting: false,
          linkService,
          page,
          renderForms: false,
          viewport,
        } as unknown as Parameters<AnnotationLayer["render"]>[0]);
        if (stale()) return;

        layersRef.current.set(pageNumber, {
          annotationDiv,
          annotationLayer,
          textDiv,
          textLayer,
        });
      } catch {
        // Cancelled mid-render; a newer scale pass takes over.
      }
    },
    [boxes, clearPage, currentPage, doc, jumpTo, numPages, scale],
  );

  // Render pages as they approach the viewport and release them when they
  // leave it, so memory tracks what is actually being read.
  useEffect(() => {
    if (!doc) return;
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) void renderPage(pageNumber);
          else clearPage(pageNumber);
        }
      },
      { root, rootMargin: "800px 0px" },
    );
    for (const element of pageRefs.current.values()) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [boxes, clearPage, doc, renderPage]);

  // Re-render everything already on screen whenever the scale changes.
  useEffect(() => {
    if (!doc) return;
    const root = scrollRef.current;
    if (!root) return;
    const visible = [...pageRefs.current.values()].filter((element) => {
      const bounds = element.getBoundingClientRect();
      const rootBounds = root.getBoundingClientRect();
      return bounds.bottom >= rootBounds.top && bounds.top <= rootBounds.bottom;
    });
    for (const element of visible) {
      void renderPage(Number(element.dataset.page));
    }
  }, [doc, renderPage]);

  // Track the page currently centered in the reading column.
  useEffect(() => {
    if (!doc) return;
    const root = scrollRef.current;
    if (!root) return;
    let frame = 0;
    const track = () => {
      frame = 0;
      const center = root.scrollTop + root.clientHeight / 2;
      let page = 1;
      for (const [entryPage, element] of pageRefs.current) {
        if (element.offsetTop + element.offsetHeight > center) {
          page = entryPage;
          break;
        }
      }
      setCurrentPage(page);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(track);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [doc, boxes]);

  // Zoom steps start from the scale actually on screen, so stepping out of
  // fit-to-width continues from the fitted size instead of jumping.
  const zoomIn = () => {
    const base = fitWidth ? scale : zoom;
    const next = clamp(Math.round(base * ZOOM_STEP * 100) / 100, MIN_SCALE, MAX_SCALE);
    setFitWidth(false);
    setZoom(next);
  };
  const zoomOut = () => {
    const base = fitWidth ? scale : zoom;
    const next = clamp(Math.round((base / ZOOM_STEP) * 100) / 100, MIN_SCALE, MAX_SCALE);
    setFitWidth(false);
    setZoom(next);
  };
  const toggleFitWidth = () => {
    setFitWidth((current) => {
      if (current) setZoom(scale);
      return !current;
    });
  };

  // Keyboard: escape closes, +/- zoom, arrows page through.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") onClose();
      else if (event.key === "+" || event.key === "=") zoomIn();
      else if (event.key === "-") zoomOut();
      else if (event.key === "ArrowRight" || event.key === "PageDown") jumpTo(currentPage + 1);
      else if (event.key === "ArrowLeft" || event.key === "PageUp") jumpTo(currentPage - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, numPages, onClose]);

  const toolbarButton =
    "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-35";

  return (
    <div
      aria-label="PDF viewer"
      aria-modal="true"
      className="fixed inset-0 z-[130] flex flex-col bg-[#0e1116] motion-safe:animate-[pdf-viewer-in_150ms_ease-out]"
      role="dialog"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-[#0e1116]/95 px-3 py-2 sm:flex-nowrap sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            aria-label="Close PDF viewer"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
          <p className="min-w-0 truncate text-sm font-medium text-white/90" title={title}>
            {title}
          </p>
        </div>

        <div className="order-3 flex w-full shrink-0 items-center justify-center gap-1 sm:order-none sm:w-auto sm:justify-start">
          <button
            aria-label="Previous page"
            className={toolbarButton}
            disabled={currentPage <= 1}
            onClick={() => jumpTo(currentPage - 1)}
            type="button"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-1 rounded-lg bg-white/[0.07] px-2">
            <input
              aria-label="Current page"
              className="h-8 w-10 bg-transparent text-center font-mono text-xs text-white outline-none"
              max={numPages || 1}
              min={1}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value >= 1 && value <= numPages) jumpTo(value);
              }}
              type="number"
              value={currentPage}
            />
            <span className="font-mono text-xs text-white/45">/ {numPages || "—"}</span>
          </div>
          <button
            aria-label="Next page"
            className={toolbarButton}
            disabled={currentPage >= numPages}
            onClick={() => jumpTo(currentPage + 1)}
            type="button"
          >
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="order-4 flex w-full shrink-0 items-center justify-center gap-1 sm:order-none sm:w-auto sm:justify-start">
          <button aria-label="Zoom out" className={toolbarButton} onClick={zoomOut} type="button">
            <MagnifyingGlassMinus size={16} />
          </button>
          <span className="w-12 text-center font-mono text-xs text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <button aria-label="Zoom in" className={toolbarButton} onClick={zoomIn} type="button">
            <MagnifyingGlassPlus size={16} />
          </button>
          <button
            aria-label="Fit to width"
            aria-pressed={fitWidth}
            className={`${toolbarButton} ${fitWidth ? "bg-white/10 text-white" : ""}`}
            onClick={toggleFitWidth}
            title="Fit to width"
            type="button"
          >
            <ArrowsOutSimple size={16} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <a aria-label="Download PDF" className={toolbarButton} download={fileName} href={url}>
            <DownloadSimple size={16} />
          </a>
          <a
            aria-label="Open PDF in a new tab"
            className={`${toolbarButton} hidden sm:inline-flex`}
            href={url}
            rel="noreferrer"
            target="_blank"
          >
            <ArrowSquareOut size={16} />
          </a>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6" ref={scrollRef}>
        {error ? (
          <div className="mx-auto mt-24 max-w-md rounded-2xl bg-white/[0.05] p-8 text-center">
            <p className="font-display text-xl font-semibold text-white">
              This paper could not be opened
            </p>
            <p className="mt-2 text-sm leading-6 text-white/55">{error}</p>
            <button
              className="mt-5 inline-flex h-10 items-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white transition hover:opacity-90"
              onClick={() => setAttempt((current) => current + 1)}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : !doc ? (
          <div className="mx-auto mt-24 flex flex-col items-center gap-3 text-white/60">
            <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <p className="text-sm">Opening the paper…</p>
          </div>
        ) : (
          <div className="mx-auto flex w-full flex-col items-center">
            {boxes.map((box, index) => {
              const pageNumber = index + 1;
              return (
                <div
                  className="relative mb-6 overflow-hidden bg-white shadow-[0_18px_50px_-20px_rgba(0,0,0,0.8)]"
                  data-page={pageNumber}
                  key={pageNumber}
                  ref={(element) => {
                    if (element) pageRefs.current.set(pageNumber, element);
                    else pageRefs.current.delete(pageNumber);
                  }}
                  style={
                    {
                      width: box.width * scale,
                      height: box.height * scale,
                      // pdf.js layers size themselves against these variables.
                      "--total-scale-factor": scale,
                      "--scale-round-x": "1px",
                      "--scale-round-y": "1px",
                    } as React.CSSProperties
                  }
                >
                  <canvas
                    className="absolute left-0 top-0"
                    ref={(element) => {
                      if (element) canvasRefs.current.set(pageNumber, element);
                      else canvasRefs.current.delete(pageNumber);
                    }}
                  />
                  <span className="absolute right-3 bottom-2 z-[2] font-mono text-[10px] text-[#8a8a8a] select-none">
                    {pageNumber}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
