"use client";

/**
 * Picks the image or video for a form (covers, question media, picture
 * choice options, the welcome and ending screens): an upload to the form's
 * media route (images compressed like the project editor does, videos
 * streamed raw with progress), an external link, or a YouTube or Vimeo
 * video. Then alt text, caption, fit, focal point and playback options.
 */

import {
  CloudArrowUp,
  Crosshair,
  FilmStrip,
  Image as ImageIcon,
  LinkSimple,
  PencilSimple,
  PlayCircle,
  Trash,
  X,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { SAFE_URL_PATTERN, type FormMedia } from "@repo/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  IMAGE_UPLOAD_MAX_BYTES,
  isAbortError,
  measureImage,
  prepareImage,
  probeVideo,
  uploadWithProgress,
} from "@/components/admin/project-editor/media-files";
import {
  mediaPreviewUrl,
  parseVideoLink,
  rememberPreview,
  vimeoThumb,
  youtubeThumb,
} from "@/lib/forms/builder-media";

import {
  Dialog,
  Field,
  Segmented,
  Switch,
  eyebrowClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallInputClass,
} from "./ui";

export type MediaPickerProps = {
  formId: string;
  value: FormMedia | undefined;
  onChange: (media: FormMedia | undefined) => void;
  label: string;
  /** Which sources are offered; default ["image","video","embed"]. */
  accept?: ("image" | "video" | "embed")[];
  /** Show the focal point picker (covers). */
  focal?: boolean;
  /** A smaller trigger for tight spots (option images). */
  compact?: boolean;
};

type Source = "image" | "video" | "embed";
type Tab = "upload" | "link" | "embed";

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const VIDEO_MIMES = ["video/mp4", "video/webm"];

function acceptAttr(accept: Source[]) {
  return [
    ...(accept.includes("image") ? IMAGE_MIMES : []),
    ...(accept.includes("video") ? VIDEO_MIMES : []),
  ].join(",");
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This file could not be read."));
    reader.readAsDataURL(file);
  });
}

function imageSize(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("This image could not be read."));
    image.src = dataUrl;
  });
}

const int = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? undefined
    : Math.max(0, Math.min(20_000, Math.round(value)));

/** Uploads one file to the form's media route; returns the media it becomes. */
async function uploadMediaFile(
  file: File,
  formId: string,
  accept: Source[],
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<FormMedia> {
  const url = `/api/admin/forms/${encodeURIComponent(formId)}/media`;
  if (IMAGE_MIMES.includes(file.type)) {
    if (!accept.includes("image")) throw new Error("Images aren't accepted here.");
    let prepared: { dataUrl: string; width: number; height: number };
    if (file.type === "image/gif") {
      // Re-encoding would drop the animation, so a GIF goes up as it is.
      if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
        throw new Error("GIFs must be under 5.5 MB. Try a shorter clip or an MP4.");
      }
      const dataUrl = await readAsDataUrl(file);
      prepared = { dataUrl, ...(await imageSize(dataUrl)) };
    } else {
      prepared = await prepareImage(file);
    }
    const { key } = await uploadWithProgress<{ key: string }>({
      url,
      body: JSON.stringify({ image: prepared.dataUrl }),
      contentType: "application/json",
      fallbackError: "The image could not be uploaded.",
      onProgress,
      signal,
    });
    rememberPreview(key, prepared.dataUrl);
    return { kind: "image", key, width: int(prepared.width), height: int(prepared.height) };
  }
  if (VIDEO_MIMES.includes(file.type)) {
    if (!accept.includes("video")) throw new Error("Videos aren't accepted here.");
    const objectUrl = URL.createObjectURL(file);
    let size: { width?: number; height?: number } = {};
    try {
      const probe = await probeVideo(objectUrl);
      size = { width: probe.width, height: probe.height };
    } catch {
      // The size is a nicety; the upload still works without it.
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    const { key } = await uploadWithProgress<{ key: string }>({
      url,
      body: file,
      contentType: file.type,
      fallbackError: "The video could not be uploaded.",
      onProgress,
      signal,
    });
    return {
      kind: "video",
      key,
      width: int(size.width),
      height: int(size.height),
      muted: true,
      loop: true,
      autoplay: true,
    };
  }
  throw new Error(
    accept.includes("video")
      ? "Use a PNG, JPEG, WebP or GIF image, or an MP4 or WebM video."
      : "Use a PNG, JPEG, WebP or GIF image.",
  );
}

function kindLabel(kind: FormMedia["kind"]) {
  return { image: "Image", video: "Video", youtube: "YouTube", vimeo: "Vimeo" }[kind];
}

/** The picture a media item is shown with (a thumbnail for embeds, the file for uploads). */
function MediaThumb({
  className,
  media,
  withFocal = true,
}: {
  className: string;
  media: FormMedia;
  withFocal?: boolean;
}) {
  const src = mediaPreviewUrl(media);
  const [failed, setFailed] = useState(false);
  const [lastSrc, setLastSrc] = useState(src);
  if (src !== lastSrc) {
    setLastSrc(src);
    setFailed(false);
  }
  const position = withFocal ? `${media.focalX ?? 50}% ${media.focalY ?? 50}%` : undefined;
  const fit = media.fit === "contain" ? "object-contain" : "object-cover";
  if (!src || failed) {
    return (
      <span
        className={`grid place-items-center bg-[#eef1f7] text-[#8490a5] dark:bg-white/[0.06] dark:text-white/35 ${className}`}
      >
        {media.kind === "image" ? <ImageIcon size={22} /> : <FilmStrip size={22} />}
      </span>
    );
  }
  if (media.kind === "video") {
    return (
      <video
        aria-hidden="true"
        className={`${fit} ${className}`}
        muted
        onError={() => setFailed(true)}
        playsInline
        preload="metadata"
        src={src}
        style={{ objectPosition: position }}
      />
    );
  }
  return (
    // Admin previews use the raw file or thumbnail, like the rest of the editor.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={`${fit} ${className}`}
      onError={() => setFailed(true)}
      src={src}
      style={{ objectPosition: position }}
    />
  );
}

/** Click or drag on the picture to place the focal point; arrow keys nudge it. */
function FocalPointPicker({
  media,
  onChange,
}: {
  media: FormMedia;
  onChange: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const x = media.focalX ?? 50;
  const y = media.focalY ?? 50;
  const place = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const nextX = Math.round(
      Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
    );
    const nextY = Math.round(
      Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    );
    onChange(nextX, nextY);
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
          Focal point
        </span>
        <button
          className="text-[11px] font-semibold text-brand-blue hover:underline"
          onClick={() => onChange(50, 50)}
          type="button"
        >
          Centre
        </button>
      </div>
      <div
        aria-label={`Focal point, ${x}% from the left, ${y}% from the top. Use the arrow keys to move it.`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={x}
        aria-valuetext={`${x}% across, ${y}% down`}
        className="relative cursor-crosshair touch-none overflow-hidden rounded-xl bg-[#eef1f7] select-none focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none dark:bg-white/[0.05]"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 2;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          onChange(
            Math.min(100, Math.max(0, x + move[0])),
            Math.min(100, Math.max(0, y + move[1])),
          );
        }}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          place(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (dragging.current) place(event.clientX, event.clientY);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        ref={ref}
        role="slider"
        tabIndex={0}
      >
        <MediaThumb
          className="pointer-events-none block max-h-72 w-full"
          media={{ ...media, fit: "contain" }}
          withFocal={false}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-7 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.45),0_4px_14px_rgba(0,0,0,0.35)]"
          style={{ left: `${x}%`, top: `${y}%`, marginLeft: -14, marginTop: -14 }}
        >
          <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
        The part of the picture that stays in view when a cover crops it.
      </p>
    </div>
  );
}

function DropZone({
  accept,
  busy,
  onFile,
  progress,
  onCancel,
}: {
  accept: Source[];
  busy: boolean;
  onFile: (file: File) => void;
  progress: number;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const inputId = useId();
  const kinds = [
    accept.includes("image") ? "PNG, JPEG, WebP or GIF" : null,
    accept.includes("video") ? "MP4 or WebM video" : null,
  ]
    .filter(Boolean)
    .join(", or ");
  if (busy) {
    const percent = Math.round(progress * 100);
    return (
      <div
        aria-live="polite"
        className="rounded-2xl border border-[#dfe4ee] bg-white p-6 text-center dark:border-white/10 dark:bg-white/[0.035]"
      >
        <p className="text-sm font-semibold text-[#2b3345] dark:text-white/85">
          {progress > 0 ? `Uploading… ${percent}%` : "Preparing the file…"}
        </p>
        <div
          aria-label="Upload progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="mx-auto mt-3 h-2 max-w-sm overflow-hidden rounded-full bg-[#e6eaf2] dark:bg-white/10"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-brand-blue transition-[width] duration-200"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>
        <button className={`${ghostButtonClass} mt-3`} onClick={onCancel} type="button">
          <X size={14} weight="bold" />
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-8 ${over ? "border-brand-blue bg-brand-blue-50/70 dark:bg-brand-blue/10" : "border-[#cfd6e3] bg-white hover:border-brand-blue/50 dark:border-white/15 dark:bg-white/[0.02]"}`}
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <CloudArrowUp className="mx-auto text-brand-blue" size={34} weight="duotone" />
      <p className="mt-2 text-sm font-semibold text-[#2b3345] dark:text-white/85">
        Drop a file here, or{" "}
        <label
          className="cursor-pointer text-brand-blue underline-offset-2 hover:underline"
          htmlFor={inputId}
        >
          browse
        </label>
      </p>
      <p className="mt-1 text-xs leading-5 text-[#8490a5] dark:text-white/40">
        {kinds}. Large images are resized to fit.
      </p>
      <input
        accept={acceptAttr(accept)}
        className="sr-only"
        id={inputId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
        ref={inputRef}
        type="file"
      />
      <button
        className={`${secondaryButtonClass} mt-4`}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        Choose a file
      </button>
    </div>
  );
}

function MediaDialog({
  accept,
  focal,
  formId,
  initial,
  initialFile,
  label,
  onClose,
  onUse,
}: {
  accept: Source[];
  focal: boolean;
  formId: string;
  initial: FormMedia | undefined;
  initialFile?: File;
  label: string;
  onClose: () => void;
  onUse: (media: FormMedia) => void;
}) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    ...(accept.includes("image") || accept.includes("video")
      ? [{ id: "upload" as const, label: "Upload", icon: <CloudArrowUp size={15} /> }]
      : []),
    ...(accept.includes("image") || accept.includes("video")
      ? [{ id: "link" as const, label: "Link", icon: <LinkSimple size={15} /> }]
      : []),
    ...(accept.includes("embed")
      ? [{ id: "embed" as const, label: "YouTube & Vimeo", icon: <YoutubeLogo size={15} /> }]
      : []),
  ];
  const initialTab: Tab =
    initial?.kind === "youtube" || initial?.kind === "vimeo"
      ? "embed"
      : initial?.url && !initial.key
        ? "link"
        : (tabs[0]?.id ?? "upload");
  const [tab, setTab] = useState<Tab>(
    tabs.some((item) => item.id === initialTab) ? initialTab : tabs[0].id,
  );
  const [draft, setDraft] = useState<FormMedia | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  const [linkUrl, setLinkUrl] = useState(
    initial?.url && (initial.kind === "image" || initial.kind === "video") ? initial.url : "",
  );
  const [linkKind, setLinkKind] = useState<"image" | "video">(
    initial?.kind === "video" || !accept.includes("image") ? "video" : "image",
  );
  const [embedUrl, setEmbedUrl] = useState(
    initial?.kind === "youtube" || initial?.kind === "vimeo" ? (initial.url ?? "") : "",
  );

  const patch = (next: Partial<FormMedia>) =>
    setDraft((current) => (current ? { ...current, ...next } : current));

  const upload = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setProgress(0);
      try {
        const media = await uploadMediaFile(file, formId, accept, setProgress, controller.signal);
        setDraft((current) => ({
          ...media,
          alt: current?.alt,
          caption: current?.caption,
          focalX: current?.focalX,
          focalY: current?.focalY,
          fit: current?.fit,
        }));
      } catch (error) {
        if (!isAbortError(error)) {
          toast.error("Upload failed", {
            description: error instanceof Error ? error.message : "Try again in a moment.",
          });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [accept, formId],
  );

  const startedRef = useRef(false);
  useEffect(() => {
    if (initialFile && !startedRef.current) {
      startedRef.current = true;
      void upload(initialFile);
    }
  }, [initialFile, upload]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const linkValid = SAFE_URL_PATTERN.test(linkUrl.trim()) && /^https?:\/\//i.test(linkUrl.trim());
  const applyLink = async () => {
    const url = linkUrl.trim();
    if (!linkValid) return;
    let size: { width?: number; height?: number } = {};
    try {
      size =
        linkKind === "image"
          ? await measureImage(url)
          : await probeVideo(url).then((probe) => ({ width: probe.width, height: probe.height }));
    } catch {
      toast.message("Couldn't load that link to measure it", {
        description: "It is kept anyway; check that the address opens in a browser.",
      });
    }
    setDraft((current) => ({
      kind: linkKind,
      url,
      width: int(size.width),
      height: int(size.height),
      alt: current?.alt,
      caption: current?.caption,
      focalX: current?.focalX,
      focalY: current?.focalY,
      fit: current?.fit,
      ...(linkKind === "video" ? { muted: true, loop: true, autoplay: true } : {}),
    }));
  };

  const video = parseVideoLink(embedUrl);
  const applyEmbed = () => {
    if (!video) return;
    setDraft((current) => ({
      kind: video.kind,
      url: video.url,
      alt: current?.alt,
      caption: current?.caption,
      fit: current?.fit,
    }));
  };

  const isFileVideo = draft?.kind === "video";
  const isEmbed = draft?.kind === "youtube" || draft?.kind === "vimeo";

  return (
    <Dialog
      description="Upload a file, link one, or embed a YouTube or Vimeo video."
      footer={
        <>
          <button className={secondaryButtonClass} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={primaryButtonClass}
            disabled={!draft || busy}
            onClick={() => draft && onUse(draft)}
            type="button"
          >
            Use media
          </button>
        </>
      }
      onClose={onClose}
      size="lg"
      title={label}
    >
      {tabs.length > 1 ? (
        <div
          aria-label="Media source"
          className="flex flex-wrap gap-1 rounded-xl border border-[#dfe4ee] bg-[#f1f4f9] p-1 dark:border-white/10 dark:bg-white/[0.04]"
          role="tablist"
        >
          {tabs.map((item, index) => {
            const selected = item.id === tab;
            return (
              <button
                aria-controls={`${baseId}-panel`}
                aria-selected={selected}
                className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap transition focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none max-sm:h-11 ${selected ? "bg-white text-[#171b25] shadow-[0_4px_12px_-8px_rgba(20,32,58,0.6)] dark:bg-white/15 dark:text-white" : "text-[#69748a] hover:text-[#171b25] dark:text-white/50 dark:hover:text-white"}`}
                id={`${baseId}-tab-${item.id}`}
                key={item.id}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  if (!delta) return;
                  event.preventDefault();
                  const next = (index + delta + tabs.length) % tabs.length;
                  setTab(tabs[next].id);
                  tabRefs.current[next]?.focus();
                }}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="mt-4"
        id={`${baseId}-panel`}
        role="tabpanel"
      >
        {tab === "upload" ? (
          <DropZone
            accept={accept}
            busy={busy}
            onCancel={() => abortRef.current?.abort()}
            onFile={(file) => void upload(file)}
            progress={progress}
          />
        ) : tab === "link" ? (
          <div className="space-y-3">
            {accept.includes("image") && accept.includes("video") ? (
              <Segmented
                label="Link kind"
                onChange={setLinkKind}
                options={[
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video file" },
                ]}
                value={linkKind}
              />
            ) : null}
            <Field
              error={linkUrl.trim() && !linkValid ? "Use a full https:// address." : undefined}
              htmlFor={`${baseId}-link`}
              label={linkKind === "image" ? "Image address" : "Video address (MP4 or WebM)"}
            >
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  id={`${baseId}-link`}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void applyLink();
                    }
                  }}
                  placeholder="https://…"
                  value={linkUrl}
                />
                <button
                  className={secondaryButtonClass}
                  disabled={!linkValid}
                  onClick={() => void applyLink()}
                  type="button"
                >
                  Load
                </button>
              </div>
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            <Field
              error={
                embedUrl.trim() && !video
                  ? "That doesn't look like a YouTube or Vimeo link."
                  : undefined
              }
              hint="Any share link works: youtu.be, youtube.com/watch, shorts, or vimeo.com."
              htmlFor={`${baseId}-embed`}
              label="Video link"
            >
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  id={`${baseId}-embed`}
                  onChange={(event) => setEmbedUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyEmbed();
                    }
                  }}
                  placeholder="https://youtu.be/…"
                  value={embedUrl}
                />
                <button
                  className={secondaryButtonClass}
                  disabled={!video}
                  onClick={applyEmbed}
                  type="button"
                >
                  Use
                </button>
              </div>
            </Field>
            {video ? (
              <div className="flex items-center gap-3 rounded-xl border border-[#dfe4ee] bg-white p-2 dark:border-white/10 dark:bg-white/[0.035]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  className="aspect-video w-28 shrink-0 rounded-lg bg-[#eef1f7] object-cover"
                  src={video.kind === "youtube" ? youtubeThumb(video.id) : vimeoThumb(video.id)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {video.kind === "youtube" ? "YouTube" : "Vimeo"} video
                  </p>
                  <p className="truncate font-mono text-[11px] text-[#8490a5] dark:text-white/40">
                    {video.url}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {draft ? (
        <div className="mt-6 border-t border-[#e3e7f0] pt-5 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <p className={eyebrowClass}>Selected · {kindLabel(draft.kind)}</p>
            <button
              className="text-xs font-semibold text-brand-red hover:underline"
              onClick={() => setDraft(undefined)}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              {focal && !isEmbed ? (
                <FocalPointPicker
                  media={draft}
                  onChange={(focalX, focalY) => patch({ focalX, focalY })}
                />
              ) : (
                <div className="relative overflow-hidden rounded-xl bg-[#eef1f7] dark:bg-white/[0.05]">
                  <MediaThumb className="block aspect-video w-full" media={draft} />
                  {isEmbed ? (
                    <PlayCircle
                      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-lg"
                      size={44}
                      weight="fill"
                    />
                  ) : null}
                </div>
              )}
              {draft.width && draft.height ? (
                <p className="mt-1.5 font-mono text-[10px] text-[#9ba4b5] dark:text-white/35">
                  {draft.width} × {draft.height}
                </p>
              ) : null}
            </div>
            <div className="space-y-3.5">
              <Field
                hint={
                  draft.kind === "image"
                    ? "Describe the picture for people using screen readers. Leave empty if it's decoration."
                    : undefined
                }
                htmlFor={`${baseId}-alt`}
                label={draft.kind === "image" ? "Alt text" : "Title for screen readers"}
              >
                <input
                  className={smallInputClass}
                  id={`${baseId}-alt`}
                  maxLength={300}
                  onChange={(event) => patch({ alt: event.target.value || undefined })}
                  value={draft.alt ?? ""}
                />
              </Field>
              <Field htmlFor={`${baseId}-caption`} label="Caption">
                <input
                  className={smallInputClass}
                  id={`${baseId}-caption`}
                  maxLength={300}
                  onChange={(event) => patch({ caption: event.target.value || undefined })}
                  placeholder="Optional"
                  value={draft.caption ?? ""}
                />
              </Field>
              {!isEmbed ? (
                <div>
                  <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
                    Fit
                  </span>
                  <Segmented
                    label="Fit"
                    onChange={(fit) => patch({ fit })}
                    options={[
                      { value: "cover", label: "Fill (crop)" },
                      { value: "contain", label: "Fit (whole)" },
                    ]}
                    size="sm"
                    value={draft.fit ?? "cover"}
                  />
                </div>
              ) : null}
              {isFileVideo ? (
                <div className="space-y-2.5 rounded-xl border border-[#e3e7f0] p-3 dark:border-white/10">
                  <Switch
                    checked={draft.autoplay ?? false}
                    label="Autoplay"
                    onChange={(autoplay) =>
                      patch(autoplay ? { autoplay, muted: true } : { autoplay })
                    }
                    size="sm"
                  />
                  <Switch
                    checked={draft.loop ?? false}
                    label="Loop"
                    onChange={(loop) => patch({ loop })}
                    size="sm"
                  />
                  <Switch
                    checked={draft.muted ?? false}
                    description={draft.autoplay ? "Browsers only autoplay muted video." : undefined}
                    disabled={draft.autoplay}
                    label="Muted"
                    onChange={(muted) => patch({ muted })}
                    size="sm"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

export function MediaPicker({
  accept = ["image", "video", "embed"],
  compact = false,
  focal = false,
  formId,
  label,
  onChange,
  value,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File>();
  const [over, setOver] = useState(false);
  const acceptsFiles = accept.includes("image") || accept.includes("video");
  const emptyLabel = accept.includes("image")
    ? accept.includes("video") || accept.includes("embed")
      ? "Add image or video"
      : "Add image"
    : "Add video";

  const openWith = (file?: File) => {
    setPendingFile(file);
    setOpen(true);
  };

  const dropProps = acceptsFiles
    ? {
        onDragLeave: () => setOver(false),
        onDragOver: (event: React.DragEvent) => {
          event.preventDefault();
          setOver(true);
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) openWith(file);
        },
      }
    : {};

  const dialog = open ? (
    <MediaDialog
      accept={accept}
      focal={focal}
      formId={formId}
      initial={value}
      initialFile={pendingFile}
      label={label}
      onClose={() => {
        setOpen(false);
        setPendingFile(undefined);
      }}
      onUse={(media) => {
        onChange(media);
        setOpen(false);
        setPendingFile(undefined);
      }}
    />
  ) : null;

  if (!value) {
    return (
      <>
        <button
          aria-label={`${label}: ${emptyLabel}`}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-semibold transition focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none ${compact ? "h-11 px-2 text-xs" : "h-24 flex-col px-4"} ${over ? "border-brand-blue bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15" : "border-[#c6cedd] bg-white/60 text-[#5d687d] hover:border-brand-blue hover:text-brand-blue dark:border-white/15 dark:bg-white/[0.02] dark:text-white/55"}`}
          onClick={() => openWith()}
          type="button"
          {...dropProps}
        >
          <ImageIcon size={compact ? 16 : 22} weight="duotone" />
          <span>{compact ? "Image" : emptyLabel}</span>
          {!compact && acceptsFiles ? (
            <span className="text-[11px] font-normal text-[#9ba4b5] dark:text-white/35">
              or drop a file here
            </span>
          ) : null}
        </button>
        {dialog}
      </>
    );
  }

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-2">
          <button
            aria-label={`${label}: change`}
            className="relative size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-[#dfe4ee] focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none dark:ring-white/10"
            onClick={() => openWith()}
            type="button"
            {...dropProps}
          >
            <MediaThumb className="size-full" media={value} />
          </button>
          <button
            aria-label={`Remove ${label.toLowerCase()}`}
            className="grid size-8 place-items-center rounded-lg text-[#8490a5] transition hover:bg-brand-red-50 hover:text-brand-red"
            onClick={() => onChange(undefined)}
            title="Remove"
            type="button"
          >
            <Trash size={15} />
          </button>
        </div>
        {dialog}
      </>
    );
  }

  return (
    <>
      <div
        className={`overflow-hidden rounded-xl border bg-white transition dark:bg-white/[0.035] ${over ? "border-brand-blue ring-4 ring-brand-blue/15" : "border-[#dfe4ee] dark:border-white/10"}`}
        {...dropProps}
      >
        <div className="relative bg-[#eef1f7] dark:bg-white/[0.05]">
          <MediaThumb className="block aspect-video w-full" media={value} />
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-white uppercase backdrop-blur">
            {value.kind === "image" ? (
              <ImageIcon size={11} weight="bold" />
            ) : value.kind === "video" ? (
              <FilmStrip size={11} weight="bold" />
            ) : (
              <PlayCircle size={11} weight="bold" />
            )}
            {kindLabel(value.kind)}
          </span>
          {focal && value.kind !== "youtube" && value.kind !== "vimeo" ? (
            <span
              aria-hidden="true"
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${value.focalX ?? 50}%`, top: `${value.focalY ?? 50}%` }}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
          <p className="min-w-0 flex-1 truncate px-1 text-xs text-[#69748a] dark:text-white/45">
            {value.alt ? (
              value.alt
            ) : value.kind === "image" ? (
              <span className="italic">No alt text</span>
            ) : (
              (value.caption ?? kindLabel(value.kind))
            )}
          </p>
          <button className={ghostButtonClass} onClick={() => openWith()} type="button">
            <PencilSimple size={14} />
            Edit
          </button>
          {focal ? (
            <button
              aria-label="Set focal point"
              className={ghostButtonClass}
              onClick={() => openWith()}
              title="Focal point"
              type="button"
            >
              <Crosshair size={14} />
            </button>
          ) : null}
          <button
            aria-label={`Remove ${label.toLowerCase()}`}
            className={`${ghostButtonClass} hover:bg-brand-red-50 hover:text-brand-red dark:hover:bg-brand-red/15`}
            onClick={() => onChange(undefined)}
            type="button"
          >
            <Trash size={14} />
            Remove
          </button>
        </div>
      </div>
      {dialog}
    </>
  );
}
