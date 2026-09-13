"use client";

import { BookOpenText, DownloadSimple, Quotes } from "@phosphor-icons/react";
import { useState } from "react";

import { PaperPreview } from "@/components/publications/paper-preview";
import { PdfViewerDialog } from "@/components/publications/pdf-viewer-dialog";
import { formatPaperSize } from "@/lib/publication-cms";

/**
 * The reading surface of a publication page: the first-page preview with its
 * invitation to read, the action row, and the full-screen PDF viewer they all
 * open.
 */
export function PaperSection({
  fileName,
  paperSize,
  title,
  url,
}: {
  fileName?: string;
  paperSize?: number;
  title: string;
  url?: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const safeFileName = fileName ?? `${title}.pdf`.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  const size = formatPaperSize(paperSize);

  return (
    <section aria-labelledby="paper-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white"
            id="paper-heading"
          >
            Paper
          </h2>
          {url ? (
            <p className="mt-1.5 font-mono text-xs text-[var(--ink-3)]">
              PDF{size ? ` · ${size}` : ""}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-[var(--ink-3)]">
              The manuscript has not been uploaded yet.
            </p>
          )}
        </div>
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white transition hover:bg-[#2f5db4]"
              onClick={() => setViewerOpen(true)}
              type="button"
            >
              <BookOpenText size={17} />
              Read full text
            </button>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line-strong)] px-5 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:text-white/70 dark:hover:text-white"
              download={safeFileName}
              href={url}
            >
              <DownloadSimple size={16} />
              Download PDF
            </a>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line-strong)] px-5 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:text-white/70 dark:hover:text-white"
              href="#cite"
            >
              <Quotes size={16} />
              Cite
            </a>
          </div>
        ) : null}
      </div>

      {url ? (
        <div className="mt-6">
          <PaperPreview
            fileName={safeFileName}
            onOpenViewer={() => setViewerOpen(true)}
            url={url}
          />
        </div>
      ) : (
        <div className="mt-6 grid aspect-[210/90] place-items-center rounded-[24px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] dark:border-white/15 dark:bg-white/[0.02]">
          <p className="max-w-sm px-6 text-center text-sm leading-6 text-[var(--ink-3)]">
            The full text will appear here once the paper file is published.
          </p>
        </div>
      )}

      {viewerOpen && url ? (
        <PdfViewerDialog
          fileName={safeFileName}
          onClose={() => setViewerOpen(false)}
          title={title}
          url={url}
        />
      ) : null}
    </section>
  );
}
