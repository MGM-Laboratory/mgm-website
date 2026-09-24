"use client";

import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  DotsSixVertical,
  FilmStrip,
  ImageSquare,
  Play,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  projectMediaUrl,
  projectVideoUrl,
  PROJECT_DETAIL_LIMITS,
  type ProjectMediaItem,
  type ProjectMediaSize,
} from "@/lib/project-cms";

import {
  formatDuration,
  isAbortError,
  measureImage,
  MEDIA_ACCEPT,
  mediaKindOf,
  prepareImage,
  probeVideo,
  uploadWithProgress,
  type MediaFileKind,
} from "./media-files";
import { Counter, cardClass, cardHintClass, cardLabelClass, inputClass, invalidClass } from "./ui";

const { mediaMax, mediaAltMax } = PROJECT_DETAIL_LIMITS;

type MediaUpdate = (update: (items: ProjectMediaItem[]) => ProjectMediaItem[]) => void;
export type MediaUploadStatus = { busy: number; failed: number };

/** A pick waiting for, or going through, an upload. Kept for Retry. */
type Job = {
  file: File;
  kind: MediaFileKind;
  /** The row already has a saved file, which stays until this upload succeeds. */
  replacing: boolean;
  /** Blob URL of the picked file. */
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  /** Poster frame (JPEG data URL) and, once uploaded, its key. */
  poster?: string;
  posterKey?: string;
};

type RowMeta = {
  phase?: "queued" | "preparing" | "poster" | "uploading";
  /** 0..1 while the bytes go up. */
  progress?: number;
  error?: string;
  job?: Job;
  /** Blob URL of a file uploaded in this session (a sharper, faster preview). */
  previewUrl?: string;
  posterPreview?: string;
  duration?: number;
  /** The stored file could not be read back (a draft project's video, say). */
  measureFailed?: boolean;
};

const PHASE_LABEL: Record<NonNullable<RowMeta["phase"]>, string> = {
  queued: "Waiting",
  preparing: "Preparing",
  poster: "Uploading poster",
  uploading: "Uploading",
};

function kindLabel(kind: MediaFileKind) {
  return kind === "image" ? "Image" : "Video";
}

/** Tiny diagrams for the two sizes: padded with rounded corners, or edge to edge. */
function SizeGlyph({ size }: { size: ProjectMediaSize }) {
  return (
    <svg aria-hidden="true" className="shrink-0" height="12" viewBox="0 0 16 12" width="16">
      <rect
        fill="none"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeOpacity="0.45"
        width="15"
        x="0.5"
        y="0.5"
      />
      {size === "normal" ? (
        <rect fill="currentColor" height="6" rx="1.2" width="9" x="3.5" y="3" />
      ) : (
        <rect fill="currentColor" height="11" rx="1" width="15" x="0.5" y="0.5" />
      )}
    </svg>
  );
}

function SizeControl({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (size: ProjectMediaSize) => void;
  value: ProjectMediaSize;
}) {
  const options: { id: ProjectMediaSize; label: string; title: string }[] = [
    { id: "normal", label: "Normal", title: "Padded, with rounded corners" },
    { id: "full", label: "Full", title: "Edge to edge, the full height of the screen" },
  ];
  return (
    <div
      aria-label={label}
      className="flex h-9 items-center gap-1 rounded-xl border border-[#d9dfeb] bg-white p-1 dark:border-white/10 dark:bg-white/[0.045]"
      role="group"
    >
      {options.map((option) => (
        <button
          aria-pressed={value === option.id}
          className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${value === option.id ? "bg-[#171b25] text-white dark:bg-white/90 dark:text-[#171b25]" : "text-[#768096] hover:text-[#171b25] dark:text-white/45 dark:hover:text-white"}`}
          key={option.id}
          onClick={() => onChange(option.id)}
          title={option.title}
          type="button"
        >
          <SizeGlyph size={option.id} />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The API streams a video only once a published record uses it. */
function canStream(item: ProjectMediaItem, published: boolean) {
  return published || item.key.startsWith("static/");
}

function Thumbnail({
  item,
  meta,
  published,
}: {
  item: ProjectMediaItem;
  meta: RowMeta;
  published: boolean;
}) {
  const [broken, setBroken] = useState(false);
  // A replacement in flight previews the new file; a failed one keeps the old.
  const job = meta.job && (!meta.job.replacing || !meta.error) ? meta.job : undefined;
  const imageSource =
    item.kind === "image"
      ? (job?.url ?? meta.previewUrl ?? projectMediaUrl(item.key || undefined))
      : (job?.poster ??
        (job ? undefined : (meta.posterPreview ?? projectMediaUrl(item.posterKey))));
  const videoSource =
    item.kind === "video" && !imageSource
      ? (job?.url ??
        meta.previewUrl ??
        (canStream(item, published) ? projectVideoUrl(item.key || undefined) : undefined))
      : undefined;
  const busy = Boolean(meta.phase);
  return (
    <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-[#e8ecf4] sm:w-32 dark:bg-[#1a202b]">
      {imageSource && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setBroken(true)}
          src={imageSource}
        />
      ) : videoSource && !broken ? (
        <video
          aria-hidden="true"
          className="size-full object-cover"
          muted
          onError={() => setBroken(true)}
          playsInline
          preload="metadata"
          src={`${videoSource}#t=0.1`}
        />
      ) : (
        <span className="grid size-full place-items-center text-[#8490a5] dark:text-white/40">
          {item.kind === "image" ? (
            <ImageSquare size={22} weight="duotone" />
          ) : (
            <FilmStrip size={22} weight="duotone" />
          )}
        </span>
      )}
      {item.kind === "video" ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-7 place-items-center rounded-full bg-[#0e1116]/65 text-white backdrop-blur-sm">
            <Play size={12} weight="fill" />
          </span>
        </span>
      ) : null}
      {busy ? (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-[#0e1116]/25">
          {meta.phase === "uploading" && meta.progress !== undefined ? (
            <span
              className="block h-full bg-brand-blue transition-[width]"
              style={{ width: `${Math.round(meta.progress * 100)}%` }}
            />
          ) : (
            <span className="block h-full w-full bg-brand-blue/70 motion-safe:animate-pulse" />
          )}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The detail page's ordered media sections. Files upload as soon as they
 * are added (one at a time, with progress), so a save only records keys.
 * Rows reorder with the move buttons, the arrow keys on the drag handle, or
 * by dragging the handle; every move is announced to screen readers.
 */
export function MediaSections({
  generalError,
  items,
  onChange,
  onStatusChange,
  published,
  rowErrors,
  uploadSlug,
  videoLimitBytes,
}: {
  generalError?: string;
  items: ProjectMediaItem[];
  onChange: MediaUpdate;
  onStatusChange: (status: MediaUploadStatus) => void;
  /** Whether the saved record is published, which is when its videos stream. */
  published: boolean;
  rowErrors: Record<string, string>;
  /** The slug uploads are filed under (a placeholder until the URL is valid). */
  uploadSlug: string;
  videoLimitBytes: number;
}) {
  const [meta, setMetaState] = useState<Record<string, RowMeta>>({});
  const [announcement, setAnnouncement] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [draggingId, setDraggingId] = useState<string>();
  // Async upload steps read and write the latest row state through refs, so
  // a queued job never acts on the render it was started from.
  const metaRef = useRef<Record<string, RowMeta>>({});
  const itemsRef = useRef(items);
  const slugRef = useRef(uploadSlug);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const controllers = useRef(new Map<string, AbortController>());
  const blobUrls = useRef(new Set<string>());
  const measured = useRef(new Set<string>());
  const listRef = useRef<HTMLOListElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | undefined>(undefined);
  const videoLimitMb = Math.floor(videoLimitBytes / 1024 / 1024);

  useEffect(() => {
    itemsRef.current = items;
    slugRef.current = uploadSlug;
  }, [items, uploadSlug]);

  const setMeta = (id: string, patch: RowMeta | ((current: RowMeta) => RowMeta | undefined)) => {
    const current = metaRef.current;
    const nextRow =
      typeof patch === "function" ? patch(current[id] ?? {}) : { ...current[id], ...patch };
    const next = { ...current };
    if (nextRow) next[id] = nextRow;
    else delete next[id];
    metaRef.current = next;
    setMetaState(next);
  };

  const announce = (message: string) =>
    setAnnouncement((current) => (current === message ? `${message} ` : message));

  const positionOf = (id: string) => itemsRef.current.findIndex((item) => item.id === id) + 1;

  const blobUrl = (file: File) => {
    const url = URL.createObjectURL(file);
    blobUrls.current.add(url);
    return url;
  };
  const revoke = (url?: string) => {
    if (!url || !blobUrls.current.has(url)) return;
    URL.revokeObjectURL(url);
    blobUrls.current.delete(url);
  };

  // Abort in-flight uploads and free previews when the editor goes away.
  // Queued uploads that haven't started yet check `unmounted` and never do.
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    const active = controllers.current;
    const urls = blobUrls.current;
    return () => {
      unmounted.current = true;
      for (const controller of active.values()) controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const busy = Object.values(meta).filter((row) => row.phase).length;
  // Only new sections without a file block a save; a failed replacement
  // still has its previous, valid file.
  const failed = items.filter((item) => !item.key && !meta[item.id]?.phase).length;
  useEffect(() => {
    onStatusChange({ busy, failed });
  }, [busy, failed, onStatusChange]);

  // Older records carry 0×0 sections (and saved videos never carry their
  // duration): read them back once so the next save stores the real size.
  useEffect(() => {
    for (const item of items) {
      if (!item.key) continue;
      const needsSize = !item.width || !item.height;
      const row = metaRef.current[item.id];
      const needsDuration =
        item.kind === "video" && row?.duration === undefined && !row?.previewUrl;
      const tag = `${item.id}:${item.key}`;
      if ((!needsSize && !needsDuration) || measured.current.has(tag)) continue;
      if (item.kind === "video" && !canStream(item, published)) continue;
      measured.current.add(tag);
      const fill = (width: number, height: number) => {
        if (!width || !height) return;
        onChange((current) =>
          current.map((entry) =>
            entry.id === item.id && entry.key === item.key && (!entry.width || !entry.height)
              ? { ...entry, width, height }
              : entry,
          ),
        );
      };
      const source = item.kind === "image" ? projectMediaUrl(item.key) : projectVideoUrl(item.key);
      if (!source) continue;
      const read =
        item.kind === "image"
          ? measureImage(source).then((size) => ({ ...size, duration: undefined }))
          : probeVideo(source);
      read
        .then((probe) => {
          fill(probe.width, probe.height);
          if (probe.duration !== undefined) setMeta(item.id, { duration: probe.duration });
        })
        .catch(() => {
          if (needsSize) setMeta(item.id, { measureFailed: true });
        });
    }
  }, [items, onChange, published]);

  const runJob = async (id: string) => {
    if (unmounted.current) return;
    const job = metaRef.current[id]?.job;
    if (!job) return;
    const controller = new AbortController();
    controllers.current.set(id, controller);
    const { signal } = controller;
    // Only ever patch this pick's job: a Replace starts a new job on the
    // same row, and a cancelled run finishing late must not write its size
    // or poster into the new file's job (the object URL identifies a pick).
    const patchJob = (patch: Partial<Job>) =>
      setMeta(id, (row) =>
        row.job && row.job.url === job.url ? { ...row, job: { ...row.job, ...patch } } : row,
      );
    const imageRoute = () => `/api/admin/projects/${encodeURIComponent(slugRef.current)}/media`;
    try {
      setMeta(id, { phase: "preparing", progress: undefined, error: undefined });
      let result: { key: string; width: number; height: number; posterKey?: string };
      if (job.kind === "image") {
        const prepared = await prepareImage(job.file);
        patchJob({ width: prepared.width, height: prepared.height });
        signal.throwIfAborted();
        setMeta(id, { phase: "uploading", progress: 0 });
        const { key } = await uploadWithProgress<{ key: string }>({
          body: JSON.stringify({ image: prepared.dataUrl }),
          contentType: "application/json",
          fallbackError: "The image upload failed.",
          onProgress: (progress) => setMeta(id, { progress }),
          signal,
          url: imageRoute(),
        });
        result = { key, width: prepared.width, height: prepared.height };
      } else {
        let { width, height, duration, poster, posterKey } = job;
        if (width === undefined) {
          // Unreadable metadata (a codec this browser lacks) is not fatal:
          // the bytes still upload, with the size left unknown.
          const probe = await probeVideo(job.url, { poster: true }).catch(() => undefined);
          width = probe?.width ?? 0;
          height = probe?.height ?? 0;
          duration = probe?.duration;
          poster = probe?.poster;
          patchJob({ width, height, duration, poster });
        }
        signal.throwIfAborted();
        if (poster && !posterKey) {
          setMeta(id, { phase: "poster" });
          posterKey = (
            await uploadWithProgress<{ key: string }>({
              body: JSON.stringify({ image: poster }),
              contentType: "application/json",
              fallbackError: "The poster frame upload failed.",
              signal,
              url: imageRoute(),
            })
          ).key;
          patchJob({ posterKey });
        }
        setMeta(id, { phase: "uploading", progress: 0 });
        const { key } = await uploadWithProgress<{ key: string }>({
          body: job.file,
          contentType: job.file.type,
          fallbackError: "The video upload failed.",
          onProgress: (progress) => setMeta(id, { progress }),
          signal,
          url: `/api/admin/projects/${encodeURIComponent(slugRef.current)}/video`,
        });
        result = { key, width: width ?? 0, height: height ?? 0, posterKey };
      }
      onChange((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                key: result.key,
                width: result.width,
                height: result.height,
                posterKey: result.posterKey,
              }
            : item,
        ),
      );
      setMeta(id, (row) => {
        const done = row.job;
        if (row.previewUrl && row.previewUrl !== done?.url) revoke(row.previewUrl);
        return {
          previewUrl: done?.url,
          posterPreview: done?.poster,
          duration: done?.duration,
        };
      });
      announce(`${kindLabel(job.kind)} in section ${positionOf(id)} uploaded.`);
    } catch (error) {
      if (isAbortError(error) || signal.aborted) return;
      const message = error instanceof Error ? error.message : "The upload failed.";
      setMeta(id, { phase: undefined, progress: undefined, error: message });
      announce(`Upload failed for section ${positionOf(id)}: ${message}`);
    } finally {
      if (controllers.current.get(id) === controller) controllers.current.delete(id);
    }
  };

  const enqueue = (id: string) => {
    setMeta(id, { phase: "queued", progress: undefined, error: undefined });
    queue.current = queue.current.then(() => runJob(id)).catch(() => undefined);
  };

  const checkFile = (file: File, kind?: MediaFileKind) => {
    const fileKind = mediaKindOf(file);
    if (!fileKind) return `${file.name} is not a PNG, JPEG, WebP, MP4 or WebM file.`;
    if (kind && fileKind !== kind) return `Replace an ${kind} with another ${kind}.`;
    if (fileKind === "video" && file.size > videoLimitBytes) {
      return `${file.name} is over the ${videoLimitMb} MB video limit.`;
    }
    return undefined;
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const problems: string[] = [];
    const added: ProjectMediaItem[] = [];
    let room = mediaMax - itemsRef.current.length;
    for (const file of Array.from(files)) {
      const problem = checkFile(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      if (room <= 0) {
        problems.push(`The page holds ${mediaMax} media sections at most.`);
        break;
      }
      room -= 1;
      const kind = mediaKindOf(file) as MediaFileKind;
      const id = crypto.randomUUID();
      added.push({
        id,
        kind,
        // Films read best full-bleed; screenshots with breathing room.
        size: kind === "video" ? "full" : "normal",
        key: "",
        width: 0,
        height: 0,
      });
      setMeta(id, { job: { file, kind, replacing: false, url: blobUrl(file) } });
    }
    if (added.length) {
      onChange((current) => [...current, ...added]);
      for (const item of added) enqueue(item.id);
      announce(
        `${added.length} ${added.length === 1 ? "file" : "files"} added. Uploading in order.`,
      );
    }
    if (problems.length) {
      toast.error(problems.length === 1 ? "A file was not added" : "Some files were not added", {
        description: problems.join(" "),
      });
    }
  };

  const replaceFile = (id: string, file?: File) => {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!file || !item) return;
    const problem = checkFile(file, item.kind);
    if (problem) {
      toast.error("That file cannot replace this section", { description: problem });
      return;
    }
    controllers.current.get(id)?.abort();
    setMeta(id, (row) => {
      revoke(row.job?.url);
      return {
        ...row,
        job: { file, kind: item.kind, replacing: Boolean(item.key), url: blobUrl(file) },
      };
    });
    enqueue(id);
  };

  const retry = (id: string) => {
    if (metaRef.current[id]?.job) enqueue(id);
  };

  const remove = (id: string) => {
    const position = positionOf(id);
    controllers.current.get(id)?.abort();
    setMeta(id, (row) => {
      revoke(row.job?.url);
      revoke(row.previewUrl);
      return undefined;
    });
    onChange((current) => current.filter((item) => item.id !== id));
    announce(`Section ${position} removed.`);
  };

  const setItem = (id: string, patch: Partial<ProjectMediaItem>) =>
    onChange((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  /** Moves a row to `target` (0-based); returns whether anything moved. */
  const moveTo = (id: string, target: number) => {
    const from = itemsRef.current.findIndex((item) => item.id === id);
    const to = Math.max(0, Math.min(itemsRef.current.length - 1, target));
    if (from === -1 || from === to) return false;
    const next = [...itemsRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // Keep the ref in step so rapid moves (drag, held arrow keys) chain.
    itemsRef.current = next;
    onChange((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) return current;
      const reordered = [...current];
      const [entry] = reordered.splice(index, 1);
      reordered.splice(to, 0, entry);
      return reordered;
    });
    return true;
  };

  /** Moves by one step from a button or key, keeping focus on the same control. */
  const step = (id: string, delta: -1 | 1, control: "handle" | "up" | "down") => {
    const from = itemsRef.current.findIndex((item) => item.id === id);
    if (!moveTo(id, from + delta)) return;
    const to = from + delta;
    announce(`Section moved to position ${to + 1} of ${itemsRef.current.length}.`);
    window.requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-media-row="${id}"]`);
      const preferred = row?.querySelector<HTMLButtonElement>(`[data-control="${control}"]`);
      const fallback = row?.querySelector<HTMLButtonElement>(
        `[data-control="${control === "up" ? "down" : control === "down" ? "up" : "handle"}"]`,
      );
      (preferred && !preferred.disabled ? preferred : fallback)?.focus();
    });
  };

  const startDrag = (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startIndex = itemsRef.current.findIndex((item) => item.id === id);
    setDraggingId(id);
    // preventDefault above also suppresses the compatibility mouse events,
    // so the drag never starts a text selection. Window listeners rather
    // than pointer capture: React moves the row's DOM node as the order
    // changes, which would drop a capture.
    const onMove = (moveEvent: PointerEvent) => {
      const rows = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>("[data-media-row]") ?? [],
      );
      let target = rows.length - 1;
      for (let index = 0; index < rows.length; index += 1) {
        const rect = rows[index].getBoundingClientRect();
        if (moveEvent.clientY < rect.top + rect.height / 2) {
          target = index;
          break;
        }
      }
      moveTo(id, target);
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      setDraggingId(undefined);
      const endIndex = itemsRef.current.findIndex((item) => item.id === id);
      if (endIndex !== startIndex && endIndex !== -1) {
        announce(`Section moved to position ${endIndex + 1} of ${itemsRef.current.length}.`);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const isFileDrag = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");
  const full = items.length >= mediaMax;

  return (
    <div
      className={`${cardClass} space-y-4 transition ${dropActive ? "border-brand-blue ring-4 ring-brand-blue/10" : ""}`}
      id="project-media-sections"
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
      }}
      onDragOver={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = full ? "none" : "copy";
        setDropActive(true);
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        setDropActive(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cardLabelClass}>Media sections</p>
          <p className={cardHintClass}>
            The detail page scrolls through these in order, after the title panel. The cover above
            stays the list card&apos;s image.
          </p>
        </div>
        <Counter max={mediaMax} value={items.length} />
      </div>

      <dl className="grid gap-2 rounded-xl bg-[#f5f7fb] p-3 text-xs leading-5 text-[#5d687d] sm:grid-cols-2 dark:bg-white/[0.04] dark:text-white/55">
        <div className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-1.5 font-semibold text-[#171b25] dark:text-white">
            <SizeGlyph size="normal" /> Normal
          </dt>
          <dd>padded inside the page, with rounded corners.</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-1.5 font-semibold text-[#171b25] dark:text-white">
            <SizeGlyph size="full" /> Full
          </dt>
          <dd>edge to edge, the full height of the screen.</dd>
        </div>
      </dl>

      {generalError ? (
        <p
          className="flex items-start gap-2 rounded-xl bg-brand-red-50 px-3 py-2 text-xs font-semibold text-brand-red dark:bg-brand-red/15"
          role="alert"
        >
          <WarningCircle className="mt-0.5 shrink-0" size={14} weight="bold" />
          {generalError}
        </p>
      ) : null}

      {items.length ? (
        <ol aria-label="Media sections in page order" className="space-y-2.5" ref={listRef}>
          {items.map((item, index) => {
            const row = meta[item.id] ?? {};
            const position = index + 1;
            const job = row.job && (!row.job.replacing || !row.error) ? row.job : undefined;
            const width = job?.width ?? item.width;
            const height = job?.height ?? item.height;
            const duration = job?.duration ?? row.duration;
            // Shown only while width/height are 0: the file was read (or
            // cannot be) and gave no size.
            const sizeUnknown = Boolean(
              row.measureFailed ||
              (!job &&
                item.key &&
                (row.previewUrl || (item.kind === "video" && !canStream(item, published)))),
            );
            const altError = rowErrors[item.id];
            const altId = `media-alt-${item.id}`;
            const pendingNew = !item.key;
            return (
              <li
                className={`rounded-2xl border bg-white p-3 transition dark:bg-white/[0.035] ${
                  draggingId === item.id
                    ? "border-brand-blue bg-brand-blue-50/60 shadow-[0_18px_40px_-24px_rgba(58,109,197,0.55)] dark:bg-brand-blue/10"
                    : row.error || altError
                      ? "border-brand-red/50"
                      : "border-[#dfe4ee] dark:border-white/10"
                }`}
                data-media-row={item.id}
                key={item.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex items-start gap-2">
                    <button
                      aria-label={`Reorder section ${position}. Drag, or press the up and down arrow keys.`}
                      className="grid h-[3.375rem] w-6 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-[#9aa3b5] transition hover:bg-[#f5f7fb] hover:text-brand-blue focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none active:cursor-grabbing sm:h-[4.5rem] dark:text-white/30 dark:hover:bg-white/[0.06]"
                      data-control="handle"
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                          event.preventDefault();
                          step(item.id, event.key === "ArrowUp" ? -1 : 1, "handle");
                        }
                      }}
                      onPointerDown={(event) => startDrag(item.id, event)}
                      type="button"
                    >
                      <DotsSixVertical size={16} weight="bold" />
                    </button>
                    <Thumbnail
                      item={item}
                      key={`${item.key}|${job?.url ?? ""}`}
                      meta={row}
                      published={published}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:hidden">
                      <RowFacts
                        duration={duration}
                        height={height}
                        item={item}
                        measureFailed={sizeUnknown}
                        position={position}
                        width={width}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="hidden flex-wrap items-center gap-2 sm:flex">
                      <RowFacts
                        duration={duration}
                        height={height}
                        item={item}
                        measureFailed={sizeUnknown}
                        position={position}
                        width={width}
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <label
                          className="text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45"
                          htmlFor={altId}
                        >
                          Alt text
                        </label>
                        <span className="flex h-0 items-center">
                          <Counter max={mediaAltMax} value={(item.alt ?? "").length} />
                        </span>
                      </div>
                      <input
                        aria-describedby={altError ? `${altId}-error` : undefined}
                        aria-invalid={altError ? true : undefined}
                        className={`${inputClass} ${altError ? invalidClass : ""}`}
                        id={altId}
                        maxLength={Math.max(mediaAltMax, (item.alt ?? "").length)}
                        onChange={(event) => setItem(item.id, { alt: event.target.value })}
                        placeholder={
                          item.kind === "image"
                            ? "What the image shows, for screen readers"
                            : "What happens in the video, for screen readers"
                        }
                        value={item.alt ?? ""}
                      />
                      {altError ? (
                        <p
                          className="mt-1 text-[11px] leading-5 font-semibold text-brand-red"
                          id={`${altId}-error`}
                        >
                          {altError}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <SizeControl
                        label={`Size of section ${position}`}
                        onChange={(size) => setItem(item.id, { size })}
                        value={item.size}
                      />
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`Replace the ${item.kind} in section ${position}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#5d687d] transition hover:bg-[#f5f7fb] hover:text-brand-blue dark:text-white/60 dark:hover:bg-white/10"
                          onClick={() => {
                            replaceTarget.current = item.id;
                            if (replaceInput.current) {
                              replaceInput.current.accept =
                                item.kind === "image"
                                  ? "image/png,image/jpeg,image/webp"
                                  : "video/mp4,video/webm";
                              replaceInput.current.click();
                            }
                          }}
                          type="button"
                        >
                          <UploadSimple size={14} />
                          Replace
                        </button>
                        <button
                          aria-label={`Move section ${position} up`}
                          className="grid size-8 place-items-center rounded-lg text-[#7e899e] transition hover:bg-[#f5f7fb] hover:text-brand-blue disabled:opacity-30 dark:text-white/40 dark:hover:bg-white/[0.06]"
                          data-control="up"
                          disabled={index === 0}
                          onClick={() => step(item.id, -1, "up")}
                          type="button"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          aria-label={`Move section ${position} down`}
                          className="grid size-8 place-items-center rounded-lg text-[#7e899e] transition hover:bg-[#f5f7fb] hover:text-brand-blue disabled:opacity-30 dark:text-white/40 dark:hover:bg-white/[0.06]"
                          data-control="down"
                          disabled={index === items.length - 1}
                          onClick={() => step(item.id, 1, "down")}
                          type="button"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          aria-label={`Remove section ${position}`}
                          className="grid size-8 place-items-center rounded-lg text-[#7e899e] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/40 dark:hover:bg-brand-red/15"
                          onClick={() => remove(item.id)}
                          type="button"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>

                    {row.phase ? (
                      <p
                        className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.12em] text-brand-blue uppercase"
                        data-upload-status
                      >
                        {PHASE_LABEL[row.phase]}
                        {row.phase === "uploading" && row.progress !== undefined
                          ? ` ${Math.round(row.progress * 100)}%`
                          : "…"}
                        {row.job?.replacing ? (
                          <span className="font-normal tracking-normal text-[#8490a5] normal-case">
                            The current file stays until this finishes.
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {row.error ? (
                      <div
                        className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-red-50 px-3 py-2 text-xs text-brand-red dark:bg-brand-red/15"
                        role="alert"
                      >
                        <WarningCircle className="shrink-0" size={14} weight="bold" />
                        <span className="min-w-0 flex-1 font-semibold">
                          {pendingNew
                            ? "Upload failed: "
                            : "Replacement failed (the current file is kept): "}
                          {row.error}
                        </span>
                        <button
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold transition hover:bg-white/70 dark:hover:bg-white/10"
                          onClick={() => retry(item.id)}
                          type="button"
                        >
                          <ArrowClockwise size={13} weight="bold" />
                          Retry
                        </button>
                        {pendingNew ? null : (
                          <button
                            className="rounded-lg px-2 py-1 font-semibold transition hover:bg-white/70 dark:hover:bg-white/10"
                            onClick={() =>
                              setMeta(item.id, (current) => {
                                revoke(current.job?.url);
                                return { ...current, job: undefined, error: undefined };
                              })
                            }
                            type="button"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      <button
        className={`grid w-full place-items-center gap-1.5 rounded-xl border border-dashed px-4 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
          items.length ? "py-5" : "py-10"
        } ${
          dropActive
            ? "border-brand-blue bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15"
            : "border-[#c6cedd] text-[#5d687d] hover:border-brand-blue hover:text-brand-blue dark:border-white/15 dark:text-white/55"
        }`}
        disabled={full}
        onClick={() => addInput.current?.click()}
        type="button"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <UploadSimple size={17} weight="bold" />
          {full ? `All ${mediaMax} sections used` : dropActive ? "Drop to add" : "Add media"}
        </span>
        <span className="text-xs text-[#8490a5] dark:text-white/40">
          or drop files here. PNG, JPEG or WebP up to 3840 px · MP4 or WebM up to {videoLimitMb} MB
        </span>
      </button>

      <input
        accept={MEDIA_ACCEPT}
        aria-label="Add media files"
        className="hidden"
        multiple
        onChange={(event) => {
          addFiles(event.target.files);
          event.currentTarget.value = "";
        }}
        ref={addInput}
        type="file"
      />
      <input
        aria-label="Replacement file"
        className="hidden"
        onChange={(event) => {
          const target = replaceTarget.current;
          if (target) replaceFile(target, event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
        ref={replaceInput}
        type="file"
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function RowFacts({
  duration,
  height,
  item,
  measureFailed,
  position,
  width,
}: {
  duration?: number;
  height: number;
  item: ProjectMediaItem;
  measureFailed?: boolean;
  position: number;
  width: number;
}) {
  const formatted = formatDuration(duration);
  return (
    <>
      <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] dark:text-white/35">
        {String(position).padStart(2, "0")}
      </span>
      <span
        className={`w-fit rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] uppercase ${
          item.kind === "image"
            ? "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20"
            : "bg-brand-red-50 text-brand-red dark:bg-brand-red/15"
        }`}
      >
        {kindLabel(item.kind)}
      </span>
      <span className="font-mono text-[11px] text-[#5d687d] tabular-nums dark:text-white/55">
        {width && height ? `${width}×${height}` : measureFailed ? "Size unknown" : "Reading size…"}
      </span>
      {formatted ? (
        <span className="font-mono text-[11px] text-[#5d687d] tabular-nums dark:text-white/55">
          {formatted}
        </span>
      ) : null}
    </>
  );
}
