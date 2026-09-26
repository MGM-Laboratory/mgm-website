"use client";

import {
  File as FileIcon,
  FileAudio,
  FileDoc,
  FileImage,
  FilePdf,
  FilePpt,
  FileText,
  FileVideo,
  FileXls,
  FileZip,
  Signature,
  Star,
} from "@phosphor-icons/react";
import {
  OTHER_OPTION_ID,
  isFileAnswer,
  optionLabel,
  type FormAnswerValue,
  type FormField,
  type FormFileAnswer,
} from "@repo/shared";

import { formFileUrl } from "@/lib/forms/admin-api";
import {
  answerValue,
  cellText,
  countryName,
  formatDateTime,
  formatDuration,
  metaValue,
  type DataColumn,
  type WorkingRow,
} from "@/lib/forms/data/columns";

export const chipClass =
  "inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium";

export function isImageFile(file: Pick<FormFileAnswer, "type" | "name">) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name);
}

export function isVideoFile(file: Pick<FormFileAnswer, "type" | "name">) {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileTypeIcon({
  file,
  size = 14,
}: {
  file: Pick<FormFileAnswer, "type" | "name">;
  size?: number;
}) {
  const type = file.type;
  const name = file.name.toLowerCase();
  const Icon = isImageFile(file)
    ? FileImage
    : isVideoFile(file)
      ? FileVideo
      : type.startsWith("audio/")
        ? FileAudio
        : type === "application/pdf" || name.endsWith(".pdf")
          ? FilePdf
          : /sheet|excel|csv/.test(type) || /\.(xlsx?|ods|csv)$/.test(name)
            ? FileXls
            : /presentation|powerpoint/.test(type) || /\.(pptx?|odp)$/.test(name)
              ? FilePpt
              : /word|opendocument\.text|rtf/.test(type) || /\.(docx?|odt|rtf)$/.test(name)
                ? FileDoc
                : /zip|7z/.test(type) || /\.(zip|7z)$/.test(name)
                  ? FileZip
                  : type.startsWith("text/")
                    ? FileText
                    : FileIcon;
  return <Icon aria-hidden className="shrink-0" size={size} weight="duotone" />;
}

export type OpenFile = (files: FormFileAnswer[], index: number) => void;

/** A file as a chip, or a thumbnail for images; opens the lightbox. */
export function FileChips({
  formId,
  files,
  onOpen,
  thumbSize = 28,
  signature = false,
}: {
  formId: string;
  files: FormFileAnswer[];
  onOpen: OpenFile;
  thumbSize?: number;
  signature?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {files.map((file, index) =>
        isImageFile(file) ? (
          <button
            aria-label={`Open ${file.name}`}
            className={`shrink-0 overflow-hidden rounded-md border border-[#e4e8f0] bg-white outline-none transition hover:ring-2 hover:ring-brand-blue/40 focus-visible:ring-2 focus-visible:ring-brand-blue dark:border-white/10 ${signature ? "px-1" : ""}`}
            key={file.key}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(files, index);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            title={file.name}
            type="button"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-response admin files */}
            <img
              alt=""
              className={signature ? "object-contain" : "object-cover"}
              decoding="async"
              height={thumbSize}
              loading="lazy"
              src={formFileUrl(formId, file.key)}
              style={{ width: signature ? thumbSize * 2 : thumbSize, height: thumbSize }}
              width={signature ? thumbSize * 2 : thumbSize}
            />
          </button>
        ) : (
          <button
            className={`${chipClass} bg-[#eef1f6] text-[#3b4150] outline-none hover:bg-brand-blue-50 hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue dark:bg-white/10 dark:text-white/75`}
            key={file.key}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(files, index);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            title={`${file.name} · ${formatBytes(file.size)}`}
            type="button"
          >
            {signature ? (
              <Signature aria-hidden size={13} />
            ) : (
              <FileTypeIcon file={file} size={13} />
            )}
            <span className="truncate">{file.name}</span>
          </button>
        ),
      )}
    </span>
  );
}

/** An ISO code as "ID Indonesia" (code in mono), a stored country name as is. No flags. */
export function CountryText({ value }: { value: string }) {
  if (!/^[a-z]{2}$/i.test(value)) return <span className="truncate">{value}</span>;
  return (
    <span className="truncate" title={countryName(value)}>
      <span className="font-mono text-[11px] font-semibold">{value.toUpperCase()}</span>{" "}
      {countryName(value)}
    </span>
  );
}

export function RatingStars({ value, max = 5 }: { value: number; max?: number }) {
  const count = Math.max(1, Math.min(10, max));
  return (
    <span
      aria-label={`${value} of ${count}`}
      className="inline-flex items-center gap-px"
      role="img"
    >
      {Array.from({ length: count }, (_, index) => (
        <Star
          aria-hidden
          className={
            index < Math.round(value) ? "text-[#e0a82a]" : "text-[#d6dbe6] dark:text-white/15"
          }
          key={index}
          size={13}
          weight={index < Math.round(value) ? "fill" : "regular"}
        />
      ))}
    </span>
  );
}

export function ScaleBar({ value, min, max }: { value: number; min: number; max: number }) {
  const share = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold tabular-nums">{value}</span>
      <span
        aria-hidden
        className="h-1.5 w-12 overflow-hidden rounded-full bg-[#eef0f4] dark:bg-white/10"
      >
        <span
          className="block h-full rounded-full bg-brand-blue"
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </span>
  );
}

function scaleRange(field: FormField): [number, number] {
  switch (field.type) {
    case "nps":
      return [0, 10];
    case "rating":
      return [1, field.max ?? 5];
    case "opinion_scale":
      return [field.min ?? 1, field.max ?? 10];
    default:
      return [field.min ?? 0, field.max ?? 100];
  }
}

function npsTone(value: number) {
  if (value >= 9) return "text-brand-green";
  if (value >= 7) return "text-[#a97b1c]";
  return "text-brand-red";
}

export function ChoiceChips({
  field,
  ids,
  other,
}: {
  field: FormField;
  ids: string[];
  other?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {ids.map((id, index) => (
        <span
          className={`${chipClass} ${id === OTHER_OPTION_ID ? "bg-brand-yellow-50 text-[#8a6412] dark:bg-brand-yellow/15 dark:text-brand-yellow" : "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#8fb0ea]"}`}
          key={`${id}-${index}`}
          title={optionLabel(field, id)}
        >
          {field.type === "ranking" ? (
            <span className="tabular-nums opacity-70">{index + 1}.</span>
          ) : null}
          <span className="truncate">
            {optionLabel(field, id)}
            {id === OTHER_OPTION_ID && other ? `: ${other}` : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

export function MatrixMini({
  field,
  value,
}: {
  field: FormField;
  value: Record<string, string | string[]>;
}) {
  const rows = field.rowsList ?? [];
  const columns = field.columnsList ?? [];
  return (
    <span
      aria-label={rows
        .map((row) => {
          const cell = value[row.id];
          const ids = cell === undefined ? [] : Array.isArray(cell) ? cell : [cell];
          return `${row.label}: ${ids.map((id) => columns.find((column) => column.id === id)?.label ?? id).join(", ") || "none"}`;
        })
        .join("; ")}
      className="inline-grid gap-px"
      role="img"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, 7px)` }}
    >
      {rows.slice(0, 6).flatMap((row) => {
        const cell = value[row.id];
        const ids = cell === undefined ? [] : Array.isArray(cell) ? cell : [cell];
        return columns.map((column) => (
          <span
            className={`size-[7px] rounded-[2px] ${ids.includes(column.id) ? "bg-brand-blue" : "bg-[#e4e8f0] dark:bg-white/10"}`}
            key={`${row.id}-${column.id}`}
          />
        ));
      })}
    </span>
  );
}

/** The rich cell content of one column in one row. */
export function CellView({
  column,
  row,
  formId,
  onOpenFile,
  expanded = false,
}: {
  column: DataColumn;
  row: WorkingRow;
  formId: string;
  onOpenFile: OpenFile;
  expanded?: boolean;
}) {
  const empty = <span className="text-[#c3c9d4] dark:text-white/15">—</span>;
  if (column.group === "meta") {
    const value = metaValue(column.key, row.record);
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    ) {
      if (column.valueType === "boolean")
        return <span className="text-[#c3c9d4] dark:text-white/20">No</span>;
      return empty;
    }
    switch (column.key) {
      case "$submittedAt":
        return <span className="tabular-nums">{formatDateTime(String(value))}</span>;
      case "$duration":
        return <span className="tabular-nums">{formatDuration(value as number)}</span>;
      case "$country":
        return <CountryText value={String(value)} />;
      case "$tags":
        return (
          <span className="flex gap-1 overflow-hidden">
            {(value as string[]).map((tag) => (
              <span
                className={`${chipClass} bg-[#eef1f6] text-[#3b4150] dark:bg-white/10 dark:text-white/70`}
                key={tag}
              >
                {tag}
              </span>
            ))}
          </span>
        );
      case "$ip":
        return <span className="font-mono text-[11px]">{String(value)}</span>;
      default:
        if (typeof value === "boolean")
          return (
            <span className={value ? "font-semibold" : "text-[#9ba4b5]"}>
              {value ? "Yes" : "No"}
            </span>
          );
        return <span className="truncate">{String(value)}</span>;
    }
  }

  if (column.group === "extra") {
    const text = cellText(column, row);
    if (!text) return empty;
    return (
      <span className={`truncate ${column.valueType === "number" ? "tabular-nums" : ""}`}>
        {text}
      </span>
    );
  }

  const field = column.field;
  const value = answerValue(column, row.answers);
  if (!field || value === undefined || value === null || value === "") return empty;

  if (column.answer?.part?.kind === "other")
    return <span className="truncate">{String(value)}</span>;
  if (column.answer?.part?.kind === "row")
    return <span className="truncate">{cellText(column, row)}</span>;

  switch (field.type) {
    case "rating":
      return typeof value === "number" ? (
        <RatingStars max={field.max ?? 5} value={value} />
      ) : (
        <span>{String(value)}</span>
      );
    case "nps":
      return typeof value === "number" ? (
        <span className={`inline-flex items-center gap-2 ${npsTone(value)}`}>
          <ScaleBar max={10} min={0} value={value} />
        </span>
      ) : (
        <span>{String(value)}</span>
      );
    case "opinion_scale":
    case "slider": {
      const [min, max] = scaleRange(field);
      return typeof value === "number" ? (
        <ScaleBar max={max} min={min} value={value} />
      ) : (
        <span>{String(value)}</span>
      );
    }
    case "number":
      return <span className="tabular-nums">{cellText(column, row)}</span>;
    case "multiple_choice":
    case "dropdown":
    case "picture_choice":
    case "checkboxes":
    case "multiselect":
    case "ranking": {
      const ids = Array.isArray(value) ? value.map(String) : [String(value)];
      const other = row.answers[`${field.id}:other`];
      return (
        <ChoiceChips
          field={field}
          ids={ids}
          other={typeof other === "string" ? other : undefined}
        />
      );
    }
    case "yes_no":
      return (
        <span
          className={`${chipClass} ${value === true ? "bg-brand-green-50 text-brand-green dark:bg-brand-green/15" : "bg-[#eef1f6] text-[#5c6470] dark:bg-white/10 dark:text-white/60"}`}
        >
          {value === true ? "Yes" : "No"}
        </span>
      );
    case "consent":
      return value === true ? (
        <span className={`${chipClass} bg-brand-green-50 text-brand-green`}>Agreed</span>
      ) : (
        empty
      );
    case "email":
      return (
        <a
          className="truncate text-brand-blue hover:underline"
          href={`mailto:${String(value)}`}
          onClick={(event) => event.stopPropagation()}
        >
          {String(value)}
        </a>
      );
    case "phone":
      return (
        <a
          className="truncate tabular-nums text-brand-blue hover:underline"
          href={`tel:${String(value).replace(/[^\d+]/g, "")}`}
          onClick={(event) => event.stopPropagation()}
        >
          {String(value)}
        </a>
      );
    case "url": {
      const href = /^https?:\/\//i.test(String(value)) ? String(value) : null;
      return href ? (
        <a
          className="truncate text-brand-blue hover:underline"
          href={href}
          onClick={(event) => event.stopPropagation()}
          rel="noreferrer noopener"
          target="_blank"
        >
          {String(value).replace(/^https?:\/\//i, "")}
        </a>
      ) : (
        <span className="truncate">{String(value)}</span>
      );
    }
    case "date":
    case "datetime":
    case "time":
      return <span className="tabular-nums">{formatAnswerDate(field, String(value))}</span>;
    case "color":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-4 rounded-md border border-black/10"
            style={{
              background: /^#[0-9a-f]{3,8}$/i.test(String(value)) ? String(value) : "transparent",
            }}
          />
          <span className="font-mono text-[11px] uppercase">{String(value)}</span>
        </span>
      );
    case "country":
      return <CountryText value={String(value)} />;
    case "file_upload":
    case "image_upload":
    case "signature":
      return isFileAnswer(value) ? (
        <FileChips
          files={value}
          formId={formId}
          onOpen={onOpenFile}
          signature={field.type === "signature"}
        />
      ) : (
        empty
      );
    case "matrix":
      return typeof value === "object" && !Array.isArray(value) ? (
        <span className="inline-flex items-center gap-2">
          <MatrixMini field={field} value={value as Record<string, string | string[]>} />
        </span>
      ) : (
        empty
      );
    case "long_text":
      return (
        <span className={expanded ? "whitespace-pre-wrap" : "line-clamp-1"}>{String(value)}</span>
      );
    default:
      return <span className="truncate">{cellText(column, row)}</span>;
  }
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Wall-clock answers (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `HH:mm`) in the admin's locale, never shifted. */
export function formatAnswerDate(field: Pick<FormField, "type">, text: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text);
  if (!match) return text;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  );
  return field.type === "datetime" ? dateTimeFormat.format(date) : dateFormat.format(date);
}

export function answerIsEditable(column: DataColumn) {
  if (column.group !== "answer" || !column.field || column.answer?.part?.kind === "row")
    return false;
  if (column.answer?.part?.kind === "other") return true;
  return !["file_upload", "image_upload", "signature", "matrix", "ranking", "address"].includes(
    column.field.type,
  );
}

export type { FormAnswerValue };
