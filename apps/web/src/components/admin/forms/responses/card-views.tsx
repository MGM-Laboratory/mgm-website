"use client";

import { useMemo, useState } from "react";
import { Play, Star, Flag } from "@phosphor-icons/react";
import { isAnswered } from "@repo/shared";

import { formFileUrl } from "@/lib/forms/admin-api";
import {
  cellFiles,
  formatDateTime,
  type DataColumn,
  type WorkingRow,
} from "@/lib/forms/data/columns";

import { CellView, isImageFile, isVideoFile, type OpenFile } from "./cells";
import type { LightboxItem } from "./lightbox";

const PAGE = 60;

/** One readable card per response, answers stacked in form order. */
export function CardsView({
  formId,
  rows,
  columns,
  onOpen,
  onOpenFile,
}: {
  formId: string;
  rows: WorkingRow[];
  columns: DataColumn[];
  onOpen: (row: WorkingRow) => void;
  onOpenFile: OpenFile;
}) {
  const [limit, setLimit] = useState(PAGE);
  const answerColumns = columns.filter((column) => column.group !== "meta");
  if (!rows.length)
    return <p className="py-16 text-center text-sm text-[#9ba4b5]">No responses match.</p>;
  return (
    <div>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.slice(0, limit).map((row) => (
          <li key={row.id}>
            <article className="h-full rounded-2xl border border-[#e4e8f0] bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
              <header className="mb-3 flex items-center gap-2">
                <button
                  className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-brand-blue hover:underline"
                  onClick={() => onOpen(row)}
                  type="button"
                >
                  {formatDateTime(row.record.createdAt)}
                </button>
                {row.record.admin.starred ? (
                  <Star aria-label="Starred" className="text-[#e0a82a]" size={13} weight="fill" />
                ) : null}
                {row.record.admin.flagged ? (
                  <Flag aria-label="Flagged" className="text-brand-red" size={13} weight="fill" />
                ) : null}
                {row.record.spam ? (
                  <span className="rounded bg-brand-red-50 px-1 text-[9px] font-bold text-brand-red uppercase">
                    spam
                  </span>
                ) : null}
              </header>
              <dl className="space-y-2.5">
                {answerColumns.map((column) => {
                  const value =
                    column.group === "extra"
                      ? row.extra[column.key]
                      : row.answers[
                          column.answer?.part?.kind === "other"
                            ? column.key
                            : (column.answer?.fieldId ?? column.key)
                        ];
                  if (!isAnswered(value)) return null;
                  return (
                    <div key={column.key}>
                      <dt className="text-[11px] font-semibold text-[#7e899d] dark:text-white/40">
                        {column.label}
                      </dt>
                      <dd className="mt-0.5 min-w-0 text-sm text-[#171b25] dark:text-white/85">
                        <span className="flex min-w-0 flex-wrap">
                          <CellView
                            column={column}
                            expanded
                            formId={formId}
                            onOpenFile={onOpenFile}
                            row={row}
                          />
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          </li>
        ))}
      </ul>
      {rows.length > limit ? (
        <div className="mt-5 text-center">
          <button
            className="h-9 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold hover:border-brand-blue hover:text-brand-blue dark:border-white/10"
            onClick={() => setLimit((value) => value + PAGE)}
            type="button"
          >
            Show more ({rows.length - limit} left)
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Every uploaded image and video across the shown responses, as a masonry wall. */
export function GalleryView({
  formId,
  rows,
  columns,
  onOpenItems,
}: {
  formId: string;
  rows: WorkingRow[];
  columns: DataColumn[];
  onOpenItems: (items: LightboxItem[], index: number) => void;
}) {
  const fileColumns = columns.filter((column) => column.valueType === "file");
  const [fieldKey, setFieldKey] = useState<string>("all");
  const [limit, setLimit] = useState(80);
  const items = useMemo(() => {
    const out: (LightboxItem & { rowId: string })[] = [];
    for (const row of rows) {
      for (const column of fileColumns) {
        if (fieldKey !== "all" && column.key !== fieldKey) continue;
        for (const file of cellFiles(column, row)) {
          if (isImageFile(file) || isVideoFile(file)) {
            out.push({
              ...file,
              caption: `${column.label} · ${formatDateTime(row.record.createdAt)}`,
              rowId: row.id,
            });
          }
        }
      }
    }
    return out;
  }, [rows, fileColumns, fieldKey]);

  if (!fileColumns.length)
    return (
      <p className="py-16 text-center text-sm text-[#9ba4b5]">This form has no upload questions.</p>
    );
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "All uploads" },
          ...fileColumns.map((column) => ({ key: column.key, label: column.label })),
        ].map((option) => (
          <button
            aria-pressed={fieldKey === option.key}
            className={`h-8 rounded-full px-3 text-xs font-semibold transition ${fieldKey === option.key ? "bg-[#171b25] text-white dark:bg-white dark:text-[#171b25]" : "border border-[#d9dfeb] text-[#5c6679] hover:border-brand-blue dark:border-white/10 dark:text-white/60"}`}
            key={option.key}
            onClick={() => setFieldKey(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[#8a93a6]">{items.length} images and videos</span>
      </div>
      {!items.length ? (
        <p className="py-16 text-center text-sm text-[#9ba4b5]">
          No images or videos in these responses.
        </p>
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
          {items.slice(0, limit).map((item, index) => (
            <button
              aria-label={`Open ${item.name}`}
              className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-[#e4e8f0] bg-[#f4f6fa] outline-none focus-visible:ring-2 focus-visible:ring-brand-blue dark:border-white/10 dark:bg-white/5"
              key={`${item.rowId}-${item.key}`}
              onClick={() => onOpenItems(items, index)}
              type="button"
            >
              {isVideoFile(item) ? (
                <span className="relative block">
                  <video
                    className="block w-full"
                    muted
                    playsInline
                    preload="metadata"
                    src={`${formFileUrl(formId, item.key)}#t=0.1`}
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex size-10 items-center justify-center rounded-full bg-[#0e1116]/60 text-white">
                      <Play size={18} weight="fill" />
                    </span>
                  </span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- signed per-response file
                <img
                  alt=""
                  className="block w-full transition duration-300 group-hover:brightness-95"
                  decoding="async"
                  height={item.height}
                  loading="lazy"
                  src={formFileUrl(formId, item.key)}
                  width={item.width}
                />
              )}
              <span className="block truncate px-2 py-1.5 text-left text-[11px] text-[#5c6679] dark:text-white/55">
                {item.caption}
              </span>
            </button>
          ))}
        </div>
      )}
      {items.length > limit ? (
        <div className="mt-4 text-center">
          <button
            className="h-9 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold hover:border-brand-blue hover:text-brand-blue dark:border-white/10"
            onClick={() => setLimit((value) => value + 80)}
            type="button"
          >
            Show more
          </button>
        </div>
      ) : null}
    </div>
  );
}
