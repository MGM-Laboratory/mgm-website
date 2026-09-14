"use client";

import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function isAcceptedCv(file: File) {
  return ACCEPTED_TYPES.includes(file.type);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Drag-and-drop + browse CV picker. Client-side checks mirror the API's:
 * PDF/Word only, and under the configured byte ceiling.
 */
export function CareerCvDropzone({
  file,
  maxBytes,
  error,
  onSelect,
}: {
  file: File | null;
  maxBytes: number;
  error: string | null;
  onSelect: (file: File | null, error: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (next: File | undefined) => {
    if (!next) return;
    if (!isAcceptedCv(next)) {
      onSelect(null, "The CV must be a PDF or Word document (.pdf, .doc, .docx).");
      return;
    }
    if (next.size > maxBytes) {
      onSelect(null, `The CV must be under ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    onSelect(next, null);
  };

  return (
    <div>
      <div
        aria-label="Upload your CV"
        className={`group relative flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragging
            ? "border-brand-blue bg-brand-blue/5"
            : error
              ? "border-brand-red/60 bg-brand-red/[0.03]"
              : "border-[var(--line-strong)] bg-white hover:border-brand-blue/60 dark:bg-white/[0.03]"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {file ? (
          <div className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-blue/10 text-brand-blue">
              <FileText aria-hidden="true" size={22} strokeWidth={2} />
            </span>
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-semibold text-[var(--ink)] dark:text-white">
                {file.name}
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">{formatFileSize(file.size)}</p>
            </div>
            <button
              aria-label="Remove CV"
              className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--ink-3)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(null, null);
              }}
              type="button"
            >
              <X aria-hidden="true" size={15} strokeWidth={2.25} />
            </button>
          </div>
        ) : (
          <>
            <span className="grid size-12 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--ink-3)] transition group-hover:text-brand-blue dark:bg-white/[0.07]">
              <Upload aria-hidden="true" size={22} strokeWidth={2} />
            </span>
            <p className="mt-4 text-sm font-semibold text-[var(--ink)] dark:text-white">
              Drag &amp; drop your CV here, or <span className="text-brand-blue">browse files</span>
            </p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              PDF or Word (.pdf, .doc, .docx) — up to {Math.floor(maxBytes / 1024 / 1024)} MB
            </p>
          </>
        )}
      </div>
      {error ? <p className="mt-2 text-sm text-brand-red">{error}</p> : null}
      <input
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(event) => {
          accept(event.target.files?.[0] ?? undefined);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}
