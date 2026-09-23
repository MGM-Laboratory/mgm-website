"use client";

import {
  ArrowSquareOut,
  ArrowDown,
  ArrowUp,
  CalendarBlank,
  Check,
  Eye,
  EyeSlash,
  FilePdf,
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
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { Member } from "@/data/members";
import {
  authorPhotoUrl,
  draftToPublication,
  emptyPublicationDraft,
  formatPaperSize,
  isPublicationSlug,
  LICENSE_OPTIONS,
  publicationPaperUrl,
  publicationToDraft,
  publicationTypeLabel,
  PUBLICATION_TYPES,
  slugify,
  type CmsPublicationRecord,
  type PublicationAuthor,
  type PublicationAuthorKind,
  type PublicationDraft,
} from "@/lib/publication-cms";
import { PhotoCropDialog, type PhotoCropPosition } from "@/components/admin/photo-crop-dialog";

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
const textareaClass =
  "w-full rounded-xl border border-[#d9dfeb] bg-white px-3 py-2.5 text-sm leading-6 text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

const RESIDENCE_AFFILIATION = "MGM Laboratory, University of Brawijaya";

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

function KeywordEditor({
  onAdd,
  onRemove,
  values,
}: {
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
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
          placeholder="Add a keyword"
          value={value}
        />
        <button
          aria-label="Add keyword"
          className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-brand-blue transition hover:bg-brand-blue-50"
          onClick={commit}
          type="button"
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
      {values.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((keyword) => (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-50 px-2.5 py-1 text-xs font-semibold text-brand-green"
              key={keyword}
            >
              {keyword}
              <button
                aria-label={`Remove ${keyword}`}
                className="transition hover:text-brand-red"
                onClick={() => onRemove(keyword)}
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

type AuthorPhotoUpload = { dataUrl: string; position: PhotoCropPosition };

/**
 * Searchable member picker for residence authors. With fifty-plus members a
 * plain dropdown is unusable; this popover searches name, nickname, and
 * division as you type.
 */
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

function AuthorRow({
  author,
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
  author: PublicationAuthor;
  index: number;
  members: readonly Member[];
  onChoosePhoto: (file?: File) => void;
  onChange: (author: PublicationAuthor) => void;
  onClearPhoto: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  photoRemoved: boolean;
  photoUpload?: AuthorPhotoUpload;
  total: number;
}) {
  const kind = author.kind ?? "non-residence";
  const setKind = (next: PublicationAuthorKind) => onChange({ ...author, kind: next });

  // Choosing a lab member pulls their name in; the affiliation defaults to
  // the laboratory and stays fully editable.
  const chooseMember = (memberSlug: string) => {
    const member = members.find((entry) => entry.slug === memberSlug);
    onChange({
      ...author,
      memberSlug: memberSlug || undefined,
      name: member?.name ?? author.name,
      affiliation: author.affiliation || RESIDENCE_AFFILIATION,
    });
  };

  const photoSource = photoUpload ? photoUpload.dataUrl : authorPhotoUrl(author.photoKey);
  const shownPhotoSource = photoRemoved ? undefined : photoSource;
  const position = photoUpload?.position ?? author.photoPosition;

  const kindButton = (value: PublicationAuthorKind, label: string) => (
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
          Author {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-[#f1f4fa] p-1 dark:bg-white/[0.06]">
            {kindButton("residence", "Residence")}
            {kindButton("non-residence", "Non-Residence")}
          </div>
          <button
            aria-label="Move author up"
            className="rounded-lg p-1.5 text-[#7e899e] transition hover:bg-[#f5f7fb] hover:text-brand-blue disabled:opacity-30 dark:text-white/40 dark:hover:bg-white/[0.06]"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            type="button"
          >
            <ArrowUp size={14} />
          </button>
          <button
            aria-label="Move author down"
            className="rounded-lg p-1.5 text-[#7e899e] transition hover:bg-[#f5f7fb] hover:text-brand-blue disabled:opacity-30 dark:text-white/40 dark:hover:bg-white/[0.06]"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            type="button"
          >
            <ArrowDown size={14} />
          </button>
          <button
            aria-label="Remove author"
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
              onClear={() => onChange({ ...author, memberSlug: undefined, name: "" })}
              selectedSlug={author.memberSlug}
            />
          </Field>
          <Field label="Affiliation / organization">
            <input
              className={inputClass}
              onChange={(event) => onChange({ ...author, affiliation: event.target.value })}
              placeholder={RESIDENCE_AFFILIATION}
              value={author.affiliation ?? ""}
            />
          </Field>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Author name (full name)">
              <input
                className={inputClass}
                onChange={(event) => onChange({ ...author, name: event.target.value })}
                placeholder="Ayu Paramitha"
                value={author.name}
              />
            </Field>
            <Field label="Affiliation / organization">
              <input
                className={inputClass}
                onChange={(event) => onChange({ ...author, affiliation: event.target.value })}
                placeholder="Faculty of Computer Science, University of Brawijaya"
                value={author.affiliation ?? ""}
              />
            </Field>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field label="Public profile link">
              <div className="flex items-center gap-1.5">
                <LinkSimple className="shrink-0 text-[#8490a5]" size={16} />
                <input
                  className={`${inputClass} font-mono text-xs`}
                  onChange={(event) => onChange({ ...author, url: event.target.value })}
                  placeholder="https://example.com/author"
                  value={author.url ?? ""}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
                Clicking the author&apos;s portrait or name on the public page opens this link.
              </p>
            </Field>
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
              <p className="mt-1.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
                Square crop; transparent backgrounds are kept.
              </p>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

export function PublicationEditor({
  initialRecord,
  members,
  onDeleted,
  onDirtyChange,
  onSaved,
  paperLimitBytes,
}: {
  initialRecord?: CmsPublicationRecord;
  members: readonly Member[];
  onDeleted: (slug: string) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: (record: CmsPublicationRecord) => void;
  paperLimitBytes: number;
}) {
  const [initial] = useState(() =>
    initialRecord ? publicationToDraft(initialRecord.publication) : emptyPublicationDraft(),
  );
  const [draft, setDraft] = useState<PublicationDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialRecord));
  const [paperFile, setPaperFile] = useState<File>();
  const [paperRemoved, setPaperRemoved] = useState(false);
  const [authorPhotos, setAuthorPhotos] = useState<Record<string, AuthorPhotoUpload>>({});
  const [removedAuthorPhotos, setRemovedAuthorPhotos] = useState<Record<string, boolean>>({});
  const [photoToEdit, setPhotoToEdit] = useState<{ authorId: string; image: string }>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [originalRecordSlug] = useState(initialRecord?.slug);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<string | undefined>(undefined);
  // The baseline must carry the same shape as the live signature below —
  // JSON.stringify drops undefined keys, so a shorter literal here would
  // never compare equal and the editor would report unsaved changes the
  // moment it mounts.
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({
      draft: initial,
      paperFile: undefined,
      paperRemoved: false,
      authorPhotos: [],
      removedAuthorPhotos: [],
    }),
  );
  const signature = JSON.stringify({
    draft,
    paperFile: paperFile?.name,
    paperRemoved,
    authorPhotos: Object.keys(authorPhotos).sort(),
    removedAuthorPhotos: Object.keys(removedAuthorPhotos).sort(),
  });
  const isDirty = baseline !== signature;
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

  const paperLimitMb = Math.floor(paperLimitBytes / 1024 / 1024);
  const currentPaperKey = paperRemoved ? undefined : draft.paperKey;
  const paperUrl = useMemo(() => publicationPaperUrl(currentPaperKey), [currentPaperKey]);
  // Visibility is opt-in: only an explicit `false` publishes the paper, so
  // records without the flag (and every fresh upload) read as hidden.
  const paperHiddenState = draft.paperHidden !== false;
  const hasPaper = Boolean(currentPaperKey || paperFile);

  const updateDraft = <K extends keyof PublicationDraft>(key: K, value: PublicationDraft[K]) => {
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
  const moveAuthor = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.authors.length) return;
    const authors = [...draft.authors];
    [authors[index], authors[target]] = [authors[target], authors[index]];
    updateDraft("authors", authors);
  };
  const addAuthor = () => {
    updateDraft("authors", [
      ...draft.authors,
      { id: crypto.randomUUID(), kind: "non-residence", name: "", affiliation: "" },
    ]);
  };

  const choosePaper = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("The paper must be a PDF file.");
      return;
    }
    if (file.size > paperLimitBytes) {
      toast.error(`The paper must be under ${paperLimitMb} MB.`, {
        description: `${file.name} is ${formatPaperSize(file.size)}.`,
      });
      return;
    }
    setPaperFile(file);
    setPaperRemoved(false);
    // Keep a name the admin already typed; otherwise default to the file's.
    if (!draft.paperName) updateDraft("paperName", file.name);
    // A freshly uploaded paper starts hidden; publishing it is a separate,
    // deliberate step from the visibility control below.
    updateDraft("paperHidden", true);
    if (status === "saved") setStatus("idle");
  };

  const openPhotoPicker = (authorId: string, file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoToEdit({ authorId, image: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const applyEditedPhoto = (authorId: string, dataUrl: string, position: PhotoCropPosition) => {
    setAuthorPhotos((current) => ({ ...current, [authorId]: { dataUrl, position } }));
    setRemovedAuthorPhotos((current) => ({ ...current, [authorId]: false }));
    setPhotoToEdit(undefined);
    if (status === "saved") setStatus("idle");
  };
  const clearAuthorPhoto = (authorId: string) => {
    setAuthorPhotos((current) => {
      const next = { ...current };
      delete next[authorId];
      return next;
    });
    setRemovedAuthorPhotos((current) => ({ ...current, [authorId]: true }));
    if (status === "saved") setStatus("idle");
  };

  const save = async () => {
    let publication = draftToPublication(draft);
    if (!publication.title || !publication.slug) {
      toast.error("Title and publication URL are required.");
      return;
    }
    if (!isPublicationSlug(publication.slug)) {
      toast.error("Publication URL is not valid", {
        description: "Use lowercase letters, numbers, and hyphens.",
      });
      return;
    }
    if (!publication.authors.length) {
      toast.error("Add at least one author.");
      return;
    }
    setStatus("saving");
    setError(undefined);
    try {
      // New or replaced portraits upload first, then the record references
      // their keys.
      const authors = publication.authors.map((author) => ({ ...author }));
      for (const author of authors) {
        const upload = authorPhotos[author.id];
        if (upload) {
          const photoResponse = await fetch("/api/admin/publications/author-photo", {
            body: JSON.stringify({ image: upload.dataUrl }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          if (!photoResponse.ok)
            throw new Error(await responseError(photoResponse, "Portrait upload failed."));
          const uploaded = (await photoResponse.json()) as { key: string };
          author.photoKey = uploaded.key;
          author.photoPosition = upload.position;
        } else if (removedAuthorPhotos[author.id]) {
          delete author.photoKey;
          delete author.photoPosition;
        }
      }
      publication = { ...publication, authors };

      if (paperFile) {
        const paperResponse = await fetch(
          `/api/admin/publications/${encodeURIComponent(publication.slug)}/paper`,
          {
            body: paperFile,
            headers: { "content-type": "application/pdf" },
            method: "POST",
          },
        );
        if (!paperResponse.ok)
          throw new Error(await responseError(paperResponse, "Paper upload failed."));
        const uploaded = (await paperResponse.json()) as { key: string; size: number };
        publication = {
          ...publication,
          paperKey: uploaded.key,
          paperName: publication.paperName?.trim() || paperFile.name,
          paperSize: uploaded.size,
        };
      } else if (paperRemoved) {
        publication = {
          ...publication,
          paperKey: undefined,
          paperName: undefined,
          paperSize: undefined,
        };
      } else if (publication.paperName) {
        publication = { ...publication, paperName: publication.paperName.trim() };
      }

      const response = await fetch(
        `/api/admin/publications/${encodeURIComponent(originalRecordSlug ?? publication.slug)}`,
        {
          body: JSON.stringify({ publication }),
          headers: { "content-type": "application/json" },
          method: "PUT",
        },
      );
      if (!response.ok) throw new Error(await responseError(response, "Publication save failed."));
      const savedRecord = (await response.json()) as CmsPublicationRecord;
      const savedDraft = publicationToDraft(savedRecord.publication);
      setDraft(savedDraft);
      setSlugTouched(true);
      setPaperFile(undefined);
      setPaperRemoved(false);
      setAuthorPhotos({});
      setRemovedAuthorPhotos({});
      setBaseline(
        JSON.stringify({
          draft: savedDraft,
          paperFile: undefined,
          paperRemoved: false,
          authorPhotos: [],
          removedAuthorPhotos: [],
        }),
      );
      onSaved(savedRecord);
      window.dispatchEvent(new CustomEvent("mgm:publication-updated", { detail: savedRecord }));
      const channel = new BroadcastChannel("mgm-publication-cms");
      channel.postMessage({ record: savedRecord, type: "publication-updated" });
      channel.close();
      onDirtyChange(false);
      setStatus("saved");
      toast.success("Publication published", {
        description: `${savedRecord.publication.title} is live at /publications/${savedRecord.publication.slug}.`,
      });
    } catch (saveError) {
      setStatus("error");
      const message =
        saveError instanceof Error ? saveError.message : "The changes could not be saved.";
      setError(message);
      toast.error("Publication was not saved", { description: message });
    }
  };

  const remove = async () => {
    if (!originalRecordSlug) return;
    if (!window.confirm(`Delete “${draft.title || originalRecordSlug}” permanently?`)) return;
    try {
      const response = await fetch(
        `/api/admin/publications/${encodeURIComponent(originalRecordSlug)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await responseError(response, "Delete failed."));
      onDeleted(originalRecordSlug);
      toast.success("Publication deleted");
    } catch (deleteError) {
      toast.error("Publication was not deleted", {
        description: deleteError instanceof Error ? deleteError.message : undefined,
      });
    }
  };

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-start justify-between gap-5 border-b border-[#dee4ef] pb-7 dark:border-white/10">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-green uppercase">
            {initialRecord ? "Publication record" : "New publication"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {draft.title || "Untitled publication"}
          </h1>
          <p className="mt-2 text-sm text-[#69748a] dark:text-white/50">
            {initialRecord ? "Editing the published record." : "A new draft starts unpublished."}
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
            aria-label="Save publication changes"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-green active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
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
                : "Save publication"}
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
          <textarea
            aria-label="Publication title"
            className="w-full resize-none bg-transparent font-display text-4xl font-semibold tracking-[-0.04em] text-[#171b25] outline-none placeholder:text-[#c2c9d6] dark:text-white dark:placeholder:text-white/20"
            onChange={(event) => updateTitle(event.target.value)}
            placeholder="Publication title"
            rows={2}
            value={draft.title}
          />

          <div className="mt-7 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
              Abstract
            </p>
            <p className="mt-1 text-xs leading-5 text-[#9ba4b5] dark:text-white/35">
              Plain text only — the abstract is rendered as a single paragraph on the public page.
            </p>
            <textarea
              aria-label="Abstract"
              className={`${textareaClass} mt-3 min-h-44 resize-y`}
              onChange={(event) => updateDraft("abstract", event.target.value)}
              placeholder="A concise summary of the paper — what was studied, how, and what was found."
              value={draft.abstract}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
              Paper (PDF)
            </p>
            {paperUrl && !paperRemoved ? (
              <div className="mt-3 rounded-xl border border-[#dfe4ee] bg-[#f8fafd] p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-red-50 text-brand-red dark:bg-brand-red/15">
                    <FilePdf size={20} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {paperFile?.name ?? draft.paperName ?? "paper.pdf"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-[#8490a5]">
                      {paperFile
                        ? `${formatPaperSize(paperFile.size)} · not uploaded yet`
                        : (formatPaperSize(draft.paperSize) ?? "uploaded")}
                    </span>
                  </span>
                  <Link
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-blue transition hover:bg-brand-blue-50"
                    href={paperUrl}
                    target="_blank"
                  >
                    View
                  </Link>
                  <button
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:bg-white hover:text-brand-blue dark:text-white/60 dark:hover:bg-white/10"
                    onClick={() => fileInput.current?.click()}
                    type="button"
                  >
                    Replace
                  </button>
                  <button
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/60 dark:hover:bg-brand-red/15"
                    onClick={() => {
                      setPaperFile(undefined);
                      setPaperRemoved(true);
                      updateDraft("paperHidden", true);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 border-t border-[#dfe4ee] pt-3 dark:border-white/10">
                  <Field label="Manuscript name">
                    <input
                      className={inputClass}
                      onChange={(event) => updateDraft("paperName", event.target.value)}
                      placeholder="touch-first-field-work.pdf"
                      value={draft.paperName ?? ""}
                    />
                  </Field>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
                    Shown under the preview and used as the download filename.
                  </p>
                </div>
              </div>
            ) : (
              <button
                className="mt-3 grid w-full place-items-center gap-2 rounded-xl border border-dashed border-brand-green/40 bg-brand-green/[0.04] px-4 py-10 text-center transition hover:border-brand-green hover:bg-brand-green/[0.07]"
                onClick={() => fileInput.current?.click()}
                type="button"
              >
                <FilePdf className="text-brand-green" size={30} weight="duotone" />
                <span className="text-sm font-semibold text-brand-green">Upload the paper</span>
                <span className="font-mono text-[10px] tracking-[0.12em] text-[#8490a5] uppercase">
                  PDF · up to {paperLimitMb} MB
                </span>
              </button>
            )}
            <input
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                choosePaper(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
              ref={fileInput}
              type="file"
            />
            {hasPaper ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe4ee] bg-[#f8fafd] px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
                    Paper visibility
                  </p>
                  <p className="mt-0.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
                    {paperHiddenState
                      ? "Hidden: the publication page shows no paper, and the file stays unserved even by direct link."
                      : "Visible: the publication page shows the preview, the reader, and the download."}
                  </p>
                </div>
                <button
                  aria-pressed={!paperHiddenState}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                    paperHiddenState
                      ? "border-[#dfe4ee] bg-white text-[#5d687d] hover:border-brand-blue/40 hover:text-brand-blue dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60 dark:hover:text-white"
                      : "border-brand-blue/30 bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]"
                  }`}
                  onClick={() => updateDraft("paperHidden", !paperHiddenState)}
                  type="button"
                >
                  {paperHiddenState ? (
                    <EyeSlash size={14} weight="bold" />
                  ) : (
                    <Eye size={14} weight="bold" />
                  )}
                  {paperHiddenState ? "Hidden" : "Visible"}
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
              The first page becomes the public preview; readers open the full PDF viewer for the
              whole paper.
            </p>
          </div>

          {/* Authors get the full column width: names and affiliations are long. */}
          <div className="mt-5 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
                Authors
              </p>
              <button
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-blue transition hover:bg-brand-blue-50"
                onClick={addAuthor}
                type="button"
              >
                <Plus size={13} weight="bold" />
                Add author
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {draft.authors.map((author, index) => (
                <AuthorRow
                  author={author}
                  index={index}
                  key={author.id}
                  members={members}
                  onChange={(next) =>
                    updateDraft(
                      "authors",
                      draft.authors.map((item) => (item.id === author.id ? next : item)),
                    )
                  }
                  onChoosePhoto={(file) => {
                    photoTarget.current = author.id;
                    if (file) openPhotoPicker(author.id, file);
                    else photoInput.current?.click();
                  }}
                  onClearPhoto={() => clearAuthorPhoto(author.id)}
                  onMove={(direction) => moveAuthor(index, direction)}
                  onRemove={() =>
                    updateDraft(
                      "authors",
                      draft.authors.filter((item) => item.id !== author.id),
                    )
                  }
                  photoRemoved={Boolean(removedAuthorPhotos[author.id])}
                  photoUpload={authorPhotos[author.id]}
                  total={draft.authors.length}
                />
              ))}
              {!draft.authors.length ? (
                <p className="rounded-xl border border-dashed border-[#d9dfeb] px-3 py-5 text-center text-xs leading-5 text-[#9ba4b5] dark:border-white/10 dark:text-white/35">
                  No authors yet. The first author becomes the citation&apos;s lead.
                </p>
              ) : null}
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
                <p className="text-sm font-semibold">{draft.draft ? "Draft" : "Published"}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#8490a5] dark:text-white/40">
                  {draft.draft
                    ? "Visible only in this workspace."
                    : "Visible to everyone at the publication URL."}
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
          </div>

          <div className="space-y-4 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
            <Field label="Publication URL">
              <div className="flex items-center gap-1.5">
                <LinkSimple className="shrink-0 text-[#8490a5]" size={16} />
                <span className="shrink-0 text-xs text-[#9ba4b5]">/publications/</span>
                <input
                  className="h-10 w-full min-w-0 rounded-xl border border-[#d9dfeb] bg-white px-3 font-mono text-xs text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white"
                  onChange={(event) => updateSlug(event.target.value)}
                  placeholder="custom-slug"
                  value={draft.slug}
                />
              </div>
            </Field>
            <Field label="Type">
              <select
                className={`${inputClass} appearance-none`}
                onChange={(event) =>
                  updateDraft("type", event.target.value as PublicationDraft["type"])
                }
                value={draft.type}
              >
                {PUBLICATION_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <div className="relative">
                <CalendarBlank
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                  size={16}
                />
                <input
                  className={`${inputClass} pl-9`}
                  onChange={(event) => updateDraft("date", event.target.value)}
                  type="date"
                  value={draft.date}
                />
              </div>
            </Field>
            <Field label="Journal / venue">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("journal", event.target.value)}
                placeholder="Journal of Usability Studies"
                value={draft.journal}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2.5">
              <Field label="Volume">
                <input
                  className={inputClass}
                  onChange={(event) => updateDraft("volume", event.target.value)}
                  placeholder="12"
                  value={draft.volume ?? ""}
                />
              </Field>
              <Field label="Issue">
                <input
                  className={inputClass}
                  onChange={(event) => updateDraft("issue", event.target.value)}
                  placeholder="3"
                  value={draft.issue ?? ""}
                />
              </Field>
              <Field label="Pages">
                <input
                  className={inputClass}
                  onChange={(event) => updateDraft("pages", event.target.value)}
                  placeholder="45–58"
                  value={draft.pages ?? ""}
                />
              </Field>
            </div>
            <Field label="Publisher">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("publisher", event.target.value)}
                placeholder="ACM"
                value={draft.publisher ?? ""}
              />
            </Field>
            <Field label="DOI">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("doi", event.target.value)}
                placeholder="10.1000/xyz123"
                value={draft.doi ?? ""}
              />
            </Field>
            <Field label="Publisher's page URL">
              <input
                className={inputClass}
                onChange={(event) => updateDraft("url", event.target.value)}
                placeholder="https://dl.acm.org/doi/..."
                value={draft.url ?? ""}
              />
            </Field>
            <Field label="License">
              <select
                className={`${inputClass} appearance-none`}
                onChange={(event) => updateDraft("license", event.target.value || undefined)}
                value={draft.license ?? ""}
              >
                <option value="">Choose a license</option>
                {LICENSE_OPTIONS.map((license) => (
                  <option key={license} value={license}>
                    {license}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Keywords">
              <KeywordEditor
                onAdd={(value) => {
                  if (!draft.keywords.includes(value)) {
                    updateDraft("keywords", [...draft.keywords, value]);
                  }
                }}
                onRemove={(value) =>
                  updateDraft(
                    "keywords",
                    draft.keywords.filter((item) => item !== value),
                  )
                }
                values={draft.keywords}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3">
            {initialRecord ? (
              <Link
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#5d687d] transition hover:bg-white hover:text-brand-blue dark:text-white/60 dark:hover:bg-white/10"
                href={`/publications/${encodeURIComponent(originalRecordSlug ?? "")}`}
                target="_blank"
              >
                <ArrowSquareOut size={15} />
                View publication
              </Link>
            ) : (
              <span className="px-3 py-2 text-xs text-[#9ba4b5] dark:text-white/35">
                {draft.type ? publicationTypeLabel(draft.type) : ""}
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

      {/* The hidden input feeds the author-row portrait pickers. */}
      <input
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const authorId = photoTarget.current;
          openPhotoPicker(authorId ?? "", event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
        ref={photoInput}
        type="file"
      />

      {photoToEdit ? (
        <PhotoCropDialog
          image={photoToEdit.image}
          onClose={() => setPhotoToEdit(undefined)}
          onConfirm={(photo, position) => applyEditedPhoto(photoToEdit.authorId, photo, position)}
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
