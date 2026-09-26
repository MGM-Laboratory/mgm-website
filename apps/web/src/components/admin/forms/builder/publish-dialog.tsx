"use client";

import { ArrowsClockwise, Check, CircleNotch, Copy, TextAa, Warning } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { formSlugSchema, type FormRecord, type FormStatus } from "@repo/shared";

import { formsAdminApi } from "@/lib/forms/admin-api";
import { randomSlug, slugify } from "@/lib/forms/builder-document";

import {
  Dialog,
  StatusBadge,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./ui";

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; suggestion?: string }
  | { state: "invalid"; message: string }
  | { state: "unknown" };

/** Copies text, resolving whether the clipboard took it. */
function copyText(text: string): Promise<boolean> {
  // Inside the chain, so a missing clipboard API resolves false as well.
  return Promise.resolve()
    .then(() => navigator.clipboard.writeText(text))
    .then(
      () => true,
      () => false,
    );
}

/** Publish, unpublish, close or reopen a form, and choose its public link. */
export function PublishDialog({
  onClose,
  onRecordChange,
  origin,
  problemCount,
  record,
  saveNow,
}: {
  record: FormRecord;
  origin: string;
  saveNow: () => Promise<boolean>;
  onRecordChange: (record: FormRecord) => void;
  onClose: () => void;
  problemCount: number;
}) {
  const [slug, setSlug] = useState(record.slug);
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [busy, setBusy] = useState<FormStatus | "slug" | null>(null);
  const [apiError, setApiError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const statusId = useId();

  const trimmed = slug.trim().toLowerCase();
  const changed = trimmed !== record.slug;
  const url = `${origin}/forms/${trimmed || record.slug}`;

  useEffect(() => {
    if (!changed) {
      setAvailability({ state: "idle" });
      return;
    }
    const parsed = formSlugSchema.safeParse(trimmed);
    if (!parsed.success) {
      setAvailability({
        state: "invalid",
        message: parsed.error.issues[0]?.message ?? "Use lowercase letters, numbers and hyphens.",
      });
      return;
    }
    setAvailability({ state: "checking" });
    let cancelled = false;
    const check = async () => {
      try {
        const result = await formsAdminApi.slugAvailable(parsed.data, record.id);
        if (cancelled) return;
        setAvailability(
          result.available
            ? { state: "available" }
            : { state: "taken", suggestion: result.suggestion },
        );
      } catch {
        if (!cancelled) setAvailability({ state: "unknown" });
      }
    };
    const timer = window.setTimeout(() => {
      void check();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [changed, record.id, trimmed]);

  const slugBlocked =
    changed &&
    (availability.state === "invalid" ||
      availability.state === "taken" ||
      availability.state === "checking");

  const run = async (status: FormStatus, label: string) => {
    if (slugBlocked) return;
    setBusy(status);
    setApiError(undefined);
    try {
      const saved = await saveNow();
      if (!saved) {
        toast.error("Fix the problems first", {
          description: "The form has errors, so its latest changes can't be saved.",
        });
        return;
      }
      const { form } = await formsAdminApi.update(record.id, {
        ...(changed ? { slug: trimmed } : {}),
        status,
      });
      onRecordChange(form);
      setSlug(form.slug);
      const link = `${origin}/forms/${form.slug}`;
      if (status === "published") {
        const didCopy = await copyText(link);
        toast.success(didCopy ? `${label}. Link copied.` : `${label}.`, {
          action: { label: "Open", onClick: () => window.open(link, "_blank", "noopener") },
        });
      } else {
        toast.success(label);
      }
    } catch (error) {
      const message = (error as Error).message || "The form could not be updated.";
      setApiError(message);
      toast.error("Could not update the form.", { description: message });
    } finally {
      setBusy(null);
    }
  };

  const updateLink = async () => {
    if (!changed || slugBlocked) return;
    setBusy("slug");
    setApiError(undefined);
    try {
      const { form } = await formsAdminApi.update(record.id, { slug: trimmed });
      onRecordChange(form);
      setSlug(form.slug);
      toast.success("Link updated.");
    } catch (error) {
      const message = (error as Error).message || "The link could not be changed.";
      setApiError(message);
      toast.error("Could not change the link.", { description: message });
    } finally {
      setBusy(null);
    }
  };

  const status = record.status;
  const blocked = problemCount > 0;

  const actions: React.ReactNode[] = [];
  const button = (
    key: string,
    className: string,
    onClick: () => Promise<void>,
    label: string,
    disabled = false,
  ) => (
    <button
      className={className}
      disabled={disabled || busy !== null}
      key={key}
      onClick={() => {
        void onClick();
      }}
      type="button"
    >
      {busy && busy === (key as FormStatus | "slug") ? (
        <CircleNotch className="animate-spin motion-reduce:animate-none" size={15} />
      ) : null}
      {label}
    </button>
  );
  if (status === "draft") {
    actions.push(
      button(
        "published",
        primaryButtonClass,
        () => run("published", "Published"),
        "Publish",
        blocked || slugBlocked,
      ),
    );
  } else if (status === "published") {
    actions.push(
      button(
        "draft",
        secondaryButtonClass,
        () => run("draft", "Back to draft. The link no longer opens."),
        "Unpublish",
      ),
    );
    actions.push(
      button(
        "closed",
        secondaryButtonClass,
        () => run("closed", "Responses closed."),
        "Close responses",
      ),
    );
    if (changed)
      actions.push(button("slug", primaryButtonClass, updateLink, "Update link", slugBlocked));
  } else {
    actions.push(
      button(
        "draft",
        secondaryButtonClass,
        () => run("draft", "Back to draft. The link no longer opens."),
        "Unpublish",
      ),
    );
    actions.push(
      button(
        "published",
        primaryButtonClass,
        () => run("published", "Reopened"),
        "Reopen",
        blocked || slugBlocked,
      ),
    );
  }

  const statusLine = (() => {
    switch (availability.state) {
      case "checking":
        return <span className="text-[#8490a5]">Checking…</span>;
      case "available":
        return (
          <span className="inline-flex items-center gap-1 text-brand-green">
            <Check size={12} weight="bold" /> Available
          </span>
        );
      case "taken":
        return (
          <span className="inline-flex flex-wrap items-center gap-1 text-brand-red">
            Taken.
            {availability.suggestion ? (
              <button
                className="font-semibold underline underline-offset-2 hover:text-brand-blue"
                onClick={() => {
                  setSlug(availability.suggestion ?? "");
                }}
                type="button"
              >
                Use {availability.suggestion}
              </button>
            ) : null}
          </span>
        );
      case "invalid":
        return <span className="text-brand-red">{availability.message}</span>;
      case "unknown":
        return (
          <span className="text-[#8a6412] dark:text-brand-yellow">
            Couldn&rsquo;t check right now; saving will tell.
          </span>
        );
      default:
        return <span className="text-[#8490a5]">Lowercase letters, numbers and hyphens.</span>;
    }
  })();

  const invalidSlug = availability.state === "invalid" || availability.state === "taken";

  return (
    <Dialog
      description="Publishing opens the form at its link. You can keep editing: changes go live as they save."
      footer={
        <>
          <button className={ghostButtonClass} onClick={onClose} type="button">
            Done
          </button>
          {actions}
        </>
      }
      onClose={onClose}
      size="md"
      title={status === "draft" ? "Publish form" : "Publishing"}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#5d687d] dark:text-white/55">Status</span>
          <StatusBadge status={status} />
          {record.publishedAt ? (
            <span className="text-xs text-[#8490a5]" suppressHydrationWarning>
              first published {new Date(record.publishedAt).toLocaleDateString("en-GB")}
            </span>
          ) : null}
        </div>

        <div>
          <label
            className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45"
            htmlFor={inputId}
          >
            Link
          </label>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs text-[#8490a5]">
                /forms/
              </span>
              <input
                aria-describedby={statusId}
                aria-invalid={invalidSlug || undefined}
                className={`${inputClass} pl-[4.1rem] font-mono ${invalidSlug ? "border-brand-red/70" : ""}`}
                data-autofocus=""
                id={inputId}
                maxLength={80}
                onChange={(event) => {
                  setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"));
                  setApiError(undefined);
                }}
                spellCheck={false}
                value={slug}
              />
            </div>
            <button
              className={secondaryButtonClass}
              onClick={() => {
                setSlug(randomSlug());
              }}
              title="A random link"
              type="button"
            >
              <ArrowsClockwise size={15} />
              Random
            </button>
            <button
              className={secondaryButtonClass}
              disabled={!slugify(record.document.title)}
              onClick={() => {
                setSlug(slugify(record.document.title));
              }}
              title="Make the link from the title"
              type="button"
            >
              <TextAa size={15} />
              From title
            </button>
          </div>
          <p aria-live="polite" className="mt-1.5 text-[11px] leading-5" id={statusId}>
            {statusLine}
          </p>
          {apiError ? (
            <p className="mt-1 text-[11px] font-semibold text-brand-red" role="alert">
              {apiError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[#dfe4ee] bg-white p-1.5 pl-3 dark:border-white/10 dark:bg-white/[0.03]">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-[#171b25] dark:text-white">
            {url}
          </code>
          <button
            aria-label="Copy the link"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue-50 dark:hover:bg-brand-blue/15"
            onClick={() => {
              void copyText(url).then((didCopy) => {
                if (!didCopy) return;
                setCopied(true);
                window.setTimeout(() => {
                  setCopied(false);
                }, 1400);
              });
            }}
            type="button"
          >
            {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {status !== "draft" && changed ? (
          <p className="text-xs leading-5 text-[#8a6412] dark:text-brand-yellow">
            Changing the link of a live form breaks the old link for anyone who already has it.
          </p>
        ) : null}

        {blocked ? (
          <p
            className="flex gap-2 rounded-xl bg-brand-red-50 p-3 text-xs leading-5 text-brand-red dark:bg-brand-red/15"
            role="alert"
          >
            <Warning className="mt-0.5 shrink-0" size={14} weight="fill" />
            The form has {problemCount} problem{problemCount === 1 ? "" : "s"} to fix before it can
            go live. The Problems list in the builder shows each one.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
