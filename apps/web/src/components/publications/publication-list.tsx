"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  formatPublicationDate,
  publicationTypeLabel,
  PUBLICATION_TYPES,
  type CmsPublicationRecord,
  type PublicationType,
} from "@/lib/publication-cms";

const TYPE_BADGES: Record<PublicationType, string> = {
  "journal-article": "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  "conference-paper":
    "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
  preprint: "bg-brand-yellow-50 text-[#a97b1c] dark:bg-brand-yellow/15 dark:text-[#e3c36a]",
  "book-chapter": "bg-brand-red-50 text-brand-red dark:bg-brand-red/15 dark:text-[#ef9a9a]",
  book: "bg-brand-red-50 text-brand-red dark:bg-brand-red/15 dark:text-[#ef9a9a]",
  thesis: "bg-[var(--surface-muted)] text-[var(--ink-2)] dark:bg-white/10 dark:text-white/75",
};

/**
 * The publications index: search, filter by type, and journal-style entry
 * rows. Filtering happens in the browser over the already-rendered feed.
 */
export function PublicationList({ records }: { records: CmsPublicationRecord[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<PublicationType | "all">("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const publication = record.publication;
      if (type !== "all" && publication.type !== type) return false;
      if (!needle) return true;
      return [
        publication.title,
        publication.journal,
        publication.publisher,
        publication.doi,
        ...publication.keywords,
        ...publication.authors.map((author) => author.name),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [query, records, type]);

  const counts = useMemo(() => {
    const byType = new Map<PublicationType, number>();
    for (const record of records) {
      const current = byType.get(record.publication.type) ?? 0;
      byType.set(record.publication.type, current + 1);
    }
    return byType;
  }, [records]);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
            size={16}
          />
          <input
            aria-label="Search publications"
            className="h-11 w-full truncate rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-3)] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-white/35"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, authors, keywords…"
            value={query}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
              type === "all"
                ? "bg-[#0e1116] text-white dark:bg-white dark:text-[#0e1116]"
                : "bg-[var(--surface-muted)] text-[var(--ink-2)] hover:text-[var(--ink)] dark:bg-white/[0.06] dark:text-white/60 dark:hover:text-white"
            }`}
            onClick={() => setType("all")}
            type="button"
          >
            All · {records.length}
          </button>
          {PUBLICATION_TYPES.map((entry) => {
            const count = counts.get(entry.id) ?? 0;
            if (!count) return null;
            return (
              <button
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  type === entry.id
                    ? "bg-[#0e1116] text-white dark:bg-white dark:text-[#0e1116]"
                    : "bg-[var(--surface-muted)] text-[var(--ink-2)] hover:text-[var(--ink)] dark:bg-white/[0.06] dark:text-white/60 dark:hover:text-white"
                }`}
                key={entry.id}
                onClick={() => setType(entry.id)}
                type="button"
              >
                {entry.label} · {count}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        {visible.length ? (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)] dark:divide-white/10 dark:border-white/10">
            {visible.map((record) => {
              const publication = record.publication;
              const authors = publication.authors.map((author) => author.name);
              return (
                <li key={record.slug}>
                  <Link
                    className="group block px-1 py-7 transition sm:px-2"
                    href={`/publications/${record.slug}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${TYPE_BADGES[publication.type]}`}
                      >
                        {publicationTypeLabel(publication.type)}
                      </span>
                      <time
                        className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-3)] uppercase"
                        dateTime={publication.date}
                      >
                        {formatPublicationDate(publication.date)}
                      </time>
                    </div>
                    <h3 className="mt-3 font-display text-[1.375rem] leading-snug font-semibold tracking-[-0.015em] text-[#0e1116] transition group-hover:text-brand-blue dark:text-white">
                      {publication.title}
                    </h3>
                    {authors.length ? (
                      <p className="mt-1.5 text-sm text-[var(--ink-2)] dark:text-white/60">
                        {authors.join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-[13px] text-[var(--ink-3)]">
                      {[publication.journal, publication.pages && `pp. ${publication.pages}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {publication.keywords.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {publication.keywords.slice(0, 6).map((keyword) => (
                          <span
                            className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-3)] dark:bg-white/[0.06] dark:text-white/50"
                            key={keyword}
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {publication.doi ? (
                      <span className="mt-3 inline-block font-mono text-xs text-brand-blue">
                        doi: {publication.doi}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center dark:border-white/10">
            <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
              No publications match
            </p>
            <p className="mt-2 text-[var(--ink-3)]">
              Try a different search, or clear the type filter.
            </p>
          </div>
        )}
      </div>

      {records.some((record) => record.publication.doi) ? (
        <p className="mt-6 text-xs leading-6 text-[var(--ink-3)]">
          DOI links resolve through doi.org — the canonical registry for published research.
        </p>
      ) : null}
    </div>
  );
}
