"use client";

import { Check, FloppyDisk, VideoCamera, YoutubeLogo } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HOME_VIDEO_MODES, type HomeContent, type HomeVideoMode } from "@repo/shared";
import { formatVideoSize } from "@/lib/project-cms";

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
const textareaClass =
  "w-full rounded-xl border border-[#d9dfeb] bg-white px-3 py-2.5 text-sm leading-6 text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

function Field({
  children,
  label,
  hint,
}: Readonly<{ children: React.ReactNode; label: string; hint?: string }>) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs text-[#8b93a6] dark:text-white/40">{hint}</span>
      ) : null}
    </label>
  );
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string; message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    return message || body.error || fallback;
  } catch {
    return fallback;
  }
}

type FormState = {
  videoMode: HomeVideoMode;
  videoKey?: string;
  videoName?: string;
  videoSize?: number;
  videoUrl: string;
  videoTitle: string;
  videoDescription: string;
};

const toForm = (content: HomeContent): FormState => ({
  videoMode: content.videoMode,
  videoKey: content.videoKey,
  videoName: content.videoName,
  videoSize: content.videoSize,
  videoUrl: content.videoUrl ?? "",
  videoTitle: content.videoTitle,
  videoDescription: content.videoDescription,
});

const VIDEO_MODE_LABELS: Record<HomeVideoMode, string> = {
  none: "None",
  upload: "Upload",
  url: "Video URL",
  youtube: "YouTube",
};

/** Uploads the file for "upload" mode, or clears any stale upload fields otherwise. */
async function applyVideoUpload(
  mode: HomeVideoMode,
  videoFile: File | undefined,
  payload: HomeContent,
): Promise<HomeContent> {
  if (mode !== "upload") {
    return { ...payload, videoKey: undefined, videoName: undefined, videoSize: undefined };
  }
  if (!videoFile) return payload;

  const response = await fetch("/api/admin/home-content/video", {
    body: videoFile,
    headers: { "content-type": videoFile.type },
    method: "POST",
  });
  if (!response.ok) throw new Error(await responseError(response, "Video upload failed."));
  const uploaded = (await response.json()) as { key: string; size: number };
  return {
    ...payload,
    videoKey: uploaded.key,
    videoName: payload.videoName?.trim() || videoFile.name,
    videoSize: uploaded.size,
  };
}

function VideoSourceFields({
  form,
  ready,
  videoFile,
  videoInput,
  videoLimitMb,
  onUrlChange,
  onChooseVideo,
  onRemoveVideo,
}: Readonly<{
  form: FormState;
  ready: boolean;
  videoFile: File | undefined;
  videoInput: React.RefObject<HTMLInputElement | null>;
  videoLimitMb: number;
  onUrlChange: (value: string) => void;
  onChooseVideo: (file: File | undefined) => void;
  onRemoveVideo: () => void;
}>) {
  if (form.videoMode === "upload") {
    return (
      <div className="mt-3 rounded-2xl border border-[#dfe4ee] bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]">
        {videoFile || form.videoKey ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15">
              <VideoCamera size={20} weight="duotone" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {videoFile?.name ?? form.videoName ?? "home video"}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-[#8490a5]">
                {videoFile
                  ? `${formatVideoSize(videoFile.size)} · not uploaded yet`
                  : (formatVideoSize(form.videoSize) ?? "uploaded")}
              </span>
            </span>
            <button
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:bg-white hover:text-brand-blue dark:text-white/60 dark:hover:bg-white/10"
              onClick={() => videoInput.current?.click()}
              type="button"
            >
              Replace
            </button>
            <button
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/60 dark:hover:bg-brand-red/15"
              onClick={onRemoveVideo}
              type="button"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            className="grid w-full place-items-center gap-2 rounded-xl border border-dashed border-brand-blue/40 bg-brand-blue/[0.04] px-4 py-10 text-center transition hover:border-brand-blue hover:bg-brand-blue/[0.07]"
            onClick={() => videoInput.current?.click()}
            type="button"
          >
            <VideoCamera className="text-brand-blue" size={30} weight="duotone" />
            <span className="text-sm font-semibold text-brand-blue">Upload the video</span>
            <span className="font-mono text-[10px] tracking-[0.12em] text-[#8490a5] uppercase">
              MP4 or WebM · up to {videoLimitMb} MB
            </span>
          </button>
        )}
        <input
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={(event) => {
            onChooseVideo(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
          ref={videoInput}
          type="file"
        />
      </div>
    );
  }

  if (form.videoMode === "url") {
    return (
      <div className="mt-3">
        <Field hint="A direct video file link." label="Video URL">
          <input
            className={inputClass}
            disabled={!ready}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://.../video.mp4"
            value={form.videoUrl}
          />
        </Field>
      </div>
    );
  }

  if (form.videoMode === "youtube") {
    return (
      <div className="mt-3">
        <Field label="YouTube URL">
          <div className="flex items-center gap-1.5">
            <YoutubeLogo className="shrink-0 text-[#8490a5]" size={16} />
            <input
              className={inputClass}
              disabled={!ready}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              value={form.videoUrl}
            />
          </div>
        </Field>
      </div>
    );
  }

  return null;
}

export function HomeSettingsEditor({
  onDirtyChange,
}: Readonly<{ onDirtyChange: (dirty: boolean) => void }>) {
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<FormState>({
    videoMode: "none",
    videoUrl: "",
    videoTitle: "",
    videoDescription: "",
  });
  const [baseline, setBaseline] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [videoFile, setVideoFile] = useState<File>();
  const videoInput = useRef<HTMLInputElement>(null);
  // Matches the API's own default ceiling (CMS_MAX_VIDEO_BYTES) — the
  // authoritative check happens server-side regardless; this only avoids an
  // upload attempt the server will reject anyway.
  const videoLimitMb = Math.floor(524_288_000 / 1024 / 1024);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      setLoadError(undefined);
      try {
        const response = await fetch("/api/admin/home-content");
        if (!response.ok) throw new Error(await responseError(response, "The request failed."));
        const data = (await response.json()) as { record?: HomeContent };
        if (!data.record) throw new Error("The response did not include a record.");
        if (cancelled) return;
        const next = toForm(data.record);
        setForm(next);
        setBaseline(JSON.stringify(next));
        setReady(true);
      } catch (error_) {
        if (cancelled) return;
        const detail = error_ instanceof Error ? error_.message : "The request failed.";
        setLoadError(`Home content could not be loaded. ${detail}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const isDirty = ready && (JSON.stringify(form) !== baseline || Boolean(videoFile));

  const update = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onDirtyChange(JSON.stringify(next) !== baseline || Boolean(videoFile));
    if (status === "saved") setStatus("idle");
  };

  const chooseVideo = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "video/mp4" && file.type !== "video/webm") {
      toast.error("The video must be an MP4 or WebM file.");
      return;
    }
    if (file.size > videoLimitMb * 1024 * 1024) {
      toast.error(`The video must be under ${videoLimitMb} MB.`);
      return;
    }
    setVideoFile(file);
    onDirtyChange(true);
    if (status === "saved") setStatus("idle");
  };

  let saveLabel = "Save changes";
  if (status === "saving") saveLabel = "Saving…";
  else if (status === "saved" && !isDirty) saveLabel = "Saved";

  const save = async () => {
    if ((form.videoMode === "url" || form.videoMode === "youtube") && !form.videoUrl.trim()) {
      toast.error("Add a video URL for this mode.");
      return;
    }
    setStatus("saving");
    setError(undefined);
    try {
      const basePayload: HomeContent = {
        videoMode: form.videoMode,
        videoKey: form.videoKey,
        videoName: form.videoName,
        videoSize: form.videoSize,
        videoUrl: form.videoUrl.trim() || undefined,
        videoTitle: form.videoTitle.trim(),
        videoDescription: form.videoDescription.trim(),
      };
      const payload = await applyVideoUpload(form.videoMode, videoFile, basePayload);

      const response = await fetch("/api/admin/home-content", {
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) throw new Error(await responseError(response, "Save failed."));
      const data = (await response.json()) as { record: HomeContent };
      const next = toForm(data.record);
      setForm(next);
      setBaseline(JSON.stringify(next));
      setVideoFile(undefined);
      onDirtyChange(false);
      setStatus("saved");
      toast.success("Home content saved");
    } catch (saveError) {
      setStatus("error");
      const message =
        saveError instanceof Error ? saveError.message : "The changes could not be saved.";
      setError(message);
      toast.error("Home content was not saved", { description: message });
    }
  };

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-start justify-between gap-5 border-b border-[#dee4ef] pb-7 dark:border-white/10">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
            Home
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            Homepage video
          </h1>
          <p className="mt-2 text-sm text-[#69748a] dark:text-white/50">
            The video block shown on the homepage below the Trusted By strip — its title, short
            description, and source.
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15 dark:text-brand-red-100"
          role="alert"
        >
          <span>{loadError}</span>
          <button
            className="rounded-lg border border-current px-3 py-1.5 font-semibold transition hover:bg-white/50 dark:hover:bg-white/10"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5">
        <Field label="Video title">
          <input
            className={inputClass}
            disabled={!ready}
            onChange={(event) => update({ videoTitle: event.target.value })}
            placeholder="See how we build"
            value={form.videoTitle}
          />
        </Field>
        <Field label="Short description">
          <textarea
            className={`${textareaClass} min-h-24`}
            disabled={!ready}
            onChange={(event) => update({ videoDescription: event.target.value })}
            placeholder="A short line shown next to the video"
            value={form.videoDescription}
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            Video source
          </span>
          <div className="flex h-10 items-center gap-1 rounded-xl border border-[#d9dfeb] bg-white p-1 dark:border-white/10 dark:bg-white/[0.045]">
            {HOME_VIDEO_MODES.map((mode) => (
              <button
                aria-pressed={form.videoMode === mode}
                className={`h-8 flex-1 rounded-lg text-xs font-semibold transition ${
                  form.videoMode === mode
                    ? "bg-[#171b25] text-white dark:bg-white/90 dark:text-[#171b25]"
                    : "text-[#768096] hover:text-[#171b25] dark:text-white/45 dark:hover:text-white"
                }`}
                disabled={!ready}
                key={mode}
                onClick={() => update({ videoMode: mode })}
                type="button"
              >
                {VIDEO_MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          <VideoSourceFields
            form={form}
            onChooseVideo={chooseVideo}
            onRemoveVideo={() => {
              setVideoFile(undefined);
              update({ videoKey: undefined, videoName: undefined, videoSize: undefined });
            }}
            onUrlChange={(value) => update({ videoUrl: value })}
            ready={ready}
            videoFile={videoFile}
            videoInput={videoInput}
            videoLimitMb={videoLimitMb}
          />
        </div>
      </div>

      <div className="h-24" aria-hidden />

      <div className="pointer-events-none sticky top-[7.5rem] z-30 mt-5 flex justify-end">
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {isDirty ? (
            <span className="rounded-full bg-[#171b25]/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              Unsaved changes
            </span>
          ) : null}
          <button
            aria-label="Save home content"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            disabled={status === "saving" || !ready}
            onClick={save}
            type="button"
          >
            {status === "saved" && !isDirty ? (
              <Check size={18} weight="bold" />
            ) : (
              <FloppyDisk size={18} weight="bold" />
            )}
            {saveLabel}
          </button>
        </div>
      </div>

      {status === "error" ? (
        <p className="mt-4 rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15 dark:text-brand-red-100">
          {error ?? "The changes could not be saved."}
        </p>
      ) : null}
    </div>
  );
}
