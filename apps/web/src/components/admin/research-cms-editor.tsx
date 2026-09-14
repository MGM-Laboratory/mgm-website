"use client";

import {
  ArrowSquareOut,
  CalendarBlank,
  Check,
  FloppyDisk,
  ImageSquare,
  LinkSimple,
  Plus,
  Tag,
  Trash,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { Member } from "@/data/members";
import type { ArticleBlock } from "@/lib/article-cms";
import {
  draftToResearch,
  emptyResearchDraft,
  isResearchSlug,
  researchCoverUrl,
  researchToDraft,
  slugify,
  RESEARCH_AREA_LABELS,
  RESEARCH_AREAS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABELS,
  type CmsResearchRecord,
  type ResearchArea,
  type ResearchDraft,
  type ResearchMilestone,
  type ResearchOutputLink,
  type ResearchPartner,
  type ResearchStatus,
} from "@/lib/research-cms";

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
const textareaClass =
  "min-h-24 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 py-2.5 text-sm leading-6 text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

const OUTPUT_TYPES: { id: ResearchOutputLink["type"]; label: string }[] = [
  { id: "project", label: "Project" },
  { id: "publication", label: "Publication" },
  { id: "article", label: "Article" },
];

function Field({
  children,
  label,
  hint,
}: {
  children: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
        {label}
      </span>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">{hint}</p>
      ) : null}
    </div>
  );
}

function EditRow({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <article className="relative rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
      <button
        aria-label="Remove item"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-[#7e899e] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/40 dark:hover:bg-brand-red/15"
        onClick={onRemove}
        type="button"
      >
        <Trash size={16} />
      </button>
      <div className="space-y-3 pr-7">{children}</div>
    </article>
  );
}

function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-[#c6cedd] px-3 text-xs font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/15 dark:text-white/55 dark:hover:border-brand-blue dark:hover:text-brand-blue"
      onClick={onClick}
      type="button"
    >
      <Plus size={14} weight="bold" />
      {children}
    </button>
  );
}

async function cropCover(source: string, crop: Area) {
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

function CoverCropDialog({
  image,
  onClose,
  onConfirm,
}: {
  image: string;
  onClose: () => void;
  onConfirm: (cover: string) => void;
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
      onConfirm(await cropCover(image, croppedArea));
    } catch (error) {
      toast.error("Cover could not be prepared", {
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
            <p className="font-display text-lg font-semibold tracking-[-0.03em]">Crop cover</p>
            <p className="mt-0.5 text-xs text-[#7e899d] dark:text-white/45">
              The cover renders at a wide 1200 × 482 ratio with rounded corners.
            </p>
          </div>
          <button
            aria-label="Close cover cropper"
            className="rounded-lg p-2 text-[#7e899d] transition hover:bg-brand-red-50 hover:text-brand-red dark:hover:bg-brand-red/15"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <div className="relative mt-4 aspect-[1200/482] w-full overflow-hidden rounded-xl bg-[#e8ecf4] dark:bg-[#1a202b]">
          <Cropper
            aspect={1200 / 482}
            crop={crop}
            image={image}
            objectFit="contain"
            onCropChange={setCrop}
            onCropComplete={(_area, areaPixels) => setCroppedArea(areaPixels)}
            onZoomChange={setZoom}
            zoom={zoom}
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
            onClick={confirm}
            type="button"
          >
            <Check size={16} weight="bold" />
            {busy ? "Cropping…" : "Use cover"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberPicker({
  members,
  onToggle,
  selected,
}: {
  members: readonly Member[];
  onToggle: (slug: string) => void;
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const needle = query.trim().toLocaleLowerCase();
  const visible = members.filter(
    (member) =>
      !needle ||
      [member.name, member.nickname, member.division]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
  );
  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        className={`${inputClass} flex items-center gap-2 px-3 text-left`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <UsersThree className="shrink-0 text-[#8490a5]" size={16} />
        <span className="min-w-0 flex-1 truncate text-[#171b25] dark:text-white">
          {selected.length
            ? selected
                .map((slug) => members.find((member) => member.slug === slug)?.name ?? slug)
                .join(", ")
            : "Choose members"}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-[#9ba4b5]">
          {selected.length || ""}
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.4rem)] z-40 w-full rounded-2xl border border-[#dfe4ee] bg-white p-2 shadow-[0_24px_55px_-28px_rgba(20,32,58,0.36)] dark:border-white/10 dark:bg-[#171b25]">
          <input
            autoFocus
            className="mb-2 h-9 w-full rounded-lg border border-[#d9dfeb] bg-white px-3 text-sm outline-none focus:border-brand-blue dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a member"
            value={query}
          />
          <div className="max-h-56 overflow-y-auto">
            {visible.map((member) => {
              const active = selected.includes(member.slug);
              return (
                <button
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20" : "text-[#4f5a6f] hover:bg-[#f5f7fb] dark:text-white/70 dark:hover:bg-white/[0.06]"}`}
                  key={member.slug}
                  onClick={() => onToggle(member.slug)}
                  type="button"
                >
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded border transition ${active ? "border-brand-blue bg-brand-blue text-white" : "border-[#c6cedd] dark:border-white/20"}`}
                  >
                    {active ? <Check size={11} weight="bold" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{member.name}</span>
                  <span className="shrink-0 truncate text-[11px] text-[#9ba4b5]">
                    {member.division}
                  </span>
                </button>
              );
            })}
            {!visible.length ? (
              <p className="px-2 py-4 text-center text-xs text-[#9ba4b5]">No members match.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TagListEditor({
  onAdd,
  onRemove,
  placeholder,
  values,
}: {
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
  values: string[];
}) {
  const [value, setValue] = useState("");
  const commit = () => {
    const next = value.trim();
    if (next) onAdd(next);
    setValue("");
  };
  return (
    <div>
      <div className="relative">
        <Tag
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
          size={16}
        />
        <input
          className={`${inputClass} pl-9 pr-12`}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          value={value}
        />
        <button
          aria-label={`Add ${placeholder}`}
          className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-brand-blue transition hover:bg-brand-blue-50"
          onClick={commit}
          type="button"
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
      {values.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((item) => (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue"
              key={item}
            >
              {item}
              <button
                aria-label={`Remove ${item}`}
                className="transition hover:text-brand-red"
                onClick={() => onRemove(item)}
                type="button"
              >
                <X size={12} weight="bold" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function newMilestone(): ResearchMilestone {
  return { id: crypto.randomUUID(), date: "", title: "", summary: "" };
}

function newOutput(): ResearchOutputLink {
  return { id: crypto.randomUUID(), type: "project", label: "", href: "" };
}

function newPartner(): ResearchPartner {
  return { name: "" };
}

/** Site paths (a single leading slash) and http(s) URLs only, like the API. */
function isSafeLink(value: string) {
  return /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value);
}

function MilestoneEditor({
  milestone,
  onChange,
  onRemove,
}: {
  milestone: ResearchMilestone;
  onChange: (next: ResearchMilestone) => void;
  onRemove: () => void;
}) {
  return (
    <EditRow onRemove={onRemove}>
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Date">
          <div className="relative">
            <CalendarBlank
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
              size={16}
            />
            <input
              className={`${inputClass} pl-9`}
              onChange={(event) => onChange({ ...milestone, date: event.target.value })}
              type="date"
              value={milestone.date}
            />
          </div>
        </Field>
        <Field label="Title">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...milestone, title: event.target.value })}
            placeholder="What happened"
            value={milestone.title}
          />
        </Field>
      </div>
      <Field label="Summary">
        <textarea
          className={textareaClass}
          onChange={(event) => onChange({ ...milestone, summary: event.target.value })}
          placeholder="Why this milestone matters"
          rows={2}
          value={milestone.summary}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Related link label (optional)">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...milestone, relatedLabel: event.target.value })}
            placeholder="Read the paper"
            value={milestone.relatedLabel ?? ""}
          />
        </Field>
        <Field label="Related link URL (optional)">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...milestone, relatedUrl: event.target.value })}
            placeholder="/publications/... or https://..."
            value={milestone.relatedUrl ?? ""}
          />
        </Field>
      </div>
    </EditRow>
  );
}

function OutputEditor({
  onChange,
  onRemove,
  output,
}: {
  output: ResearchOutputLink;
  onChange: (next: ResearchOutputLink) => void;
  onRemove: () => void;
}) {
  return (
    <EditRow onRemove={onRemove}>
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Field label="Type">
          <div className="flex h-10 items-center gap-1 rounded-xl border border-[#d9dfeb] bg-white p-1 dark:border-white/10 dark:bg-white/[0.045]">
            {OUTPUT_TYPES.map((entry) => (
              <button
                aria-pressed={output.type === entry.id}
                className={`h-8 flex-1 rounded-lg text-xs font-semibold transition ${output.type === entry.id ? "bg-[#171b25] text-white dark:bg-white/90 dark:text-[#171b25]" : "text-[#768096] hover:text-[#171b25] dark:text-white/45 dark:hover:text-white"}`}
                key={entry.id}
                onClick={() => onChange({ ...output, type: entry.id })}
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Label">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...output, label: event.target.value })}
            placeholder="What the linked output is called"
            value={output.label}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Link">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...output, href: event.target.value })}
            placeholder="/publications/... or https://..."
            value={output.href}
          />
        </Field>
        <Field
          label="Record slug (reserved)"
          hint="Saved for the future Projects CMS; the link above is what visitors follow today."
        >
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...output, recordSlug: event.target.value })}
            placeholder="optional-slug"
            value={output.recordSlug ?? ""}
          />
        </Field>
      </div>
    </EditRow>
  );
}

function PartnerEditor({
  onChange,
  onRemove,
  partner,
}: {
  partner: ResearchPartner;
  onChange: (next: ResearchPartner) => void;
  onRemove: () => void;
}) {
  return (
    <EditRow onRemove={onRemove}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...partner, name: event.target.value })}
            placeholder="Partner or funder name"
            value={partner.name}
          />
        </Field>
        <Field label="Website (optional)">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...partner, url: event.target.value })}
            placeholder="https://..."
            value={partner.url ?? ""}
          />
        </Field>
      </div>
    </EditRow>
  );
}

export function ResearchEditor({
  initialRecord,
  members,
  onDeleted,
  onDirtyChange,
  onSaved,
}: {
  initialRecord?: CmsResearchRecord;
  members: readonly Member[];
  onDeleted: (slug: string) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: (record: CmsResearchRecord) => void;
}) {
  const [initial] = useState(() =>
    initialRecord
      ? { draft: researchToDraft(initialRecord.research), body: initialRecord.body }
      : { draft: emptyResearchDraft(), body: [] },
  );
  const [draft, setDraft] = useState<ResearchDraft>(initial.draft);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialRecord));
  const [body, setBody] = useState<ArticleBlock[]>(initial.body);
  const [coverUpload, setCoverUpload] = useState<string>();
  const [coverToEdit, setCoverToEdit] = useState<string>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [originalRecordSlug] = useState(initialRecord?.slug);
  const fileInput = useRef<HTMLInputElement>(null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const signature = JSON.stringify({ draft, body });
  const isDirty = Boolean(coverUpload) || baseline !== signature;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const coverUrl = useMemo(
    () => coverUpload ?? researchCoverUrl(draft.coverKey),
    [coverUpload, draft.coverKey],
  );

  const updateDraft = <K extends keyof ResearchDraft>(key: K, value: ResearchDraft[K]) => {
    if (status === "saved") setStatus("idle");
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateTitle = (title: string) => {
    setDraft((current) => ({
      ...current,
      title,
      slug: slugTouched ? current.slug : slugify(title),
    }));
  };
  const updateSlug = (slug: string) => {
    setSlugTouched(true);
    updateDraft("slug", slug.trim().toLowerCase());
  };
  const toggleArea = (area: ResearchArea) => {
    updateDraft(
      "areas",
      draft.areas.includes(area)
        ? draft.areas.filter((item) => item !== area)
        : [...draft.areas, area],
    );
  };
  const toggleMember = (slug: string) => {
    updateDraft(
      "memberSlugs",
      draft.memberSlugs.includes(slug)
        ? draft.memberSlugs.filter((item) => item !== slug)
        : [...draft.memberSlugs, slug],
    );
  };

  const openCoverPicker = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setCoverToEdit(String(reader.result));
    reader.readAsDataURL(file);
  };
  const useEditedCover = (cover: string) => {
    setCoverUpload(cover);
    setCoverToEdit(undefined);
  };

  const save = async () => {
    const research = draftToResearch(draft);
    if (!research.title || !research.slug) {
      toast.error("Title and research URL are required.");
      return;
    }
    if (!isResearchSlug(research.slug)) {
      toast.error("Research URL is not valid", {
        description: "Use lowercase letters, numbers, and hyphens.",
      });
      return;
    }
    if (!research.summary.trim()) {
      toast.error("Add a short summary.");
      return;
    }
    if (!research.question.trim()) {
      toast.error("Add the research question.");
      return;
    }
    if (!research.areas.length) {
      toast.error("Choose at least one focus area.");
      return;
    }
    if (research.startDate && research.endDate && research.endDate < research.startDate) {
      toast.error("The end date cannot be earlier than the start date.");
      return;
    }
    for (const milestone of research.milestones) {
      if (!milestone.date || !milestone.title.trim() || !milestone.summary.trim()) {
        toast.error("Every milestone needs a date, title, and summary.");
        return;
      }
      if (milestone.relatedUrl && !isSafeLink(milestone.relatedUrl)) {
        toast.error("Milestone links must be site paths or https:// URLs.");
        return;
      }
    }
    for (const output of research.outputs) {
      if (!output.label.trim() || !output.href.trim()) {
        toast.error("Every linked output needs a label and a link.");
        return;
      }
      if (!isSafeLink(output.href)) {
        toast.error("Linked outputs must use site paths or https:// URLs.");
        return;
      }
    }
    for (const partner of research.partners ?? []) {
      if (partner.url && !isSafeLink(partner.url)) {
        toast.error("Partner websites must use https:// URLs.");
        return;
      }
    }
    setStatus("saving");
    setError(undefined);
    try {
      let nextResearch = research;
      if (coverUpload) {
        const coverResponse = await fetch(
          `/api/admin/research/${encodeURIComponent(research.slug)}/cover`,
          {
            body: JSON.stringify({ image: coverUpload }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
        if (!coverResponse.ok)
          throw new Error(await responseError(coverResponse, "Cover upload failed."));
        const uploaded = (await coverResponse.json()) as { key: string };
        nextResearch = { ...research, coverKey: uploaded.key };
      }
      const response = await fetch(
        `/api/admin/research/${encodeURIComponent(originalRecordSlug ?? research.slug)}`,
        {
          body: JSON.stringify({ research: nextResearch, body }),
          headers: { "content-type": "application/json" },
          method: "PUT",
        },
      );
      if (!response.ok) throw new Error(await responseError(response, "Research save failed."));
      const savedRecord = (await response.json()) as CmsResearchRecord;
      const savedDraft = researchToDraft(savedRecord.research);
      setDraft(savedDraft);
      setSlugTouched(true);
      setBaseline(JSON.stringify({ draft: savedDraft, body: savedRecord.body }));
      setBody(savedRecord.body);
      setCoverUpload(undefined);
      onSaved(savedRecord);
      window.dispatchEvent(new CustomEvent("mgm:research-updated", { detail: savedRecord }));
      const channel = new BroadcastChannel("mgm-research-cms");
      channel.postMessage({ record: savedRecord, type: "research-updated" });
      channel.close();
      onDirtyChange(false);
      setStatus("saved");
      toast.success("Research initiative saved", {
        description: savedRecord.research.draft
          ? "Saved as a draft. Publish it when the study is ready to go public."
          : `${savedRecord.research.title} is live at /research/${savedRecord.research.slug}.`,
      });
    } catch (saveError) {
      setStatus("error");
      const message =
        saveError instanceof Error ? saveError.message : "The changes could not be saved.";
      setError(message);
      toast.error("Research initiative was not saved", { description: message });
    }
  };

  const remove = async () => {
    if (!originalRecordSlug) return;
    if (!window.confirm(`Delete “${draft.title || originalRecordSlug}” permanently?`)) return;
    try {
      const response = await fetch(
        `/api/admin/research/${encodeURIComponent(originalRecordSlug)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await responseError(response, "Delete failed."));
      onDeleted(originalRecordSlug);
      toast.success("Research initiative deleted");
    } catch (deleteError) {
      toast.error("Research initiative was not deleted", {
        description: deleteError instanceof Error ? deleteError.message : undefined,
      });
    }
  };

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-start justify-between gap-5 border-b border-[#dee4ef] pb-7 dark:border-white/10">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-red uppercase">
            {initialRecord ? "Research initiative" : "New research initiative"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {draft.title || "Untitled initiative"}
          </h1>
          <p className="mt-2 text-sm text-[#69748a] dark:text-white/50">
            {initialRecord
              ? "Editing this initiative."
              : "A new initiative starts as an internal draft."}
          </p>
        </div>
      </div>

      <div className="sticky top-[7.5rem] z-30 mt-5 flex justify-end pointer-events-none">
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          {isDirty ? (
            <span className="rounded-full bg-[#171b25]/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              Unsaved changes
            </span>
          ) : null}
          <button
            aria-label="Save research initiative changes"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-red active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            disabled={status === "saving"}
            onClick={save}
            type="button"
          >
            {status === "saved" ? (
              <Check size={18} weight="bold" />
            ) : (
              <FloppyDisk size={18} weight="bold" />
            )}
            {status === "saving"
              ? "Saving…"
              : status === "saved" && !isDirty
                ? "Saved"
                : "Save initiative"}
          </button>
        </div>
      </div>

      {status === "error" ? (
        <p className="mt-4 rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15 dark:text-brand-red-100">
          {error ?? "The changes could not be saved."}
        </p>
      ) : null}

      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <button
            className="group relative block aspect-[1200/482] w-full overflow-hidden rounded-2xl border border-[#dfe4ee] bg-[#e8ecf4] text-left transition hover:border-brand-red/50 dark:border-white/10 dark:bg-[#1a202b]"
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            {coverUrl ? (
              // Native media avoids an image-component rehydration race for
              // freshly uploaded, private CMS assets.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Research cover preview"
                className="size-full object-cover"
                key={coverUrl}
                src={coverUrl}
              />
            ) : (
              <span className="grid h-full place-items-center">
                <span className="flex flex-col items-center gap-2 text-[#8490a5] dark:text-white/40">
                  <ImageSquare size={30} weight="duotone" />
                  <span className="text-sm font-medium">Upload a cover image</span>
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                    1200 × 482 · JPEG, PNG, or WebP
                  </span>
                </span>
              </span>
            )}
            <span className="absolute inset-x-3 bottom-3 flex justify-end opacity-0 transition group-hover:opacity-100">
              <span className="rounded-lg bg-[#0e1116]/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                {coverUrl ? "Replace cover" : "Choose image"}
              </span>
            </span>
          </button>
          <input
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              openCoverPicker(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
            ref={fileInput}
            type="file"
          />

          <div className="mt-8">
            <textarea
              aria-label="Research title"
              className="w-full resize-none bg-transparent font-display text-4xl font-semibold tracking-[-0.04em] text-[#171b25] outline-none placeholder:text-[#c2c9d6] dark:text-white dark:placeholder:text-white/20"
              onChange={(event) => updateTitle(event.target.value)}
              placeholder="Research title"
              rows={1}
              value={draft.title}
            />
            <textarea
              aria-label="Research question"
              className="mt-3 w-full resize-none rounded-2xl border-l-4 border-brand-red bg-brand-red-50/50 px-4 py-3 text-lg leading-7 text-[#3e4859] outline-none placeholder:text-[#c2c9d6] dark:bg-brand-red/10 dark:text-white/80 dark:placeholder:text-white/25"
              onChange={(event) => updateDraft("question", event.target.value)}
              placeholder="The research question this initiative sets out to answer"
              rows={2}
              value={draft.question}
            />
            <textarea
              aria-label="Short summary"
              className="mt-3 w-full resize-none bg-transparent text-base leading-7 text-[#5d687d] outline-none placeholder:text-[#c2c9d6] dark:text-white/55 dark:placeholder:text-white/20"
              onChange={(event) => updateDraft("summary", event.target.value)}
              placeholder="A short description of the study for index and explorer views"
              rows={2}
              value={draft.summary}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-[#dfe4ee] bg-white p-1 shadow-[0_18px_45px_-35px_rgba(20,32,58,0.5)] dark:border-white/10 dark:bg-white/[0.03]">
            <BlocknoteEditor
              initialContent={body}
              mediaBase="/api/research-cms/media"
              onChange={setBody}
              uploadPath={`/api/admin/research/${encodeURIComponent(draft.slug || "draft")}/cover`}
            />
          </div>
          <p className="mt-3 text-xs text-[#9ba4b5] dark:text-white/35">
            Type <span className="font-semibold">/</span> for blocks, drag the ⋮⋮ handle to
            rearrange, and drop images straight into the page.
          </p>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-[4.75rem]">
          <div className="rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
              Publication
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{draft.draft ? "Draft" : "Published"}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                  {draft.draft
                    ? "Visible only in this workspace."
                    : "Visible to everyone at the research URL."}
                </p>
              </div>
              <button
                aria-checked={!draft.draft}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${draft.draft ? "bg-[#c6cedd] dark:bg-white/15" : "bg-brand-green"}`}
                onClick={() => updateDraft("draft", !draft.draft)}
                role="switch"
                type="button"
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${draft.draft ? "left-0.5" : "left-[1.375rem]"}`}
                />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e6eaf2] pt-4 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold">Featured</p>
                <p className="mt-0.5 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                  Spotlight one published initiative. Publishing another featured one clears this
                  flag.
                </p>
              </div>
              <button
                aria-checked={draft.featured}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${draft.featured ? "bg-brand-red" : "bg-[#c6cedd] dark:bg-white/15"}`}
                onClick={() => updateDraft("featured", !draft.featured)}
                role="switch"
                type="button"
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${draft.featured ? "left-[1.375rem]" : "left-0.5"}`}
                />
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <Field label="Research URL">
              <div className="flex items-center gap-1.5">
                <LinkSimple className="shrink-0 text-[#8490a5]" size={16} />
                <span className="shrink-0 text-xs text-[#9ba4b5]">/research/</span>
                <input
                  className="h-10 w-full min-w-0 rounded-xl border border-[#d9dfeb] bg-white px-3 font-mono text-xs text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white"
                  onChange={(event) => updateSlug(event.target.value)}
                  placeholder="custom-slug"
                  value={draft.slug}
                />
              </div>
            </Field>
            <Field label="Status">
              <div className="flex h-10 items-center gap-1 rounded-xl border border-[#d9dfeb] bg-white p-1 dark:border-white/10 dark:bg-white/[0.045]">
                {RESEARCH_STATUSES.map((entry) => (
                  <button
                    aria-pressed={draft.status === entry}
                    className={`h-8 flex-1 rounded-lg text-xs font-semibold transition ${draft.status === entry ? "bg-[#171b25] text-white dark:bg-white/90 dark:text-[#171b25]" : "text-[#768096] hover:text-[#171b25] dark:text-white/45 dark:hover:text-white"}`}
                    key={entry}
                    onClick={() => updateDraft("status", entry as ResearchStatus)}
                    type="button"
                  >
                    {RESEARCH_STATUS_LABELS[entry]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <div className="relative">
                  <CalendarBlank
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                    size={16}
                  />
                  <input
                    className={`${inputClass} pl-9`}
                    onChange={(event) => updateDraft("startDate", event.target.value)}
                    type="date"
                    value={draft.startDate ?? ""}
                  />
                </div>
              </Field>
              <Field label="End date">
                <div className="relative">
                  <CalendarBlank
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                    size={16}
                  />
                  <input
                    className={`${inputClass} pl-9`}
                    onChange={(event) => updateDraft("endDate", event.target.value)}
                    type="date"
                    value={draft.endDate ?? ""}
                  />
                </div>
              </Field>
            </div>
            <Field label="Focus areas">
              <div className="flex flex-wrap gap-1.5">
                {RESEARCH_AREAS.map((area) => {
                  const active = draft.areas.includes(area);
                  return (
                    <button
                      aria-pressed={active}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-brand-red text-white" : "bg-brand-red-50 text-brand-red hover:bg-brand-red/15 dark:bg-brand-red/15 dark:text-[#ef9a9a]"}`}
                      key={area}
                      onClick={() => toggleArea(area)}
                      type="button"
                    >
                      {RESEARCH_AREA_LABELS[area]}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Members">
              <MemberPicker
                members={members}
                onToggle={toggleMember}
                selected={draft.memberSlugs}
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
                <UsersThree size={13} />
                Members link to their member profiles on the public page.
              </p>
            </Field>
            <Field label="Methods">
              <TagListEditor
                onAdd={(value) => {
                  if (!draft.methods.includes(value)) {
                    updateDraft("methods", [...draft.methods, value]);
                  }
                }}
                onRemove={(value) =>
                  updateDraft(
                    "methods",
                    draft.methods.filter((item) => item !== value),
                  )
                }
                placeholder="Add a method"
                values={draft.methods}
              />
            </Field>
          </div>

          <div className="space-y-3 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                Milestones
              </p>
              <p className="mt-1 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                Only meaningful public events: prototype tests, evaluations, accepted papers,
                releases, deliveries. No internal meetings or raw notes.
              </p>
            </div>
            <div className="space-y-3">
              {draft.milestones.map((milestone) => (
                <MilestoneEditor
                  key={milestone.id}
                  milestone={milestone}
                  onChange={(next) =>
                    updateDraft(
                      "milestones",
                      draft.milestones.map((item) => (item.id === next.id ? next : item)),
                    )
                  }
                  onRemove={() =>
                    updateDraft(
                      "milestones",
                      draft.milestones.filter((item) => item.id !== milestone.id),
                    )
                  }
                />
              ))}
            </div>
            <AddButton
              onClick={() => updateDraft("milestones", [...draft.milestones, newMilestone()])}
            >
              Add milestone
            </AddButton>
          </div>

          <div className="space-y-3 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                Linked outputs
              </p>
              <p className="mt-1 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                Projects, publications, and articles that grew out of this study. Link real records
                only.
              </p>
            </div>
            <div className="space-y-3">
              {draft.outputs.map((output) => (
                <OutputEditor
                  key={output.id}
                  onChange={(next) =>
                    updateDraft(
                      "outputs",
                      draft.outputs.map((item) => (item.id === next.id ? next : item)),
                    )
                  }
                  onRemove={() =>
                    updateDraft(
                      "outputs",
                      draft.outputs.filter((item) => item.id !== output.id),
                    )
                  }
                  output={output}
                />
              ))}
            </div>
            <AddButton onClick={() => updateDraft("outputs", [...draft.outputs, newOutput()])}>
              Add linked output
            </AddButton>
          </div>

          <div className="space-y-3 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                Partners and funders
              </p>
              <p className="mt-1 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                Shown publicly only when supplied, and only with the partner&apos;s permission.
              </p>
            </div>
            <div className="space-y-3">
              {(draft.partners ?? []).map((partner, index) => (
                <PartnerEditor
                  key={index}
                  onChange={(next) =>
                    updateDraft(
                      "partners",
                      (draft.partners ?? []).map((item, itemIndex) =>
                        itemIndex === index ? next : item,
                      ),
                    )
                  }
                  onRemove={() =>
                    updateDraft(
                      "partners",
                      (draft.partners ?? []).filter((_item, itemIndex) => itemIndex !== index),
                    )
                  }
                  partner={partner}
                />
              ))}
            </div>
            <AddButton
              onClick={() => updateDraft("partners", [...(draft.partners ?? []), newPartner()])}
            >
              Add partner
            </AddButton>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
              Context and SEO
            </p>
            <Field label="Context">
              <textarea
                className={textareaClass}
                onChange={(event) => updateDraft("context", event.target.value)}
                placeholder="The situation or problem that motivates the study (optional)"
                rows={3}
                value={draft.context ?? ""}
              />
            </Field>
            <Field label="Intended contribution">
              <textarea
                className={textareaClass}
                onChange={(event) => updateDraft("contribution", event.target.value)}
                placeholder="What the study intends to add, and how it connects to the lab's work (optional)"
                rows={3}
                value={draft.contribution ?? ""}
              />
            </Field>
            <Field label="Cover alt text">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("coverAlt", event.target.value)}
                placeholder="A short description of the cover image (optional)"
                value={draft.coverAlt ?? ""}
              />
            </Field>
            <Field label="SEO title">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("seoTitle", event.target.value)}
                placeholder="Defaults to the initiative title (optional)"
                value={draft.seoTitle ?? ""}
              />
            </Field>
            <Field label="SEO description">
              <textarea
                className={textareaClass}
                onChange={(event) => updateDraft("seoDescription", event.target.value)}
                placeholder="Defaults to the short summary (optional)"
                rows={2}
                value={draft.seoDescription ?? ""}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3">
            {initialRecord ? (
              <Link
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#5d687d] transition hover:bg-white hover:text-brand-red dark:text-white/60 dark:hover:bg-white/10"
                href={`/research/${encodeURIComponent(originalRecordSlug ?? "")}`}
                target="_blank"
              >
                <ArrowSquareOut size={15} />
                View page
              </Link>
            ) : (
              <span className="px-3 py-2 text-xs text-[#9ba4b5] dark:text-white/35">
                Preview link appears after the first save
              </span>
            )}
            {initialRecord ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#5d687d] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/60 dark:hover:bg-brand-red/15"
                onClick={remove}
                type="button"
              >
                <Trash size={15} />
                Delete
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      {coverToEdit ? (
        <CoverCropDialog
          image={coverToEdit}
          onClose={() => setCoverToEdit(undefined)}
          onConfirm={useEditedCover}
        />
      ) : null}
    </div>
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
