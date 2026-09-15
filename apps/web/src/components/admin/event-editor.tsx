"use client";

import { FloppyDisk, MapPin, Plus, Trash, X } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { isArticleSlug, slugify, type ArticleBlock } from "@/lib/article-cms";
import {
  EVENT_COLORS,
  dateOnlyToUtcMidnightIso,
  emptyEventDraft,
  utcIsoToDateOnly,
  utcIsoToWibLocal,
  wibLocalToUtcIso,
  type CmsEventRecord,
  type EventColor,
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

// Paths claimed by routes on the events controller; an event can never use one.
const RESERVED_EVENT_SLUGS = new Set([
  "admin",
  "bootstrap",
  "calendar.ics",
  "media",
  "registrations",
  "resolve-maps-link",
]);

const COLOR_LABELS: Record<EventColor, string> = {
  blue: "Blue",
  yellow: "Yellow",
  red: "Red",
  green: "Green",
};

const COLOR_SWATCH: Record<EventColor, string> = {
  blue: "bg-brand-blue",
  yellow: "bg-brand-yellow",
  red: "bg-brand-red",
  green: "bg-brand-green",
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
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
          location: initialRecord.location ?? "",
          meetingLink: initialRecord.meetingLink ?? "",
          color: initialRecord.color,
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

  async function uploadImage(file: File): Promise<string | undefined> {
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Images must be under 6 MB.");
      return undefined;
    }
    const dataUrl = await readAsDataUrl(file);
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

  const pickThumbnail = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingThumbnail(true);
    try {
      const key = await uploadImage(file);
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

  const resolveMapsLink = async () => {
    const url = draft.mapsUrl?.trim();
    if (!url) {
      toast.error("Paste a Google Maps link first.");
      return;
    }
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
          <input
            className={inputClass}
            onBlur={() => setSlugTouched(true)}
            onChange={(event) => {
              setSlugTouched(true);
              setDraft((current) => ({ ...current, slug: event.target.value }));
            }}
            placeholder="autumn-demo-night"
            type="text"
            value={draft.slug}
          />
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

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Thumbnail">
          <div className="flex items-center gap-3">
            {mediaUrl(draft.thumbnailKey) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="size-16 shrink-0 rounded-xl object-cover"
                src={mediaUrl(draft.thumbnailKey)}
              />
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#f2f5fa] text-[10px] text-[#9ba4b5] dark:bg-white/[0.06]">
                None
              </div>
            )}
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55">
              {uploadingThumbnail ? "Uploading…" : "Upload image"}
              <input
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadingThumbnail}
                onChange={(event) => void pickThumbnail(event)}
                type="file"
              />
            </label>
          </div>
        </Field>
        <Field label="Category color">
          <div className="flex flex-wrap gap-2">
            {EVENT_COLORS.map((color) => (
              <button
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  draft.color === color
                    ? "border-transparent bg-[#171b25] text-white dark:bg-white dark:text-[#0e1116]"
                    : "border-[#d9dfeb] text-[#5d687d] hover:border-brand-blue/50 dark:border-white/10 dark:text-white/55"
                }`}
                key={color}
                onClick={() => setDraft((current) => ({ ...current, color }))}
                type="button"
              >
                <span className={`size-2.5 rounded-full ${COLOR_SWATCH[color]}`} />
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        </Field>
      </div>

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
        <Field label="Starts (WIB)">
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
                  startAt: event.target.value ? wibLocalToUtcIso(event.target.value) : "",
                }))
              }
              type="datetime-local"
              value={draft.startAt ? utcIsoToWibLocal(draft.startAt) : ""}
            />
          )}
        </Field>
        <Field label="Ends (WIB)">
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
                  endAt: event.target.value ? wibLocalToUtcIso(event.target.value) : "",
                }))
              }
              type="datetime-local"
              value={draft.endAt ? utcIsoToWibLocal(draft.endAt) : ""}
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
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
          <MapPin size={14} weight="bold" /> Location on the map
        </p>
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
              {mediaUrl(speaker.photoKey) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover"
                  src={mediaUrl(speaker.photoKey)}
                />
              ) : (
                <div className="size-10 shrink-0 rounded-full bg-[#f2f5fa] dark:bg-white/[0.06]" />
              )}
              <input
                className={`${inputClass} w-40 flex-1`}
                onChange={(event) => updateSpeaker(index, { name: event.target.value })}
                placeholder="Name"
                type="text"
                value={speaker.name}
              />
              <input
                className={`${inputClass} w-40 flex-1`}
                onChange={(event) => updateSpeaker(index, { title: event.target.value })}
                placeholder="Title (optional)"
                type="text"
                value={speaker.title ?? ""}
              />
              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[#d9dfeb] px-2.5 text-xs font-semibold text-[#5d687d] dark:border-white/10 dark:text-white/55">
                Photo
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => void pickSpeakerPhoto(index, event)}
                  type="file"
                />
              </label>
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
              <input
                className={`${inputClass} w-28 shrink-0`}
                onChange={(event) => updateRundownItem(index, { time: event.target.value })}
                placeholder="09:00"
                type="text"
                value={row.time}
              />
              <input
                className={`${inputClass} flex-1`}
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
    </div>
  );
}
