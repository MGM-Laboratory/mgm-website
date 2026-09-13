"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  apaCitation,
  bibtexCitation,
  chicagoCitation,
  ieeeCitation,
  mlaCitation,
  plainTextCitation,
  risCitation,
  type PublicationDraft,
} from "@/lib/publication-cms";
import { CopyButton } from "@/components/publications/copy-button";

type CitationFormat = "apa" | "ieee" | "mla" | "chicago" | "bibtex" | "ris" | "plain";

const FORMATS: { id: CitationFormat; label: string }[] = [
  { id: "apa", label: "APA" },
  { id: "ieee", label: "IEEE" },
  { id: "mla", label: "MLA" },
  { id: "chicago", label: "Chicago" },
  { id: "bibtex", label: "BibTeX" },
  { id: "ris", label: "RIS" },
  { id: "plain", label: "Plain text" },
];

function downloadText(fileName: string, text: string, label: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  toast.success(`${label} downloaded`, {
    description: `Import ${fileName} into Zotero, Mendeley, or any reference manager.`,
  });
}

/** Copyable citations in every common format, with reference-manager downloads. */
export function CitationBox({ publication }: { publication: PublicationDraft }) {
  const [format, setFormat] = useState<CitationFormat>("apa");

  const citations = useMemo(
    () => ({
      apa: apaCitation(publication),
      ieee: ieeeCitation(publication),
      mla: mlaCitation(publication),
      chicago: chicagoCitation(publication),
      bibtex: bibtexCitation(publication),
      ris: risCitation(publication),
      plain: plainTextCitation(publication),
    }),
    [publication],
  );

  const value = citations[format];
  const current = FORMATS.find((entry) => entry.id === format);
  const fileBase = publication.slug || "publication";

  return (
    <section aria-labelledby="cite-heading" id="cite">
      <h2
        className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white"
        id="cite-heading"
      >
        Cite this publication
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ink-3)]">
        Copy a formatted citation or download a file for your reference manager.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-3 py-2 dark:border-white/10">
          {FORMATS.map((entry) => (
            <button
              aria-pressed={entry.id === format}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                entry.id === format
                  ? "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20 dark:text-[#9db8e8]"
                  : "text-[var(--ink-3)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}
              key={entry.id}
              onClick={() => setFormat(entry.id)}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          <pre className="max-h-56 overflow-y-auto rounded-xl bg-[var(--surface-muted)] p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap text-[var(--ink-2)] dark:bg-white/[0.04] dark:text-white/75">
            {value}
          </pre>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CopyButton label={`${current?.label ?? "Citation"} citation`} value={value} />
            <span className="mx-1 h-4 w-px bg-[var(--line-strong)]" aria-hidden="true" />
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:bg-white/[0.03] dark:text-white/70 dark:hover:text-white"
              onClick={() => downloadText(`${fileBase}.bib`, citations.bibtex, "BibTeX")}
              type="button"
            >
              <DownloadSimple size={15} />
              .bib
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:bg-white/[0.03] dark:text-white/70 dark:hover:text-white"
              onClick={() => downloadText(`${fileBase}.ris`, citations.ris, "RIS")}
              type="button"
            >
              <DownloadSimple size={15} />
              .ris
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:bg-white/[0.03] dark:text-white/70 dark:hover:text-white"
              onClick={() => downloadText(`${fileBase}.txt`, citations.plain, "Plain text")}
              type="button"
            >
              <DownloadSimple size={15} />
              .txt
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
