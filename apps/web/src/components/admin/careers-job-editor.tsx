"use client";

import { FloppyDisk, Trash, X } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { isArticleSlug, slugify, type ArticleBlock } from "@/lib/article-cms";
import {
  COMMITMENT_LABELS,
  JOB_COMMITMENTS,
  JOB_MODES,
  JOB_STATUSES,
  MODE_LABELS,
  STATUS_LABELS,
  emptyJobDraft,
  type CmsJobRecord,
  type JobCommitment,
  type JobDraft,
  type JobMode,
  type JobStatus,
} from "@/lib/career-cms";

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

// Paths claimed by routes on the jobs controller; a role can never use one.
const RESERVED_JOB_SLUGS = new Set(["admin", "feed", "media", "applications"]);

const STATUS_BADGE: Record<JobStatus, string> = {
  draft: "bg-brand-yellow-50 text-[#a97b1c]",
  published: "bg-brand-green-50 text-brand-green",
  closed: "bg-[#e8ecf4] text-[#667187]",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] uppercase ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function responseError(response: Response) {
  return `The API answered ${response.status}.`;
}

/**
 * The openings editor: metadata fields plus the BlockNote description.
 * Mirrors the article editor contract — draft state, dirty tracking, save
 * through the authenticated admin proxy, and a confirm-guarded delete.
 */
export function CareersJobEditor({
  initialRecord,
  onDeleted,
  onDirtyChange,
  onSaved,
}: {
  initialRecord?: CmsJobRecord;
  onDeleted: (slug: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (record: CmsJobRecord) => void;
}) {
  const [draft, setDraft] = useState<JobDraft>(() =>
    initialRecord ? { ...initialRecord.job, perks: [...initialRecord.job.perks] } : emptyJobDraft(),
  );
  const [content, setContent] = useState<ArticleBlock[]>(() =>
    initialRecord ? [...initialRecord.content] : [],
  );
  const [perkInput, setPerkInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const sourceSlug = initialRecord?.slug;

  const baseline = useMemo(
    () => JSON.stringify({ job: initialRecord?.job, content: initialRecord?.content }),
    [initialRecord],
  );
  const dirty = JSON.stringify({ job: draft, content }) !== baseline;

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
        ? "Give the role a URL."
        : !isArticleSlug(draft.slug)
          ? "Use lowercase letters, numbers, and hyphens."
          : RESERVED_JOB_SLUGS.has(draft.slug)
            ? "That URL is reserved."
            : null
      : null;

  const addPerk = () => {
    const value = perkInput.trim();
    if (!value) return;
    if (draft.perks.includes(value)) {
      setPerkInput("");
      return;
    }
    if (draft.perks.length >= 8) {
      toast.error("A role can list up to 8 perks.");
      return;
    }
    setDraft((current) => ({ ...current, perks: [...current.perks, value] }));
    setPerkInput("");
  };

  const save = async () => {
    const checks: { message: string; pass: boolean }[] = [
      { message: "A title is required.", pass: draft.title.trim().length > 0 },
      { message: "A focus area is required.", pass: draft.focus.trim().length > 0 },
      {
        message: "An application deadline is required.",
        pass: /^\d{4}-\d{2}-\d{2}$/.test(draft.deadline),
      },
      { message: slugError ?? "The URL is invalid.", pass: !slugError && Boolean(draft.slug) },
    ];
    const failed = checks.find((check) => !check.pass);
    if (failed) {
      toast.error(failed.message);
      return;
    }

    setStatus("saving");
    try {
      const response = await fetch(
        `/api/admin/careers/${encodeURIComponent(sourceSlug ?? draft.slug)}`,
        {
          body: JSON.stringify({ job: draft, content }),
          headers: { "content-type": "application/json" },
          method: "PUT",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        record?: CmsJobRecord;
        message?: string;
      };
      if (!response.ok || !payload.record) {
        throw new Error(
          typeof payload.message === "string" && payload.message
            ? payload.message
            : responseError(response),
        );
      }
      onSaved(payload.record);
      window.dispatchEvent(new CustomEvent("mgm:career-updated", { detail: payload.record }));
      setStatus("idle");
      toast.success("Role saved.");
    } catch (error) {
      setStatus("error");
      toast.error("Could not save the role.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const remove = async () => {
    const target = sourceSlug ?? draft.slug;
    if (
      !window.confirm(
        "Delete this role? Applications stay in the inbox, but the role disappears from the public site.",
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/admin/careers/${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(responseError(response));
      onDeleted(target);
      window.dispatchEvent(new CustomEvent("mgm:career-updated"));
      toast.success("Role deleted.");
    } catch (error) {
      toast.error("Could not delete the role.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="admin-editor-enter space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dee4ef] pb-5 dark:border-white/10">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">
            {initialRecord ? "Edit opening" : "New opening"}
          </h2>
          <JobStatusBadge status={draft.status} />
          {dirty ? (
            <span className="font-mono text-[10px] font-bold tracking-[0.1em] text-[#a97b1c] uppercase">
              Unsaved
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#171b25] px-4 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] disabled:opacity-60"
            disabled={status === "saving"}
            onClick={() => void save()}
            type="button"
          >
            <FloppyDisk size={15} weight="bold" />
            {status === "saving" ? "Saving…" : "Save role"}
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
            placeholder="Research Assistant — Applied ML"
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
            placeholder="research-assistant-applied-ml"
            type="text"
            value={draft.slug}
          />
          {slugError ? <p className="mt-1.5 text-xs text-brand-red">{slugError}</p> : null}
        </Field>
        <Field label="Focus">
          <input
            className={inputClass}
            onChange={(event) => setDraft((current) => ({ ...current, focus: event.target.value }))}
            placeholder="Game Development"
            type="text"
            value={draft.focus}
          />
        </Field>
        <Field label="Application deadline">
          <input
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, deadline: event.target.value }))
            }
            type="date"
            value={draft.deadline}
          />
        </Field>
        <Field label="Commitment">
          <select
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commitment: event.target.value as JobCommitment,
              }))
            }
            value={draft.commitment}
          >
            {JOB_COMMITMENTS.map((commitment) => (
              <option key={commitment} value={commitment}>
                {COMMITMENT_LABELS[commitment]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode">
          <select
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, mode: event.target.value as JobMode }))
            }
            value={draft.mode}
          >
            {JOB_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={inputClass}
            onChange={(event) =>
              setDraft((current) => ({ ...current, status: event.target.value as JobStatus }))
            }
            value={draft.status}
          >
            {JOB_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={`Perks (${draft.perks.length}/8)`}>
        <div className="space-y-3">
          <input
            className={inputClass}
            onChange={(event) => setPerkInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPerk();
              }
            }}
            placeholder="Workspace access — press Enter to add"
            type="text"
            value={perkInput}
          />
          {draft.perks.length ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.perks.map((perk) => (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#eef1f7] px-3 py-1 text-xs font-semibold text-[#3e4859] dark:bg-white/[0.08] dark:text-white/80"
                  key={perk}
                >
                  {perk}
                  <button
                    aria-label={`Remove ${perk}`}
                    className="text-[#8993a7] transition hover:text-brand-red"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        perks: current.perks.filter((item) => item !== perk),
                      }))
                    }
                    type="button"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </Field>

      <div>
        <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
          Description
        </span>
        <div className="overflow-hidden rounded-2xl border border-[#d9dfeb] bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <BlocknoteEditor
            initialContent={content}
            mediaBase="/api/careers-cms/media"
            onChange={setContent}
            uploadPath={`/api/admin/careers/${encodeURIComponent(sourceSlug ?? (draft.slug || "draft"))}/media`}
          />
        </div>
      </div>
    </div>
  );
}
