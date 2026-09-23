"use client";

import {
  ArrowSquareOut,
  ArrowDown,
  ArrowUp,
  CalendarBlank,
  CaretDown,
  Check,
  FloppyDisk,
  ImageSquare,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  Tag,
  Trash,
  User,
  X,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Cropper, { type Area } from "react-easy-crop";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { Member } from "@/data/members";
import type { ArticleBlock } from "@/lib/article-cms";
import {
  draftToProject,
  emptyProjectDraft,
  isProjectSlug,
  projectMediaUrl,
  projectToDraft,
  slugify,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type CmsProjectRecord,
  type ProjectCategory,
  type ProjectContributor,
  type ProjectContributorKind,
  type ProjectDraft,
  type ProjectLink,
  type ProjectMediaItem,
  type ProjectOrganization,
  type ProjectOutputLink,
  type ProjectStatus,
} from "@/lib/project-cms";
import { PhotoCropDialog, type PhotoCropPosition } from "@/components/admin/photo-crop-dialog";
import { DetailPageFields } from "@/components/admin/project-editor/detail-page-fields";
import {
  MediaSections,
  type MediaUploadStatus,
} from "@/components/admin/project-editor/media-sections";
import { Field, inputClass, textareaClass } from "@/components/admin/project-editor/ui";
import {
  cleanMediaItem,
  detailErrorsFromApi,
  hasDetailErrors,
  noDetailErrors,
  validateDetailFields,
  type DetailErrors,
  type DetailField,
} from "@/components/admin/project-editor/validation";

const BlocknoteEditor = dynamic(() => import("./blocknote-editor"), {
  ssr: false,
  loading: () => (
    <div className="grid h-72 place-items-center rounded-2xl border border-[#dfe4ee] bg-white/60 text-sm text-[#8490a5] dark:border-white/10 dark:bg-white/[0.03]">
      Loading the writing surface…
    </div>
  ),
});

const RESIDENCE_AFFILIATION = "MGM Laboratory, University of Brawijaya";

const OUTPUT_TYPES: { id: ProjectOutputLink["type"]; label: string }[] = [
  { id: "research", label: "Research" },
  { id: "publication", label: "Publication" },
  { id: "article", label: "Article" },
];

/** Site paths (a single leading slash) and http(s) URLs only, like the API. */
function isSafeLink(value: string) {
  return /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value);
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
              The cover renders at a 3:2 ratio with rounded corners.
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
        <div className="relative mt-4 aspect-[3/2] w-full overflow-hidden rounded-xl bg-[#e8ecf4] dark:bg-[#1a202b]">
          <Cropper
            aspect={3 / 2}
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
  onClear,
  onChoose,
  selectedSlug,
}: {
  members: readonly Member[];
  onClear: () => void;
  onChoose: (memberSlug: string) => void;
  selectedSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selected = members.find((member) => member.slug === selectedSlug);
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
        aria-haspopup="listbox"
        className={`${inputClass} flex items-center gap-2 px-3 text-left`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <User className="shrink-0 text-[#8490a5]" size={16} />
        <span
          className={`min-w-0 flex-1 truncate ${selected ? "text-[#171b25] dark:text-white" : "text-[#9ba4b5] dark:text-white/25"}`}
        >
          {selected ? selected.name : "Search a member…"}
        </span>
        {selected ? (
          <span
            aria-label="Clear selected member"
            className="grid size-6 shrink-0 place-items-center rounded-md text-[#8490a5] transition hover:bg-brand-red-50 hover:text-brand-red"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            role="button"
          >
            <X size={12} weight="bold" />
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[10px] text-[#9ba4b5]">{members.length}</span>
        )}
      </button>

      {open ? (
        <div
          aria-label="Lab members"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-40 w-full rounded-2xl border border-[#dfe4ee] bg-white p-2 shadow-[0_24px_55px_-28px_rgba(20,32,58,0.36)] dark:border-white/10 dark:bg-[#171b25]"
          role="listbox"
        >
          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
              size={14}
            />
            <input
              autoFocus
              className="h-9 w-full rounded-lg border border-[#d9dfeb] bg-white pl-8 pr-3 text-sm outline-none focus:border-brand-blue dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, nickname, or division"
              value={query}
            />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto">
            {visible.map((member) => {
              const active = member.slug === selectedSlug;
              return (
                <button
                  aria-selected={active}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20" : "text-[#4f5a6f] hover:bg-[#f5f7fb] dark:text-white/70 dark:hover:bg-white/[0.06]"}`}
                  key={member.slug}
                  onClick={() => {
                    onChoose(member.slug);
                    setOpen(false);
                  }}
                  role="option"
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

type ContributorPhotoUpload = { dataUrl: string; position: PhotoCropPosition };

function ContributorRow({
  contributor,
  index,
  members,
  onChoosePhoto,
  onChange,
  onClearPhoto,
  onMove,
  onRemove,
  photoRemoved,
  photoUpload,
  total,
}: {
  contributor: ProjectContributor;
  index: number;
  members: readonly Member[];
  onChoosePhoto: (file?: File) => void;
  onChange: (contributor: ProjectContributor) => void;
  onClearPhoto: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  photoRemoved: boolean;
  photoUpload?: ContributorPhotoUpload;
  total: number;
}) {
  const kind = contributor.kind ?? "non-residence";
  const setKind = (next: ProjectContributorKind) => onChange({ ...contributor, kind: next });

  const chooseMember = (memberSlug: string) => {
    const member = members.find((entry) => entry.slug === memberSlug);
    onChange({
      ...contributor,
      memberSlug: memberSlug || undefined,
      name: member?.name ?? contributor.name,
      affiliation: contributor.affiliation || RESIDENCE_AFFILIATION,
    });
  };

  const photoSource = photoUpload ? photoUpload.dataUrl : projectMediaUrl(contributor.photoKey);
  const shownPhotoSource = photoRemoved ? undefined : photoSource;
  const position = photoUpload?.position ?? contributor.photoPosition;

  const kindButton = (value: ProjectContributorKind, label: string) => (
    <button
      aria-pressed={kind === value}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        kind === value
          ? "bg-brand-blue text-white"
          : "bg-[#f1f4fa] text-[#5d687d] hover:bg-[#e8edf6] dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
      }`}
      onClick={() => setKind(value)}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
          Contributor {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-[#f1f4fa] p-1 dark:bg-white/[0.06]">
            {kindButton("residence", "Residence")}
            {kindButton("non-residence", "Non-Residence")}
          </div>
          <button
            aria-label="Move contributor up"
            className="rounded-lg p-1.5 text-[#7e899e] transition hover:bg-[#f5f7fb] hover:text-brand-blue disabled:opacity-30 dark:text-white/40 dark:hover:bg-white/[0.06]"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            type="button"
          >
            <ArrowUp size={14} />
          </button>
          <button
            aria-label="Move contributor down"
            className="rounded-lg p-1.5 text-[#7e899e] transition hover:bg-[#f5f7fb] hover:text-brand-blue disabled:opacity-30 dark:text-white/40 dark:hover:bg-white/[0.06]"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            type="button"
          >
            <ArrowDown size={14} />
          </button>
          <button
            aria-label="Remove contributor"
            className="rounded-lg p-1.5 text-[#7e899e] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/40 dark:hover:bg-brand-red/15"
            onClick={onRemove}
            type="button"
          >
            <Trash size={14} />
          </button>
        </div>
      </div>

      {kind === "residence" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Lab member">
            <MemberPicker
              members={members}
              onChoose={chooseMember}
              onClear={() => onChange({ ...contributor, memberSlug: undefined, name: "" })}
              selectedSlug={contributor.memberSlug}
            />
          </Field>
          <Field label="Role on this project (optional)">
            <input
              className={inputClass}
              onChange={(event) => onChange({ ...contributor, role: event.target.value })}
              placeholder="Lead Developer"
              value={contributor.role ?? ""}
            />
          </Field>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contributor name (full name)">
              <input
                className={inputClass}
                onChange={(event) => onChange({ ...contributor, name: event.target.value })}
                placeholder="Ayu Paramitha"
                value={contributor.name}
              />
            </Field>
            <Field label="Role on this project (optional)">
              <input
                className={inputClass}
                onChange={(event) => onChange({ ...contributor, role: event.target.value })}
                placeholder="Design partner"
                value={contributor.role ?? ""}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Affiliation / organization">
              <input
                className={inputClass}
                onChange={(event) => onChange({ ...contributor, affiliation: event.target.value })}
                placeholder="Faculty of Computer Science, University of Brawijaya"
                value={contributor.affiliation ?? ""}
              />
            </Field>
            <Field label="Public profile link">
              <div className="flex items-center gap-1.5">
                <LinkSimple className="shrink-0 text-[#8490a5]" size={16} />
                <input
                  className={`${inputClass} font-mono text-xs`}
                  onChange={(event) => onChange({ ...contributor, url: event.target.value })}
                  placeholder="https://example.com/profile"
                  value={contributor.url ?? ""}
                />
              </div>
            </Field>
          </div>
          <Field label="Portrait">
            <div className="flex items-center gap-2">
              <button
                aria-label="Choose portrait"
                className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-dashed border-[#c6cedd] bg-[#f8fafd] text-[#8490a5] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/15 dark:bg-white/[0.03] dark:text-white/40"
                onClick={() => onChoosePhoto()}
                type="button"
              >
                {shownPhotoSource ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="size-full object-cover"
                    src={shownPhotoSource}
                    style={
                      position
                        ? {
                            objectPosition: `${position.x}% ${position.y}%`,
                            transform: `scale(${position.zoom})`,
                          }
                        : undefined
                    }
                  />
                ) : (
                  <ImageSquare size={17} />
                )}
              </button>
              <button
                className="text-xs font-semibold text-[#5d687d] transition hover:text-brand-blue dark:text-white/60"
                onClick={() => onChoosePhoto()}
                type="button"
              >
                {shownPhotoSource ? "Change" : "Upload"}
              </button>
              {shownPhotoSource ? (
                <button
                  className="text-xs font-semibold text-[#5d687d] transition hover:text-brand-red dark:text-white/60"
                  onClick={onClearPhoto}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

function LinkEditor({
  link,
  onChange,
  onRemove,
}: {
  link: ProjectLink;
  onChange: (next: ProjectLink) => void;
  onRemove: () => void;
}) {
  return (
    <EditRow onRemove={onRemove}>
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Label">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...link, label: event.target.value })}
            placeholder="GitHub"
            value={link.label}
          />
        </Field>
        <Field label="URL">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...link, url: event.target.value })}
            placeholder="https://github.com/..."
            value={link.url}
          />
        </Field>
      </div>
    </EditRow>
  );
}

function OrganizationEditor({
  organization,
  onChange,
  onRemove,
}: {
  organization: ProjectOrganization;
  onChange: (next: ProjectOrganization) => void;
  onRemove: () => void;
}) {
  return (
    <EditRow onRemove={onRemove}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...organization, name: event.target.value })}
            placeholder="Partner or client organization"
            value={organization.name}
          />
        </Field>
        <Field label="Website (optional)">
          <input
            className={inputClass}
            onChange={(event) => onChange({ ...organization, url: event.target.value })}
            placeholder="https://..."
            value={organization.url ?? ""}
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
  output: ProjectOutputLink;
  onChange: (next: ProjectOutputLink) => void;
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
            placeholder="What the linked record is called"
            value={output.label}
          />
        </Field>
      </div>
      <Field label="Link">
        <input
          className={inputClass}
          onChange={(event) => onChange({ ...output, href: event.target.value })}
          placeholder="/research/... or https://..."
          value={output.href}
        />
      </Field>
    </EditRow>
  );
}

/**
 * What the unsaved-changes check compares. Media section sizes are left out:
 * measuring an older record's sections fills them in without an edit, and
 * the next save stores them.
 */
function editorSignature(
  draft: ProjectDraft,
  body: ArticleBlock[],
  contributorPhotos: string[] = [],
  removedContributorPhotos: string[] = [],
) {
  return JSON.stringify({
    draft: {
      ...draft,
      media: (draft.media ?? []).map((item) => ({ ...item, width: 0, height: 0 })),
    },
    body,
    contributorPhotos,
    removedContributorPhotos,
  });
}

function newLink(): ProjectLink {
  return { id: crypto.randomUUID(), label: "", url: "" };
}
function newOutput(): ProjectOutputLink {
  return { id: crypto.randomUUID(), type: "research", label: "", href: "" };
}
function newOrganization(): ProjectOrganization {
  return { name: "" };
}

export function ProjectEditor({
  initialRecord,
  members,
  onDeleted,
  onDirtyChange,
  onSaved,
  videoLimitBytes,
}: {
  initialRecord?: CmsProjectRecord;
  members: readonly Member[];
  onDeleted: (slug: string) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: (record: CmsProjectRecord) => void;
  videoLimitBytes: number;
}) {
  const [initial] = useState(() =>
    initialRecord
      ? { draft: projectToDraft(initialRecord.project), body: initialRecord.body }
      : { draft: emptyProjectDraft(), body: [] },
  );
  const [draft, setDraft] = useState<ProjectDraft>(initial.draft);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialRecord));
  const [body, setBody] = useState<ArticleBlock[]>(initial.body);
  const [coverUpload, setCoverUpload] = useState<string>();
  const [coverToEdit, setCoverToEdit] = useState<string>();
  const [mediaStatus, setMediaStatus] = useState<MediaUploadStatus>({ busy: 0, failed: 0 });
  // The detail page no longer renders the write-up, so it starts folded away.
  const [writeUpOpen, setWriteUpOpen] = useState(false);
  const [contributorPhotos, setContributorPhotos] = useState<
    Record<string, ContributorPhotoUpload>
  >({});
  const [removedContributorPhotos, setRemovedContributorPhotos] = useState<Record<string, boolean>>(
    {},
  );
  const [photoToEdit, setPhotoToEdit] = useState<{ contributorId: string; image: string }>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  // Detail page validation: client errors show once a save was attempted
  // (or the field was left); API 400s land on their field until it changes.
  const [revealDetailErrors, setRevealDetailErrors] = useState(false);
  const [apiDetailErrors, setApiDetailErrors] = useState<DetailErrors>(noDetailErrors);
  const editorRoot = useRef<HTMLDivElement>(null);
  const [originalRecordSlug] = useState(initialRecord?.slug);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<string | undefined>(undefined);

  const [baseline, setBaseline] = useState(() => editorSignature(initial.draft, initial.body));
  const signature = editorSignature(
    draft,
    body,
    Object.keys(contributorPhotos).sort((left, right) => left.localeCompare(right)),
    Object.keys(removedContributorPhotos).sort((left, right) => left.localeCompare(right)),
  );
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
    () => coverUpload ?? projectMediaUrl(draft.coverKey),
    [coverUpload, draft.coverKey],
  );
  const updateDraft = <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => {
    if (status === "saved") setStatus("idle");
    setDraft((current) => ({ ...current, [key]: value }));
  };
  // Media sections change from async upload callbacks, so they update
  // through the latest draft rather than the render that started them.
  const updateMedia = useCallback((update: (items: ProjectMediaItem[]) => ProjectMediaItem[]) => {
    setStatus((current) => (current === "saved" ? "idle" : current));
    setDraft((current) => {
      const items = current.media ?? [];
      const next = update(items);
      return next === items ? current : { ...current, media: next };
    });
    setApiDetailErrors((current) =>
      current.media || Object.keys(current.mediaRows).length
        ? { ...current, media: undefined, mediaRows: {} }
        : current,
    );
  }, []);
  const mediaUploadSlug = isProjectSlug(draft.slug) ? draft.slug : "draft";
  const detailErrors = useMemo(() => validateDetailFields(draft), [draft]);
  const detailFieldsOf: Record<"theme" | "description" | "cta" | "services", DetailField[]> = {
    theme: ["theme"],
    description: ["description"],
    cta: ["ctaLabel", "ctaUrl"],
    services: ["services"],
  };
  const updateDetail = <K extends "theme" | "description" | "cta" | "services">(
    key: K,
    value: ProjectDraft[K],
  ) => {
    updateDraft(key, value);
    setApiDetailErrors((current) => {
      const fields = detailFieldsOf[key];
      if (!fields.some((field) => current[field])) return current;
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  };
  /** Brings the first field flagged invalid into view once errors render. */
  const focusFirstInvalid = () => {
    window.requestAnimationFrame(() => {
      const field = editorRoot.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.scrollIntoView({ block: "center" });
      field?.focus({ preventScroll: true });
    });
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
  const toggleCategory = (category: ProjectCategory) => {
    updateDraft(
      "categories",
      draft.categories.includes(category)
        ? draft.categories.filter((item) => item !== category)
        : [...draft.categories, category],
    );
  };
  const moveContributor = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.contributors.length) return;
    const contributors = [...draft.contributors];
    [contributors[index], contributors[target]] = [contributors[target], contributors[index]];
    updateDraft("contributors", contributors);
  };
  const addContributor = () => {
    updateDraft("contributors", [
      ...draft.contributors,
      { id: crypto.randomUUID(), kind: "non-residence", name: "", affiliation: "" },
    ]);
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

  const openContributorPhotoPicker = (contributorId: string, file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoToEdit({ contributorId, image: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const applyEditedContributorPhoto = (
    contributorId: string,
    dataUrl: string,
    position: PhotoCropPosition,
  ) => {
    setContributorPhotos((current) => ({ ...current, [contributorId]: { dataUrl, position } }));
    setRemovedContributorPhotos((current) => ({ ...current, [contributorId]: false }));
    setPhotoToEdit(undefined);
    if (status === "saved") setStatus("idle");
  };
  const clearContributorPhoto = (contributorId: string) => {
    setContributorPhotos((current) => {
      const next = { ...current };
      delete next[contributorId];
      return next;
    });
    setRemovedContributorPhotos((current) => ({ ...current, [contributorId]: true }));
    if (status === "saved") setStatus("idle");
  };

  /** Resolves true once the record is saved, false when validation or the request stops it. */
  const save = async (overrideDraft?: ProjectDraft): Promise<boolean> => {
    let project = draftToProject(overrideDraft ?? draft);
    if (!project.title || !project.slug) {
      toast.error("Title and project URL are required.");
      return false;
    }
    if (!isProjectSlug(project.slug)) {
      toast.error("Project URL is not valid", {
        description: "Use lowercase letters, numbers, and hyphens.",
      });
      return false;
    }
    if (!project.summary.trim()) {
      toast.error("Add a short summary.");
      return false;
    }
    if (!project.categories.length) {
      toast.error("Choose at least one category.");
      return false;
    }
    if (project.startDate && project.endDate && project.endDate < project.startDate) {
      toast.error("The end date cannot be earlier than the start date.");
      return false;
    }
    for (const link of project.links) {
      if (!link.label.trim() || !link.url.trim()) {
        toast.error("Every link needs a label and a URL.");
        return false;
      }
      if (!isSafeLink(link.url)) {
        toast.error("Links must be site paths or https:// URLs.");
        return false;
      }
    }
    for (const organization of project.organizations) {
      if (organization.url && !isSafeLink(organization.url)) {
        toast.error("Organization websites must use https:// URLs.");
        return false;
      }
    }
    for (const output of project.outputs) {
      if (!output.label.trim() || !output.href.trim()) {
        toast.error("Every linked output needs a label and a link.");
        return false;
      }
      if (!isSafeLink(output.href)) {
        toast.error("Linked outputs must use site paths or https:// URLs.");
        return false;
      }
    }
    if (mediaStatus.busy) {
      toast.error("Media is still uploading", {
        description: "Save once every section has finished uploading.",
      });
      return false;
    }
    if (mediaStatus.failed || project.media?.some((item) => !item.key)) {
      toast.error("Some media sections have no file", {
        description: "Retry or remove the sections whose upload failed.",
      });
      document.getElementById("project-media-sections")?.scrollIntoView({ block: "start" });
      return false;
    }
    const detailCheck = validateDetailFields(overrideDraft ?? draft);
    if (hasDetailErrors(detailCheck)) {
      setRevealDetailErrors(true);
      const { mediaRows, ...fields } = detailCheck;
      toast.error("Check the detail page fields", {
        description: Object.values(fields).find(Boolean) ?? Object.values(mediaRows)[0],
      });
      focusFirstInvalid();
      return false;
    }

    setStatus("saving");
    setError(undefined);
    try {
      // Contributor portraits upload first, then the record references their keys.
      const contributors = project.contributors.map((contributor) => ({ ...contributor }));
      for (const contributor of contributors) {
        const upload = contributorPhotos[contributor.id];
        if (upload) {
          const response = await fetch("/api/admin/projects/contributor-photo", {
            body: JSON.stringify({ image: upload.dataUrl }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          if (!response.ok)
            throw new Error(await responseError(response, "Portrait upload failed."));
          const uploaded = (await response.json()) as { key: string };
          contributor.photoKey = uploaded.key;
          contributor.photoPosition = upload.position;
        } else if (removedContributorPhotos[contributor.id]) {
          delete contributor.photoKey;
          delete contributor.photoPosition;
        }
      }
      project = { ...project, contributors };

      if (coverUpload) {
        const response = await fetch(
          `/api/admin/projects/${encodeURIComponent(project.slug)}/media`,
          {
            body: JSON.stringify({ image: coverUpload }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
        if (!response.ok) throw new Error(await responseError(response, "Cover upload failed."));
        const uploaded = (await response.json()) as { key: string };
        project = { ...project, coverKey: uploaded.key };
      }

      // Media sections uploaded as they were added, so only their keys are
      // saved here. The gallery keeps mirroring the image sections for
      // older consumers (the homepage showcase, the list card fallback);
      // the demo video fields stay exactly as they were.
      const media = (project.media ?? []).map(cleanMediaItem);
      const galleryKeys = [
        ...new Set(
          media
            .filter((item) => item.kind === "image" && item.key !== project.coverKey)
            .map((item) => item.key),
        ),
      ].slice(0, 20);
      project = { ...project, media, galleryKeys };

      const response = await fetch(
        `/api/admin/projects/${encodeURIComponent(originalRecordSlug ?? project.slug)}`,
        {
          body: JSON.stringify({ project, body }),
          headers: { "content-type": "application/json" },
          method: "PUT",
        },
      );
      if (!response.ok) throw new Error(await responseError(response, "Project save failed."));
      const savedRecord = (await response.json()) as CmsProjectRecord;
      const savedDraft = projectToDraft(savedRecord.project);
      setDraft(savedDraft);
      setSlugTouched(true);
      setBody(savedRecord.body);
      setCoverUpload(undefined);
      setContributorPhotos({});
      setRemovedContributorPhotos({});
      setApiDetailErrors(noDetailErrors());
      setBaseline(editorSignature(savedDraft, savedRecord.body));
      onSaved(savedRecord);
      window.dispatchEvent(new CustomEvent("mgm:project-updated", { detail: savedRecord }));
      const channel = new BroadcastChannel("mgm-project-cms");
      channel.postMessage({ record: savedRecord, type: "project-updated" });
      channel.close();
      onDirtyChange(false);
      setStatus("saved");
      toast.success("Project saved", {
        description: savedRecord.project.draft
          ? "Saved as a draft. Publish it when the project is ready to go public."
          : `${savedRecord.project.title} is live at /projects/${savedRecord.project.slug}.`,
      });
      return true;
    } catch (saveError) {
      setStatus("error");
      const message =
        saveError instanceof Error ? saveError.message : "The changes could not be saved.";
      setError(message);
      toast.error("Project was not saved", { description: message });
      const fieldErrors = detailErrorsFromApi(message, project.media ?? []);
      if (fieldErrors) {
        setApiDetailErrors(fieldErrors);
        focusFirstInvalid();
      }
      return false;
    }
  };

  // The Publication card's switch and button both flip and save in one
  // step, so publishing never depends on remembering the separate
  // "Save project" action above.
  const togglePublish = async () => {
    const nextDraft: ProjectDraft = { ...draft, draft: !draft.draft };
    setDraft(nextDraft);
    // A refused or failed save puts the switch back, so it always shows
    // the state the record is actually in.
    if (!(await save(nextDraft))) {
      setDraft((current) => ({ ...current, draft: !nextDraft.draft }));
    }
  };

  const remove = async () => {
    if (!originalRecordSlug) return;
    if (!window.confirm(`Delete “${draft.title || originalRecordSlug}” permanently?`)) return;
    try {
      const response = await fetch(
        `/api/admin/projects/${encodeURIComponent(originalRecordSlug)}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error(await responseError(response, "Delete failed."));
      onDeleted(originalRecordSlug);
      toast.success("Project deleted");
    } catch (deleteError) {
      toast.error("Project was not deleted", {
        description: deleteError instanceof Error ? deleteError.message : undefined,
      });
    }
  };

  return (
    <div ref={editorRoot}>
      <div className="mt-10 flex flex-wrap items-start justify-between gap-5 border-b border-[#dee4ef] pb-7 dark:border-white/10">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-red uppercase">
            {initialRecord ? "Project" : "New project"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {draft.title || "Untitled project"}
          </h1>
          <p className="mt-2 text-sm text-[#69748a] dark:text-white/50">
            {initialRecord ? "Editing this project." : "A new project starts as an internal draft."}
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
            aria-label="Save project changes"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-red active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            disabled={status === "saving"}
            onClick={() => save()}
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
                : "Save project"}
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
            className="group relative block aspect-[3/2] w-full overflow-hidden rounded-2xl border border-[#dfe4ee] bg-[#e8ecf4] text-left transition hover:border-brand-red/50 dark:border-white/10 dark:bg-[#1a202b]"
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Project cover preview"
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
                    1200 × 800 · JPEG, PNG, or WebP
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
              aria-label="Project title"
              className="w-full resize-none bg-transparent font-display text-4xl font-semibold tracking-[-0.04em] text-[#171b25] outline-none placeholder:text-[#c2c9d6] dark:text-white dark:placeholder:text-white/20"
              onChange={(event) => updateTitle(event.target.value)}
              placeholder="Project title"
              rows={1}
              value={draft.title}
            />
            <textarea
              aria-describedby="project-summary-hint"
              aria-label="Summary"
              className="mt-3 w-full resize-none bg-transparent text-base leading-7 text-[#5d687d] outline-none placeholder:text-[#c2c9d6] dark:text-white/55 dark:placeholder:text-white/20"
              onChange={(event) => updateDraft("summary", event.target.value)}
              placeholder="A one or two sentence summary of the project"
              rows={2}
              value={draft.summary}
            />
            <p
              className="mt-1 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35"
              id="project-summary-hint"
            >
              <span className="font-semibold text-[#687187] dark:text-white/50">Summary.</span> Used
              on project cards, in search results and in link previews. The detail page shows the
              description below, and falls back to this summary while that is empty.
            </p>
          </div>

          <div className="mt-8">
            <DetailPageFields
              apiErrors={apiDetailErrors}
              draft={draft}
              errors={detailErrors}
              onChange={updateDetail}
              revealAll={revealDetailErrors}
            >
              <div className="space-y-3">
                {draft.links.map((link) => (
                  <LinkEditor
                    key={link.id}
                    link={link}
                    onChange={(next) =>
                      updateDraft(
                        "links",
                        draft.links.map((item) => (item.id === next.id ? next : item)),
                      )
                    }
                    onRemove={() =>
                      updateDraft(
                        "links",
                        draft.links.filter((item) => item.id !== link.id),
                      )
                    }
                  />
                ))}
              </div>
              <div className={draft.links.length ? "mt-3" : undefined}>
                <AddButton onClick={() => updateDraft("links", [...draft.links, newLink()])}>
                  Add link
                </AddButton>
              </div>
            </DetailPageFields>
          </div>

          <div className="mt-5">
            <MediaSections
              generalError={apiDetailErrors.media ?? detailErrors.media}
              items={draft.media ?? []}
              onChange={updateMedia}
              onStatusChange={setMediaStatus}
              published={Boolean(initialRecord && !initialRecord.project.draft)}
              rowErrors={{ ...detailErrors.mediaRows, ...apiDetailErrors.mediaRows }}
              uploadSlug={mediaUploadSlug}
              videoLimitBytes={videoLimitBytes}
            />
          </div>

          <section className="mt-5 rounded-2xl border border-[#dfe4ee] bg-white shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <button
              aria-controls="project-write-up"
              aria-expanded={writeUpOpen}
              className="group flex w-full items-start justify-between gap-4 rounded-2xl p-4 text-left transition hover:bg-[#f8fafd] focus-visible:ring-4 focus-visible:ring-brand-blue/15 focus-visible:outline-none dark:hover:bg-white/[0.03]"
              onClick={() => setWriteUpOpen((current) => !current)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                  Write-up (archive)
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#8490a5] dark:text-white/40">
                  Kept with the project for reference. The detail page shows the description, media
                  sections, services and links instead.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 pt-0.5 text-xs font-semibold text-[#5d687d] dark:text-white/55">
                {body.length ? `${body.length} block${body.length === 1 ? "" : "s"}` : "Empty"}
                <CaretDown
                  aria-hidden="true"
                  className="transition group-aria-expanded:rotate-180"
                  size={14}
                  weight="bold"
                />
              </span>
            </button>
            {writeUpOpen ? (
              <div className="px-4 pb-4" id="project-write-up">
                <div className="rounded-2xl border border-[#dfe4ee] bg-white p-1 shadow-[0_18px_45px_-35px_rgba(20,32,58,0.5)] dark:border-white/10 dark:bg-white/[0.03]">
                  <BlocknoteEditor
                    initialContent={body}
                    mediaBase="/api/projects-cms/media"
                    onChange={setBody}
                    uploadPath={`/api/admin/projects/${encodeURIComponent(draft.slug || "draft")}/media`}
                  />
                </div>
                <p className="mt-3 text-xs text-[#9ba4b5] dark:text-white/35">
                  Type <span className="font-semibold">/</span> for blocks, drag the ⋮⋮ handle to
                  rearrange, and drop images straight into the page.
                </p>
              </div>
            ) : null}
          </section>

          <div className="mt-8 space-y-5">
            <div className="space-y-3 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                  Contributors
                </p>
                <button
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-blue transition hover:bg-brand-blue-50"
                  onClick={addContributor}
                  type="button"
                >
                  <Plus size={13} weight="bold" />
                  Add contributor
                </button>
              </div>
              <div className="space-y-3">
                {draft.contributors.map((contributor, index) => (
                  <ContributorRow
                    contributor={contributor}
                    index={index}
                    key={contributor.id}
                    members={members}
                    onChange={(next) =>
                      updateDraft(
                        "contributors",
                        draft.contributors.map((item) =>
                          item.id === contributor.id ? next : item,
                        ),
                      )
                    }
                    onChoosePhoto={(file) => {
                      photoTarget.current = contributor.id;
                      if (file) openContributorPhotoPicker(contributor.id, file);
                      else photoInput.current?.click();
                    }}
                    onClearPhoto={() => clearContributorPhoto(contributor.id)}
                    onMove={(direction) => moveContributor(index, direction)}
                    onRemove={() =>
                      updateDraft(
                        "contributors",
                        draft.contributors.filter((item) => item.id !== contributor.id),
                      )
                    }
                    photoRemoved={Boolean(removedContributorPhotos[contributor.id])}
                    photoUpload={contributorPhotos[contributor.id]}
                    total={draft.contributors.length}
                  />
                ))}
                {!draft.contributors.length ? (
                  <p className="rounded-xl border border-dashed border-[#d9dfeb] px-3 py-5 text-center text-xs leading-5 text-[#9ba4b5] dark:border-white/10 dark:text-white/35">
                    No contributors yet.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                Organizations
              </p>
              <div className="space-y-3">
                {draft.organizations.map((organization, index) => (
                  <OrganizationEditor
                    key={index}
                    onChange={(next) =>
                      updateDraft(
                        "organizations",
                        draft.organizations.map((item, itemIndex) =>
                          itemIndex === index ? next : item,
                        ),
                      )
                    }
                    onRemove={() =>
                      updateDraft(
                        "organizations",
                        draft.organizations.filter((_item, itemIndex) => itemIndex !== index),
                      )
                    }
                    organization={organization}
                  />
                ))}
              </div>
              <AddButton
                onClick={() =>
                  updateDraft("organizations", [...draft.organizations, newOrganization()])
                }
              >
                Add organization
              </AddButton>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                  Related outputs
                </p>
                <p className="mt-1 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                  Research, publications, and articles connected to this project.
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
          </div>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-[4.75rem]">
          <div className="rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
              Publication
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {draft.draft ? "Draft mode is on" : "Published"}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                  {draft.draft
                    ? "Only visible in this admin workspace — not on the public site yet."
                    : "Live for everyone at the project URL."}
                </p>
              </div>
              <button
                aria-checked={draft.draft}
                aria-label={draft.draft ? "Draft mode is on" : "Draft mode is off"}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${draft.draft ? "bg-brand-yellow" : "bg-brand-green"}`}
                disabled={status === "saving"}
                onClick={togglePublish}
                role="switch"
                type="button"
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${draft.draft ? "left-[1.375rem]" : "left-0.5"}`}
                />
              </button>
            </div>
            <button
              className="mt-3 h-9 w-full rounded-xl text-xs font-semibold transition disabled:cursor-wait disabled:opacity-70 bg-[#171b25] text-white hover:bg-brand-red dark:bg-white/90 dark:text-[#171b25]"
              disabled={status === "saving"}
              onClick={togglePublish}
              type="button"
            >
              {draft.draft ? "Publish this project" : "Unpublish · move back to draft"}
            </button>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e6eaf2] pt-4 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold">Featured</p>
                <p className="mt-0.5 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                  Marks this project for future spotlight placement.
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
            <Field label="Project URL">
              <div className="flex items-center gap-1.5">
                <LinkSimple className="shrink-0 text-[#8490a5]" size={16} />
                <span className="shrink-0 text-xs text-[#9ba4b5]">/projects/</span>
                <input
                  className="h-10 w-full min-w-0 rounded-xl border border-[#d9dfeb] bg-white px-3 font-mono text-xs text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white"
                  onChange={(event) => updateSlug(event.target.value)}
                  placeholder="custom-slug"
                  value={draft.slug}
                />
              </div>
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                onChange={(event) => updateDraft("status", event.target.value as ProjectStatus)}
                value={draft.status}
              >
                {PROJECT_STATUSES.map((entry) => (
                  <option key={entry} value={entry}>
                    {PROJECT_STATUS_LABELS[entry]}
                  </option>
                ))}
              </select>
            </Field>
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
            <Field label="Categories">
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_CATEGORIES.map((category) => {
                  const active = draft.categories.includes(category);
                  return (
                    <button
                      aria-pressed={active}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-brand-red text-white" : "bg-brand-red-50 text-brand-red hover:bg-brand-red/15 dark:bg-brand-red/15 dark:text-[#ef9a9a]"}`}
                      key={category}
                      onClick={() => toggleCategory(category)}
                      type="button"
                    >
                      {PROJECT_CATEGORY_LABELS[category]}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Tech stack">
              <TagListEditor
                onAdd={(value) => {
                  if (!draft.techStack.includes(value)) {
                    updateDraft("techStack", [...draft.techStack, value]);
                  }
                }}
                onRemove={(value) =>
                  updateDraft(
                    "techStack",
                    draft.techStack.filter((item) => item !== value),
                  )
                }
                placeholder="Add a technology"
                values={draft.techStack}
              />
            </Field>
            <Field label="The lab's role (optional)">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("role", event.target.value)}
                placeholder="Design & development partner"
                value={draft.role ?? ""}
              />
            </Field>
            <Field label="Platform (optional)">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("platform", event.target.value)}
                placeholder="Web, iOS, Android"
                value={draft.platform ?? ""}
              />
            </Field>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
              SEO
            </p>
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
                placeholder="Defaults to the project title (optional)"
                value={draft.seoTitle ?? ""}
              />
            </Field>
            <Field label="SEO description">
              <textarea
                className={textareaClass}
                onChange={(event) => updateDraft("seoDescription", event.target.value)}
                placeholder="Defaults to the short description (optional)"
                rows={2}
                value={draft.seoDescription ?? ""}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3">
            {initialRecord ? (
              <Link
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#5d687d] transition hover:bg-white hover:text-brand-red dark:text-white/60 dark:hover:bg-white/10"
                href={`/projects/${encodeURIComponent(originalRecordSlug ?? "")}`}
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

      <input
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const contributorId = photoTarget.current;
          openContributorPhotoPicker(contributorId ?? "", event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
        ref={photoInput}
        type="file"
      />

      {coverToEdit ? (
        <CoverCropDialog
          image={coverToEdit}
          onClose={() => setCoverToEdit(undefined)}
          onConfirm={useEditedCover}
        />
      ) : null}

      {photoToEdit ? (
        <PhotoCropDialog
          image={photoToEdit.image}
          onClose={() => setPhotoToEdit(undefined)}
          onConfirm={(photo, position) =>
            applyEditedContributorPhoto(photoToEdit.contributorId, photo, position)
          }
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
