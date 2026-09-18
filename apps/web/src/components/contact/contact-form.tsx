"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONTACT_MAX_ATTACHMENTS,
  CONTACT_MAX_ATTACHMENT_BYTES,
  contactFormSchema,
} from "@repo/shared";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import Link from "next/link";
import { useForm, useWatch, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

// Extends the same schema the API validates against — "agree" is a
// client-only concern that never reaches the server — so both sides agree
// on the same rules and messages instead of drifting apart over time.
const formSchema = contactFormSchema.extend({
  agree: z.boolean().refine((v) => v, "Please agree to the privacy policy."),
});

type FormValues = z.infer<typeof formSchema>;
const FIELD_NAMES = new Set(Object.keys(formSchema.shape));

// Attachments (File/blob objects) can't survive JSON serialization, so only
// the text fields are persisted — the user re-selects files after a reload.
const DRAFT_STORAGE_KEY = "mgm-contact-form-draft";
type DraftValues = Pick<FormValues, "name" | "email" | "company" | "message">;

function loadDraft(): Partial<DraftValues> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<DraftValues>;
  } catch {
    return null;
  }
}

function saveDraft(values: DraftValues) {
  try {
    if (!values.name && !values.email && !values.company && !values.message) {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage unavailable (private browsing, quota) — the form still works.
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Types a browser can render inline in a new tab rather than just downloading.
function isPreviewableType(type: string) {
  return (
    type === "application/pdf" ||
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type.startsWith("audio/") ||
    type.startsWith("text/")
  );
}

// previewUrls only ever holds URL.createObjectURL() results, so this is
// always true - the explicit scheme check rules out these ever being
// rendered as a src/href if that ever stopped being the case.
function isSafeBlobUrl(url: string | undefined): url is string {
  return typeof url === "string" && url.startsWith("blob:");
}

/** Uploads one selected file and returns its storage key, using the API error when available. */
async function uploadAttachment(file: File): Promise<string> {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/contact/attachments`, {
    method: "POST",
    body: file,
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-filename": encodeURIComponent(file.name),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to upload ${file.name}.`);
  }
  const { key } = (await response.json()) as { key: string };
  return key;
}

/** Applies field-level API errors to the form and reports whether any were present. */
function applyFieldErrors(
  body: { errors?: Record<string, string[]> } | null,
  setError: UseFormSetError<FormValues>,
): boolean {
  const fieldErrors = body?.errors;
  if (!fieldErrors || typeof fieldErrors !== "object") return false;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (FIELD_NAMES.has(field) && messages?.[0]) {
      setError(field as keyof FormValues, { message: messages[0] });
    }
  }
  return true;
}

/**
 * Renders the contact form, persists text fields as a local draft, uploads
 * attachments before submission, and clears the draft after a successful send.
 */
export function ContactForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs let the browser preview/open a selected file before it's ever
  // uploaded. Recomputed whenever the file list changes; the previous batch
  // is revoked in the matching effect cleanup once it's no longer rendered.
  const previewUrls = useMemo(() => {
    const map = new Map<File, string>();
    for (const file of files) map.set(file, URL.createObjectURL(file));
    return map;
  }, [files]);
  useEffect(() => {
    return () => {
      for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, touchedFields, isSubmitted, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", company: "", message: "", agree: false },
  });

  // Restore a saved draft once on mount — attachments are excluded, see
  // loadDraft/saveDraft above.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      reset((current) => ({ ...current, ...draft }), { keepDefaultValues: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);

  // Keep saving as the user types, so closing the tab and coming back (or
  // opening a new one) picks up where they left off.
  const watchedDraft = useWatch({ control });
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveDraft({
        name: watchedDraft.name ?? "",
        email: watchedDraft.email ?? "",
        company: watchedDraft.company ?? "",
        message: watchedDraft.message ?? "",
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [watchedDraft.name, watchedDraft.email, watchedDraft.company, watchedDraft.message]);

  // zodResolver validates the whole form on every run, so blurring one field
  // also populates errors for fields the user hasn't touched yet — only
  // surface a field's error once that field itself was blurred, or once the
  // user has attempted a submit (at which point show everything).
  function showError<K extends keyof FormValues>(field: K) {
    return Boolean(errors[field]) && (touchedFields[field] || isSubmitted);
  }

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;
    setFiles((current) => {
      const next = [...current];
      for (const file of incoming) {
        if (next.length >= CONTACT_MAX_ATTACHMENTS) {
          toast.error(`You can attach up to ${CONTACT_MAX_ATTACHMENTS} files.`);
          break;
        }
        if (file.size > CONTACT_MAX_ATTACHMENT_BYTES) {
          toast.error(`${file.name} is over the 25 MB limit.`);
          continue;
        }
        next.push(file);
      }
      return next;
    });
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function onSubmit(values: FormValues) {
    try {
      const attachmentKeys = await Promise.all(files.map(uploadAttachment));

      const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          company: values.company || undefined,
          message: values.message,
          attachmentKeys: attachmentKeys.length ? attachmentKeys : undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (applyFieldErrors(body, setError)) {
          toast.error("Please fix the highlighted fields.");
          return;
        }
        throw new Error(body?.message ?? "Something went wrong sending your message.");
      }

      toast.success("Message sent", {
        description: "Thanks for reaching out — we'll get back to you soon.",
      });
      reset();
      setFiles([]);
      clearDraft();
    } catch (error) {
      toast.error("Message was not sent", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  const fieldClass =
    "mt-2 w-full rounded-xl border border-[var(--line)] bg-transparent px-4 py-3.5 text-base text-foreground outline-none transition-all duration-200 placeholder:text-foreground/35 focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10";

  return (
    // skipcq: JS-0415 -- ordinary form layout depth, not a code smell
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[var(--shadow-1)] sm:p-10 dark:border-white/10 dark:bg-white/[0.04]"
    >
      <p className="font-mono text-xs font-bold tracking-[0.16em] text-brand-blue uppercase">
        Send a message
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
        Tell us about your project
      </h2>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="reveal-field opacity-0">
          <label htmlFor="contact-name" className="text-sm font-semibold text-foreground">
            Name <span className="text-brand-red">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            className={fieldClass}
            {...register("name")}
          />
          {showError("name") ? (
            <p className="mt-1.5 text-sm font-medium text-brand-red">{errors.name?.message}</p>
          ) : null}
        </div>

        <div className="reveal-field opacity-0">
          <label htmlFor="contact-email" className="text-sm font-semibold text-foreground">
            Email <span className="text-brand-red">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={fieldClass}
            {...register("email")}
          />
          {showError("email") ? (
            <p className="mt-1.5 text-sm font-medium text-brand-red">{errors.email?.message}</p>
          ) : null}
        </div>

        <div className="reveal-field opacity-0 sm:col-span-2">
          <label htmlFor="contact-company" className="text-sm font-semibold text-foreground">
            Company <span className="text-foreground/40">(optional)</span>
          </label>
          <input
            id="contact-company"
            type="text"
            autoComplete="organization"
            placeholder="Company or organization name"
            className={fieldClass}
            {...register("company")}
          />
        </div>

        <div className="reveal-field opacity-0 sm:col-span-2">
          <label htmlFor="contact-message" className="text-sm font-semibold text-foreground">
            How can we help? <span className="text-brand-red">*</span>
          </label>
          <textarea
            id="contact-message"
            rows={6}
            placeholder="A few sentences about your project or question…"
            className={cn(fieldClass, "resize-none")}
            {...register("message")}
          />
          {showError("message") ? (
            <p className="mt-1.5 text-sm font-medium text-brand-red">{errors.message?.message}</p>
          ) : null}
        </div>

        <div className="reveal-field opacity-0 sm:col-span-2">
          <label
            htmlFor="contact-attachments-trigger"
            className="text-sm font-semibold text-foreground"
          >
            Attachments <span className="text-foreground/40">(optional · up to 25MB each)</span>
          </label>
          <button
            id="contact-attachments-trigger"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              addFiles(Array.from(event.dataTransfer.files));
            }}
            className={cn(
              "mt-2 w-full cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200",
              dragOver
                ? "scale-[1.01] border-brand-blue bg-brand-blue-50"
                : "border-[var(--line)] hover:border-brand-blue/60 hover:bg-[var(--surface-muted)]",
            )}
          >
            <Paperclip className="mx-auto size-6 text-foreground/40" strokeWidth={2.25} />
            <p className="mt-3 text-sm text-foreground/70">
              Drag &amp; drop files here, or{" "}
              <span className="font-medium text-brand-blue">browse</span>
            </p>
            <p className="mt-1 text-xs text-foreground/45">
              PDF, images, documents, archives · 25MB max each
            </p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          {files.length ? (
            <ul className="mt-3 space-y-1.5">
              {files.map((file, index) => {
                const url = previewUrls.get(file);
                const isImage = file.type.startsWith("image/");
                return (
                  <li
                    key={`${file.name}-${file.lastModified}-${file.size}`}
                    className="file-chip-enter flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm"
                  >
                    {isImage && isSafeBlobUrl(url) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ephemeral local blob: URL, not an optimizable remote asset
                      <img
                        src={encodeURI(url)}
                        alt=""
                        className="size-8 shrink-0 rounded object-cover"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-foreground/80">{file.name}</span>
                    <span className="shrink-0 text-xs text-foreground/45">
                      {formatBytes(file.size)}
                    </span>
                    {isSafeBlobUrl(url) && isPreviewableType(file.type) ? (
                      <a
                        href={encodeURI(url)}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-xs font-medium text-brand-blue hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="shrink-0 text-xs text-foreground/35">
                        Can&apos;t preview
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      aria-label={`Remove ${file.name}`}
                      className="shrink-0 text-foreground/40 transition-colors hover:text-brand-red"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="reveal-field opacity-0">
        <label className="mt-8 flex items-start gap-3 text-sm text-foreground/70">
          <input
            type="checkbox"
            className="mt-0.5 size-4.5 shrink-0 accent-brand-blue"
            {...register("agree")}
          />
          <span>
            I agree to the{" "}
            <Link href="/privacy-policy" className="font-medium text-brand-blue hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms-of-services" className="font-medium text-brand-blue hover:underline">
              Terms of Service
            </Link>
            , and to MGM Laboratory contacting me about this enquiry.
          </span>
        </label>
        {showError("agree") ? (
          <p className="mt-1.5 text-sm font-medium text-brand-red">{errors.agree?.message}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 flex w-full scale-100 items-center justify-center gap-2.5 rounded-xl bg-brand-blue px-5 py-4 text-base font-semibold text-white transition-all duration-200 hover:scale-[1.01] hover:opacity-90 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 disabled:hover:scale-100"
      >
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
        ) : (
          <Send className="size-4" strokeWidth={2.25} />
        )}
        Send message
      </button>
    </form>
  );
}
