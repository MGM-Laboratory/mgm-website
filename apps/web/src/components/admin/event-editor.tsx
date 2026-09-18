"use client";

import {
  ArrowSquareOut,
  Buildings,
  Camera,
  Check,
  FloppyDisk,
  MapPin,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { isArticleSlug, slugify, type ArticleBlock } from "@/lib/article-cms";
import {
  dateOnlyToUtcMidnightIso,
  emptyEventDraft,
  localToUtcIso,
  timezoneLabel,
  TIMEZONE_OFFSETS,
  utcIsoToDateOnly,
  utcIsoToLocal,
  type CmsEventRecord,
  type EventDraft,
  type EventRundownItem,
  type EventSpeaker,
} from "@/lib/events-cms";

const BlocknoteEditor = dynamic(() => import("./blocknote-editor"), {
  ssr: false,
  loading: () => (
    <div className="grid h-72 place-items-center rounded-2xl border border-[#dfe4ee] bg-white/60 text-sm text-[#8490a5] dark:border-white/10 dark:bg-white/[0.03]">
      Loading the writing surface…
    </div>
  ),
});

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}

// The lab's own address, so admins filling in an event held on-site don't
// have to go find the maps link every time.
const MGM_LABORATORY_MAPS_URL = "https://maps.app.goo.gl/cveQreqmCE22zS97A";
const MGM_LABORATORY_NAME = "MGM Laboratory";

// Paths claimed by routes on the events controller; an event can never use one.
const RESERVED_EVENT_SLUGS = new Set([
  "admin",
  "bootstrap",
  "calendar.ics",
  "media",
  "registrations",
  "resolve-maps-link",
]);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/** Canvas-crops a source image to the given pixel area, re-encoded as a JPEG data URL. */
async function cropImage(source: string, crop: Area) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("This image could not be prepared."));
    element.src = source;
  });
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const width = Math.max(1, Math.round(crop.width * scaleX));
  const height = Math.max(1, Math.round(crop.height * scaleY));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This image could not be prepared.");
  context.drawImage(
    image,
    Math.round(crop.x * scaleX),
    Math.round(crop.y * scaleY),
    width,
    height,
    0,
    0,
    width,
    height,
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Locks the thumbnail to 16:9 — every event card and detail cover renders at that ratio. */
function ThumbnailCropDialog({
  image,
  onClose,
  onConfirm,
}: {
  image: string;
  onClose: () => void;
  onConfirm: (thumbnail: string) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const confirm = async () => {
    if (!croppedArea) return;
    setBusy(true);
    try {
      onConfirm(await cropImage(image, croppedArea));
    } catch (error) {
      toast.error("Thumbnail could not be prepared", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0e1116]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#171b25]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold tracking-[-0.03em]">Crop thumbnail</p>
            <p className="mt-0.5 text-xs text-[#7e899d] dark:text-white/45">
              Thumbnails always render at a 16:9 ratio.
            </p>
          </div>
          <button
            aria-label="Close thumbnail cropper"
            className="rounded-lg p-2 text-[#7e899d] transition hover:bg-brand-red-50 hover:text-brand-red dark:hover:bg-brand-red/15"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-[#e8ecf4] dark:bg-[#1a202b]">
          <Cropper
            aspect={16 / 9}
            crop={crop}
            image={image}
            objectFit="contain"
            onCropChange={setCrop}
            onCropComplete={(_area, areaPixels) => setCroppedArea(areaPixels)}
            onZoomChange={setZoom}
            zoom={zoom}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-semibold text-[#7e899d] dark:text-white/45">Zoom</span>
          <input
            className="flex-1 accent-brand-blue"
            max={3}
            min={1}
            onChange={(event) => setZoom(Number(event.target.value))}
            step={0.01}
            type="range"
            value={zoom}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-10 rounded-xl px-4 text-sm font-semibold text-[#5d687d] transition hover:bg-[#f5f7fb] dark:text-white/60 dark:hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] disabled:opacity-60"
            disabled={busy || !croppedArea}
            onClick={() => void confirm()}
            type="button"
          >
            <Check size={16} weight="bold" />
            {busy ? "Cropping…" : "Use thumbnail"}
          </button>
        </div>
      </div>
    </div>
  );
}

function responseError(response: Response) {
  return `The API answered ${response.status}.`;
}

function mediaUrl(key?: string) {
  return key ? `/api/events-cms/media/${encodeURIComponent(key)}` : undefined;
}

export function EventEditor({
  initialRecord,
  onDeleted,
  onDirtyChange,
  onSaved,
}: {
  initialRecord?: CmsEventRecord;
  onDeleted: (slug: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (record: CmsEventRecord) => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() =>
    initialRecord
      ? {
          slug: initialRecord.slug,
          title: initialRecord.title,
          description: initialRecord.description ?? "",
          startAt: initialRecord.startAt,
          endAt: initialRecord.endAt,
          allDay: initialRecord.allDay,
          timezoneOffset: initialRecord.timezoneOffset,
          location: initialRecord.location ?? "",
          meetingLink: initialRecord.meetingLink ?? "",
          draft: initialRecord.draft,
          thumbnailKey: initialRecord.thumbnailKey,
          speakers: initialRecord.speakers.map((speaker) => ({ ...speaker })),
          organizer: initialRecord.organizer ?? "",
          coordinator: initialRecord.coordinator ?? "",
          attendees: initialRecord.attendees ?? "",
          rundown: initialRecord.rundown.map((item) => ({ ...item })),
          mapsUrl: initialRecord.mapsUrl ?? "",
          mapsLat: initialRecord.mapsLat,
          mapsLng: initialRecord.mapsLng,
          registrationEnabled: initialRecord.registrationEnabled,
          registrationCapacity: initialRecord.registrationCapacity,
        }
      : emptyEventDraft(),
  );
  const [content, setContent] = useState<ArticleBlock[]>(() =>
    initialRecord ? [...initialRecord.content] : [],
  );
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailToEdit, setThumbnailToEdit] = useState<string>();
  const [resolvingMaps, setResolvingMaps] = useState(false);
  const sourceSlug = initialRecord?.slug;
  const uploadSlug = sourceSlug ?? (draft.slug || "draft");

  const baseline = useMemo(() => {
    if (!initialRecord) return JSON.stringify({ draft: emptyEventDraft(), content: [] });
    const rest: Partial<CmsEventRecord> = { ...initialRecord };
    delete rest.content;
    delete rest.updatedAt;
    return JSON.stringify({ draft: rest, content: initialRecord.content });
  }, [initialRecord]);
  const dirty = JSON.stringify({ draft, content }) !== baseline;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  const slugError =
    slugTouched || draft.slug
      ? !draft.slug
        ? "Give the event a URL."
        : !isArticleSlug(draft.slug)
          ? "Use lowercase letters, numbers, and hyphens."
          : RESERVED_EVENT_SLUGS.has(draft.slug)
            ? "That URL is reserved."
            : null
      : null;

  async function uploadDataUrl(dataUrl: string): Promise<string | undefined> {
    const response = await fetch(`/api/admin/events/${encodeURIComponent(uploadSlug)}/media`, {
      body: JSON.stringify({ image: dataUrl }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      key?: string;
      message?: string;
    };
    if (!response.ok || !payload.key) {
      throw new Error(payload.message ?? responseError(response));
    }
    return payload.key;
  }

  async function uploadImage(file: File): Promise<string | undefined> {
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Images must be under 6 MB.");
      return undefined;
    }
    return uploadDataUrl(await readAsDataUrl(file));
  }

  const pickThumbnail = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setThumbnailToEdit(String(reader.result));
    reader.readAsDataURL(file);
  };

  const confirmThumbnailCrop = async (cropped: string) => {
    setThumbnailToEdit(undefined);
    setUploadingThumbnail(true);
    try {
      const key = await uploadDataUrl(cropped);
      if (key) setDraft((current) => ({ ...current, thumbnailKey: key }));
    } catch (error) {
      toast.error("Could not upload the thumbnail.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const pickSpeakerPhoto = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const key = await uploadImage(file);
      if (key) {
        setDraft((current) => ({
          ...current,
          speakers: current.speakers.map((speaker, i) =>
            i === index ? { ...speaker, photoKey: key } : speaker,
          ),
        }));
      }
    } catch (error) {
      toast.error("Could not upload the speaker photo.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const addSpeaker = () => {
    if (draft.speakers.length >= 20) {
      toast.error("An event can list up to 20 speakers.");
      return;
    }
    setDraft((current) => ({ ...current, speakers: [...current.speakers, { name: "" }] }));
  };

  const updateSpeaker = (index: number, patch: Partial<EventSpeaker>) => {
    setDraft((current) => ({
      ...current,
      speakers: current.speakers.map((speaker, i) =>
        i === index ? { ...speaker, ...patch } : speaker,
      ),
    }));
  };

  const removeSpeaker = (index: number) => {
    setDraft((current) => ({
      ...current,
      speakers: current.speakers.filter((_, i) => i !== index),
    }));
  };

  const addRundownItem = () => {
    if (draft.rundown.length >= 50) {
      toast.error("A rundown can list up to 50 items.");
      return;
    }
    setDraft((current) => ({ ...current, rundown: [...current.rundown, { time: "", item: "" }] }));
  };

  const updateRundownItem = (index: number, patch: Partial<EventRundownItem>) => {
    setDraft((current) => ({
      ...current,
      rundown: current.rundown.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const removeRundownItem = (index: number) => {
    setDraft((current) => ({
      ...current,
      rundown: current.rundown.filter((_, i) => i !== index),
    }));
  };

  const resolveCoordinatesFor = async (url: string) => {
    setResolvingMaps(true);
    try {
      const response = await fetch("/api/admin/events/resolve-maps-link", {
        body: JSON.stringify({ url }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        lat?: number;
        lng?: number;
        message?: string;
      };
      if (!response.ok || typeof payload.lat !== "number" || typeof payload.lng !== "number") {
        throw new Error(payload.message ?? "Could not read coordinates from that link.");
      }
      setDraft((current) => ({ ...current, mapsLat: payload.lat, mapsLng: payload.lng }));
      toast.success("Coordinates resolved.");
    } catch (error) {
      toast.error("Could not resolve that link.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setResolvingMaps(false);
    }
  };

  const resolveMapsLink = async () => {
    const url = draft.mapsUrl?.trim();
    if (!url) {
      toast.error("Paste a Google Maps link first.");
      return;
    }
    await resolveCoordinatesFor(url);
  };

  const fillMgmLaboratoryAddress = async () => {
    setDraft((current) => ({
      ...current,
      location: current.location?.trim() || MGM_LABORATORY_NAME,
      mapsUrl: MGM_LABORATORY_MAPS_URL,
    }));
    await resolveCoordinatesFor(MGM_LABORATORY_MAPS_URL);
  };

  const save = async () => {
    const checks: { message: string; pass: boolean }[] = [
      { message: "A title is required.", pass: draft.title.trim().length > 0 },
      { message: slugError ?? "The URL is invalid.", pass: !slugError && Boolean(draft.slug) },
      { message: "Set a start date/time.", pass: Boolean(draft.startAt) },
      { message: "Set an end date/time.", pass: Boolean(draft.endAt) },
      {
        message: "The end time cannot be earlier than the start time.",
        pass: !draft.startAt || !draft.endAt || draft.endAt >= draft.startAt,
      },
    ];
    const failed = checks.find((check) => !check.pass);
    if (failed) {
      toast.error(failed.message);
      return;
    }

    setStatus("saving");
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(uploadSlug)}`, {
        body: JSON.stringify({ ...draft, content }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<CmsEventRecord> & {
        message?: string;
      };
      if (!response.ok || !payload.slug) {
        throw new Error(
          typeof payload.message === "string" && payload.message
            ? payload.message
            : responseError(response),
        );
      }
      onSaved(payload as CmsEventRecord);
      window.dispatchEvent(
        new CustomEvent("mgm:event-updated", { detail: payload as CmsEventRecord }),
      );
      setStatus("idle");
      toast.success("Event saved.");
    } catch (error) {
      setStatus("error");
      toast.error("Could not save the event.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const remove = async () => {
    const target = sourceSlug ?? draft.slug;
    if (!window.confirm("Delete this event? Registrations stay in the inbox.")) return;
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(responseError(response));
      onDeleted(target);
      window.dispatchEvent(new CustomEvent("mgm:event-updated"));
      toast.success("Event deleted.");
    } catch (error) {
      toast.error("Could not delete the event.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="admin-editor-enter space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dee4ef] pb-5 dark:border-white/10">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">
            {initialRecord ? "Edit event" : "New event"}
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] uppercase ${
              draft.draft
                ? "bg-brand-yellow-50 text-[#a97b1c]"
                : "bg-brand-green-50 text-brand-green"
            }`}
          >
            {draft.draft ? "Draft" : "Published"}
          </span>
          {dirty ? (
            <span className="font-mono text-[10px] font-bold tracking-[0.1em] text-[#a97b1c] uppercase">
              Unsaved
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-[#5d687d] dark:text-white/55">
            <input
              checked={!draft.draft}
              className="size-4 accent-brand-blue"
              onChange={(event) =>
                setDraft((current) => ({ ...current, draft: !event.target.checked }))
              }
              type="checkbox"
            />
            Published
          </label>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#171b25] px-4 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] disabled:opacity-60"
            disabled={status === "saving"}
            onClick={() => void save()}
            type="button"
          >
            <FloppyDisk size={15} weight="bold" />
            {status === "saving" ? "Saving…" : "Save event"}
          </button>
          {initialRecord ? (
            <a
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
              href={`/events/${initialRecord.slug}`}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowSquareOut size={15} weight="bold" />
              See event
            </a>
          ) : null}
          {initialRecord ? (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-red/40 hover:text-brand-red dark:border-white/10 dark:text-white/55"
              onClick={() => void remove()}
              type="button"
            >
              <Trash size={15} weight="bold" />
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {status === "error" ? (
        <p className="rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15">
          The last save failed. Check the fields below and try again.
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Title">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                title: event.target.value,
                slug: slugTouched ? current.slug : slugify(event.target.value),
              }))
            }
            placeholder="Autumn Demo Night"
            type="text"
            value={draft.title}
          />
        </Field>
        <Field label="URL">
          <div className="flex h-10 items-center overflow-hidden rounded-xl border border-[#d9dfeb] bg-white pl-3 transition focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045]">
            <span className="shrink-0 text-sm text-[#9ba4b5] select-none">events/</span>
            <input
              className="h-full w-full border-0 bg-transparent px-1 text-sm text-[#171b25] outline-none placeholder:text-[#9ba4b5] dark:text-white dark:placeholder:text-white/25"
              onBlur={() => setSlugTouched(true)}
              onChange={(event) => {
                setSlugTouched(true);
                setDraft((current) => ({ ...current, slug: event.target.value }));
              }}
              placeholder="autumn-demo-night"
              type="text"
              value={draft.slug}
            />
          </div>
          {slugError ? <p className="mt-1.5 text-xs text-brand-red">{slugError}</p> : null}
        </Field>
      </div>

      <Field label="Short description">
        <textarea
          className={`${inputClass} h-auto min-h-20 resize-y py-2`}
          maxLength={1000}
          onChange={(event) =>
            setDraft((current) => ({ ...current, description: event.target.value }))
          }
          placeholder="One or two sentences shown on the events list."
          value={draft.description}
        />
      </Field>

      <Field label="Thumbnail (16:9)">
        <div className="flex items-center gap-3">
          {mediaUrl(draft.thumbnailKey) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="aspect-video w-28 shrink-0 rounded-lg object-cover"
              src={mediaUrl(draft.thumbnailKey)}
            />
          ) : (
            <div className="grid aspect-video w-28 shrink-0 place-items-center rounded-lg bg-[#f2f5fa] text-[10px] text-[#9ba4b5] dark:bg-white/[0.06]">
              None
            </div>
          )}
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55">
            {uploadingThumbnail ? "Uploading…" : "Upload image"}
            <input
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploadingThumbnail}
              onChange={pickThumbnail}
              type="file"
            />
          </label>
        </div>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-[#5d687d] sm:col-span-2 dark:text-white/55">
          <input
            checked={draft.allDay}
            className="size-4 accent-brand-blue"
            onChange={(event) =>
              setDraft((current) => ({ ...current, allDay: event.target.checked }))
            }
            type="checkbox"
          />
          All-day event
        </label>
        <Field label="Timezone">
          <select
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, timezoneOffset: Number(event.target.value) }))
            }
            value={draft.timezoneOffset}
          >
            {TIMEZONE_OFFSETS.map((offset) => (
              <option key={offset} value={offset}>
                {timezoneLabel(offset)}
                {offset === 7 ? " (Jakarta / WIB — default)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div aria-hidden="true" className="hidden sm:block" />
        <Field label={`Starts (${timezoneLabel(draft.timezoneOffset)})`}>
          {draft.allDay ? (
            <input
              className={inputClass}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  startAt: event.target.value ? dateOnlyToUtcMidnightIso(event.target.value) : "",
                }))
              }
              type="date"
              value={draft.startAt ? utcIsoToDateOnly(draft.startAt) : ""}
            />
          ) : (
            <input
              className={inputClass}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  startAt: event.target.value
                    ? localToUtcIso(event.target.value, current.timezoneOffset)
                    : "",
                }))
              }
              type="datetime-local"
              value={draft.startAt ? utcIsoToLocal(draft.startAt, draft.timezoneOffset) : ""}
            />
          )}
        </Field>
        <Field label={`Ends (${timezoneLabel(draft.timezoneOffset)})`}>
          {draft.allDay ? (
            <input
              className={inputClass}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  endAt: event.target.value ? dateOnlyToUtcMidnightIso(event.target.value) : "",
                }))
              }
              type="date"
              value={draft.endAt ? utcIsoToDateOnly(draft.endAt) : ""}
            />
          ) : (
            <input
              className={inputClass}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  endAt: event.target.value
                    ? localToUtcIso(event.target.value, current.timezoneOffset)
                    : "",
                }))
              }
              type="datetime-local"
              value={draft.endAt ? utcIsoToLocal(draft.endAt, draft.timezoneOffset) : ""}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Location">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, location: event.target.value }))
            }
            placeholder="MGM Laboratory, Building A"
            type="text"
            value={draft.location}
          />
        </Field>
        <Field label="Meeting link (optional)">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, meetingLink: event.target.value }))
            }
            placeholder="https://meet.google.com/..."
            type="text"
            value={draft.meetingLink}
          />
        </Field>
      </div>

      <div className="space-y-3 rounded-2xl border border-[#eef1f7] p-4 dark:border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            <MapPin size={14} weight="bold" /> Location on the map
          </p>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue transition hover:underline disabled:opacity-60"
            disabled={resolvingMaps}
            onClick={() => void fillMgmLaboratoryAddress()}
            type="button"
          >
            <Buildings size={13} weight="bold" />
            Use MGM Laboratory
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, mapsUrl: event.target.value }))
            }
            placeholder="Paste a Google Maps link"
            type="text"
            value={draft.mapsUrl}
          />
          <button
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue disabled:opacity-60 dark:border-white/10 dark:text-white/55"
            disabled={resolvingMaps}
            onClick={() => void resolveMapsLink()}
            type="button"
          >
            {resolvingMaps ? "Resolving…" : "Resolve coordinates"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Latitude">
            <input
              className={inputClass}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  mapsLat: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
              placeholder="-6.9147"
              step="any"
              type="number"
              value={draft.mapsLat ?? ""}
            />
          </Field>
          <Field label="Longitude">
            <input
              className={inputClass}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  mapsLng: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
              placeholder="107.6098"
              step="any"
              type="number"
              value={draft.mapsLng ?? ""}
            />
          </Field>
        </div>
        <p className="text-xs leading-5 text-[#9ba4b5]">
          If the link can&apos;t be read automatically, enter latitude/longitude directly.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field label="Organizer">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, organizer: event.target.value }))
            }
            type="text"
            value={draft.organizer}
          />
        </Field>
        <Field label="Coordinator">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, coordinator: event.target.value }))
            }
            type="text"
            value={draft.coordinator}
          />
        </Field>
        <Field label="Who should attend">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, attendees: event.target.value }))
            }
            placeholder="Open to all students"
            type="text"
            value={draft.attendees}
          />
        </Field>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            Speakers
          </span>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline"
            onClick={addSpeaker}
            type="button"
          >
            <Plus size={13} weight="bold" /> Add speaker
          </button>
        </div>
        <div className="space-y-3">
          {draft.speakers.map((speaker, index) => (
            <div
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eef1f7] p-3 dark:border-white/[0.06]"
              key={index}
            >
              <label
                className={`relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 transition hover:border-brand-blue ${
                  mediaUrl(speaker.photoKey)
                    ? "border-[#d9dfeb] dark:border-white/15"
                    : "border-dashed border-[#d9dfeb] dark:border-white/15"
                }`}
                title="Upload speaker photo"
              >
                {mediaUrl(speaker.photoKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="size-full object-cover" src={mediaUrl(speaker.photoKey)} />
                ) : (
                  <span className="grid size-full place-items-center text-[#9ba4b5] dark:text-white/35">
                    <Camera size={15} weight="bold" />
                  </span>
                )}
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => void pickSpeakerPhoto(index, event)}
                  type="file"
                />
              </label>
              <input
                className={`${inputClass} w-40 flex-1`}
                onChange={(event) => updateSpeaker(index, { name: event.target.value })}
                placeholder="Name"
                type="text"
                value={speaker.name}
              />
              <input
                className={`${inputClass} w-40 flex-1`}
                onChange={(event) => updateSpeaker(index, { institution: event.target.value })}
                placeholder="Organization / institution (optional)"
                type="text"
                value={speaker.institution ?? ""}
              />
              <button
                aria-label="Remove speaker"
                className="text-[#8993a7] transition hover:text-brand-red"
                onClick={() => removeSpeaker(index)}
                type="button"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          ))}
          {!draft.speakers.length ? (
            <p className="text-xs text-[#9ba4b5]">No speakers added.</p>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            Rundown
          </span>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline"
            onClick={addRundownItem}
            type="button"
          >
            <Plus size={13} weight="bold" /> Add item
          </button>
        </div>
        <div className="space-y-2">
          {draft.rundown.map((row, index) => (
            <div className="flex items-center gap-3" key={index}>
              <div className="w-28 shrink-0">
                <input
                  className={inputClass}
                  onChange={(event) => updateRundownItem(index, { time: event.target.value })}
                  placeholder="09:00"
                  type="text"
                  value={row.time}
                />
              </div>
              <input
                className={`${inputClass} min-w-0 flex-1`}
                onChange={(event) => updateRundownItem(index, { item: event.target.value })}
                placeholder="Registration & coffee"
                type="text"
                value={row.item}
              />
              <button
                aria-label="Remove item"
                className="text-[#8993a7] transition hover:text-brand-red"
                onClick={() => removeRundownItem(index)}
                type="button"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          ))}
          {!draft.rundown.length ? (
            <p className="text-xs text-[#9ba4b5]">No rundown items added.</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-[#5d687d] dark:text-white/55">
          <input
            checked={draft.registrationEnabled}
            className="size-4 accent-brand-blue"
            onChange={(event) =>
              setDraft((current) => ({ ...current, registrationEnabled: event.target.checked }))
            }
            type="checkbox"
          />
          Accept registrations
        </label>
        {draft.registrationEnabled ? (
          <Field label="Capacity (optional)">
            <input
              className={inputClass}
              min={1}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  registrationCapacity: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
              type="number"
              value={draft.registrationCapacity ?? ""}
            />
          </Field>
        ) : null}
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
          Long description
        </span>
        <div className="overflow-hidden rounded-2xl border border-[#d9dfeb] bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <BlocknoteEditor
            initialContent={content}
            mediaBase="/api/events-cms/media"
            onChange={setContent}
            uploadPath={`/api/admin/events/${encodeURIComponent(uploadSlug)}/media`}
          />
        </div>
      </div>

      {thumbnailToEdit ? (
        <ThumbnailCropDialog
          image={thumbnailToEdit}
          onClose={() => setThumbnailToEdit(undefined)}
          onConfirm={(cropped) => void confirmThumbnailCrop(cropped)}
        />
      ) : null}
    </div>
  );
}
