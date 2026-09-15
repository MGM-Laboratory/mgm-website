"use client";

import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONTACT_MAX_ATTACHMENTS,
  CONTACT_MAX_ATTACHMENT_BYTES,
  contactFormSchema,
} from "@repo/shared";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
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

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

export function ContactForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, touchedFields, isSubmitted, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", company: "", message: "", agree: false },
  });

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
        const fieldErrors = body?.errors as Record<string, string[]> | undefined;
        if (fieldErrors && typeof fieldErrors === "object") {
          for (const [field, messages] of Object.entries(fieldErrors)) {
            if (FIELD_NAMES.has(field) && messages?.[0]) {
              setError(field as keyof FormValues, { message: messages[0] });
            }
          }
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
    } catch (error) {
      toast.error("Message was not sent", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="text-sm font-medium text-foreground">
            Name <span className="text-brand-red">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-brand-blue"
            {...register("name")}
          />
          {showError("name") ? (
            <p className="mt-1 text-sm font-medium text-brand-red">{errors.name?.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="contact-email" className="text-sm font-medium text-foreground">
            Email <span className="text-brand-red">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-brand-blue"
            {...register("email")}
          />
          {showError("email") ? (
            <p className="mt-1 text-sm font-medium text-brand-red">{errors.email?.message}</p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="contact-company" className="text-sm font-medium text-foreground">
            Company <span className="text-foreground/40">(optional)</span>
          </label>
          <input
            id="contact-company"
            type="text"
            autoComplete="organization"
            placeholder="Company or organization name"
            className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-brand-blue"
            {...register("company")}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
            How can we help? <span className="text-brand-red">*</span>
          </label>
          <textarea
            id="contact-message"
            rows={5}
            placeholder="A few sentences about your project or question…"
            className="mt-1.5 w-full resize-none rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-brand-blue"
            {...register("message")}
          />
          {showError("message") ? (
            <p className="mt-1 text-sm font-medium text-brand-red">{errors.message?.message}</p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label className="text-sm font-medium text-foreground">
            Attachments <span className="text-foreground/40">(optional · up to 25MB each)</span>
          </label>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload attachments"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
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
              "mt-1.5 cursor-pointer rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
              dragOver
                ? "border-brand-blue bg-brand-blue-50"
                : "border-[var(--line)] hover:border-brand-blue/60 hover:bg-[var(--surface-muted)]",
            )}
          >
            <Paperclip className="mx-auto size-5 text-foreground/40" strokeWidth={2.25} />
            <p className="mt-2 text-sm text-foreground/70">
              Drag &amp; drop files here, or{" "}
              <span className="font-medium text-brand-blue">browse</span>
            </p>
            <p className="mt-1 text-xs text-foreground/45">
              PDF, images, documents, archives · 25MB max each
            </p>
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
          </div>
          {files.length ? (
            <ul className="mt-3 space-y-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm"
                >
                  <span className="truncate text-foreground/80">{file.name}</span>
                  <span className="shrink-0 text-xs text-foreground/45">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Remove ${file.name}`}
                    className="shrink-0 text-foreground/40 transition-colors hover:text-brand-red"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <label className="mt-6 flex items-start gap-2.5 text-sm text-foreground/70">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-brand-blue"
          {...register("agree")}
        />
        <span>
          I agree to the{" "}
          <Link href="/privacy-policy" className="font-medium text-brand-blue hover:underline">
            Privacy Policy
          </Link>{" "}
          and to MGM Laboratory contacting me about this enquiry.
        </span>
      </label>
      {showError("agree") ? (
        <p className="mt-1 text-sm font-medium text-brand-red">{errors.agree?.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-brand-blue px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
        ) : (
          <Send className="size-4" strokeWidth={2.25} />
        )}
        Send message
      </button>
      <p className="mt-3 text-xs text-foreground/45">
        We&apos;ll only use your details to respond. Your message and any files are sent securely
        and stored privately.
      </p>
    </form>
  );
}
