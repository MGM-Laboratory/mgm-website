"use client";

import { Check, FloppyDisk, VideoCamera } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { HomeContent } from "@repo/shared";
import { homeVideoUrl } from "@/lib/home-cms";
import { formatVideoSize } from "@/lib/project-cms";

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
  videoKey?: string;
  videoName?: string;
  videoSize?: number;
};

const toForm = (content: HomeContent): FormState =>
  content.videoMode === "upload" && content.videoKey
    ? { videoKey: content.videoKey, videoName: content.videoName, videoSize: content.videoSize }
    : {};

/** Uploads a newly chosen file, then returns the record to save. */
async function uploadAndBuildPayload(
  form: FormState,
  videoFile: File | undefined,
): Promise<HomeContent> {
  if (!videoFile) {
    return form.videoKey
      ? {
          videoMode: "upload",
          videoKey: form.videoKey,
          videoName: form.videoName,
          videoSize: form.videoSize,
        }
      : { videoMode: "none" };
  }

  const response = await fetch("/api/admin/home-content/video", {
    body: videoFile,
    headers: { "content-type": videoFile.type },
    method: "POST",
  });
  if (!response.ok) throw new Error(await responseError(response, "Video upload failed."));
  const uploaded = (await response.json()) as { key: string; size: number };
  return {
    videoMode: "upload",
    videoKey: uploaded.key,
    videoName: videoFile.name,
    videoSize: uploaded.size,
  };
}

function VideoUploadField({
  form,
  ready,
  videoFile,
  videoInput,
  videoLimitMb,
  onChooseVideo,
  onRemoveVideo,
}: Readonly<{
  form: FormState;
  ready: boolean;
  videoFile: File | undefined;
  videoInput: React.RefObject<HTMLInputElement | null>;
  videoLimitMb: number;
  onChooseVideo: (file: File | undefined) => void;
  onRemoveVideo: () => void;
}>) {
  // A chosen file previews from memory before it is uploaded; a saved one
  // plays through the same cached route the homepage uses.
  const localPreview = useMemo(
    () => (videoFile ? URL.createObjectURL(videoFile) : undefined),
    [videoFile],
  );
  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );
  const previewSrc = localPreview ?? homeVideoUrl(form.videoKey);

  return (
    <div className="rounded-2xl border border-[#dfe4ee] bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]">
      {videoFile || form.videoKey ? (
        <div className="grid gap-4">
          {previewSrc ? (
            <video
              className="aspect-video w-full max-w-2xl rounded-xl bg-[#0e1116] object-contain"
              controls
              muted
              playsInline
              preload="metadata"
              src={previewSrc}
            />
          ) : null}
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
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:bg-white hover:text-brand-blue disabled:opacity-50 dark:text-white/60 dark:hover:bg-white/10"
              disabled={!ready}
              onClick={() => videoInput.current?.click()}
              type="button"
            >
              Replace
            </button>
            <button
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:bg-brand-red-50 hover:text-brand-red disabled:opacity-50 dark:text-white/60 dark:hover:bg-brand-red/15"
              disabled={!ready}
              onClick={onRemoveVideo}
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          className="grid w-full place-items-center gap-2 rounded-xl border border-dashed border-brand-blue/40 bg-brand-blue/[0.04] px-4 py-10 text-center transition hover:border-brand-blue hover:bg-brand-blue/[0.07] disabled:opacity-50"
          disabled={!ready}
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

export function HomeSettingsEditor({
  onDirtyChange,
}: Readonly<{ onDirtyChange: (dirty: boolean) => void }>) {
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<FormState>({});
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
    setStatus("saving");
    setError(undefined);
    try {
      const payload = await uploadAndBuildPayload(form, videoFile);

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
            The company profile video on the homepage, right after the hero. Its title and
            description are part of the page design, so only the video changes here.
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

      <div className="mt-8 grid gap-3">
        <span className="block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
          Company profile video
        </span>
        <VideoUploadField
          form={form}
          onChooseVideo={chooseVideo}
          onRemoveVideo={() => {
            setVideoFile(undefined);
            update({ videoKey: undefined, videoName: undefined, videoSize: undefined });
          }}
          ready={ready}
          videoFile={videoFile}
          videoInput={videoInput}
          videoLimitMb={videoLimitMb}
        />
        <p className="text-xs leading-5 text-[#8b93a6] dark:text-white/40">
          It plays muted in the small frame beside the section&apos;s title, grows to fill the
          screen as visitors scroll, and opens in the full-screen player from the Play button.
          Browsers cache the file, so a returning visitor&apos;s video starts at once.
        </p>
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
