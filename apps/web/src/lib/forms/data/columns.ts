/**
 * The column model shared by the responses table, the cleaner, the charts
 * and every export: one column per answer (from `answerColumns`), the
 * response metadata, and the virtual columns the cleaning pipeline adds
 * (split parts and computed formulas).
 *
 * A `WorkingRow` is a response after cleaning: `answers` is the cleaned copy
 * (the same object as the record's when nothing changed), `extra` holds the
 * virtual columns' values.
 */

import {
  OTHER_OPTION_ID,
  answerColumns,
  answerToText,
  columnText,
  isFileAnswer,
  isMultiChoiceType,
  optionLabel,
  type AnswerColumn,
  type FormAnswerValue,
  type FormAnswers,
  type FormDocument,
  type FormField,
  type FormFileAnswer,
  type FormResponseRecord,
} from "@repo/shared";

import type { ExprValue } from "./expr";

export type WorkingRow = {
  id: string;
  /** Position in the loaded responses (newest first), stable across cleaning. */
  index: number;
  record: FormResponseRecord;
  answers: FormAnswers;
  extra: Record<string, ExprValue>;
};

/** How a column filters and sorts. */
export type ColumnValueType =
  "text" | "number" | "date" | "boolean" | "choice" | "multi" | "file" | "object";

export type ColumnGroup = "answer" | "meta" | "extra";

export type DataColumn = {
  key: string;
  label: string;
  group: ColumnGroup;
  valueType: ColumnValueType;
  /** The answer's field (answer columns only). */
  field?: FormField;
  answer?: AnswerColumn;
  /** Choice options for filters and charts (id + label). */
  options?: { id: string; label: string }[];
  /** A text cell the cleaning steps may rewrite. */
  cleanable: boolean;
  /** Suggested width in pixels. */
  width: number;
};

const COUNTRY_NAMES: Record<string, string> = {};

/** An English country name for an ISO 3166 alpha-2 code (falls back to the code). */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  const upper = code.toUpperCase();
  if (COUNTRY_NAMES[upper]) return COUNTRY_NAMES[upper];
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper) ?? upper;
    COUNTRY_NAMES[upper] = name;
    return name;
  } catch {
    return upper;
  }
}

const TEXT_TYPES = new Set([
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "hidden",
  "name",
  "address",
]);

function answerValueType(column: AnswerColumn): ColumnValueType {
  const field = column.field;
  if (column.part?.kind === "other") return "text";
  if (column.part?.kind === "row") return field.matrixMultiple ? "multi" : "choice";
  switch (field.type) {
    case "number":
    case "rating":
    case "opinion_scale":
    case "nps":
    case "slider":
      return "number";
    case "date":
    case "datetime":
      return "date";
    case "yes_no":
    case "consent":
      return "boolean";
    case "multiple_choice":
    case "dropdown":
      return "choice";
    case "picture_choice":
      return isMultiChoiceType(field.type, field) ? "multi" : "choice";
    case "checkboxes":
    case "multiselect":
    case "ranking":
      return "multi";
    case "file_upload":
    case "image_upload":
    case "signature":
      return "file";
    case "matrix":
      return "object";
    case "country":
      return "choice";
    default:
      return "text";
  }
}

function answerWidth(column: AnswerColumn): number {
  switch (column.field.type) {
    case "long_text":
    case "address":
      return 280;
    case "matrix":
      return 240;
    case "rating":
    case "opinion_scale":
    case "nps":
    case "slider":
    case "number":
    case "yes_no":
    case "color":
      return 130;
    case "file_upload":
    case "image_upload":
    case "signature":
      return 200;
    default:
      return 200;
  }
}

/** The meta columns, in their default order. */
export const META_COLUMNS: DataColumn[] = [
  {
    key: "$submittedAt",
    label: "Submitted at",
    group: "meta",
    valueType: "date",
    cleanable: false,
    width: 170,
  },
  {
    key: "$duration",
    label: "Duration",
    group: "meta",
    valueType: "number",
    cleanable: false,
    width: 110,
  },
  {
    key: "$score",
    label: "Score",
    group: "meta",
    valueType: "number",
    cleanable: false,
    width: 90,
  },
  {
    key: "$ending",
    label: "Ending",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 150,
  },
  {
    key: "$country",
    label: "Country",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 170,
  },
  { key: "$city", label: "City", group: "meta", valueType: "text", cleanable: false, width: 140 },
  { key: "$ip", label: "IP", group: "meta", valueType: "text", cleanable: false, width: 140 },
  {
    key: "$device",
    label: "Device",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 110,
  },
  {
    key: "$browser",
    label: "Browser",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 120,
  },
  { key: "$os", label: "OS", group: "meta", valueType: "choice", cleanable: false, width: 110 },
  {
    key: "$language",
    label: "Language",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 110,
  },
  {
    key: "$referrer",
    label: "Referrer",
    group: "meta",
    valueType: "text",
    cleanable: false,
    width: 180,
  },
  {
    key: "$utmSource",
    label: "UTM source",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 130,
  },
  {
    key: "$utmMedium",
    label: "UTM medium",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 130,
  },
  {
    key: "$utmCampaign",
    label: "UTM campaign",
    group: "meta",
    valueType: "choice",
    cleanable: false,
    width: 140,
  },
  { key: "$tags", label: "Tags", group: "meta", valueType: "multi", cleanable: false, width: 160 },
  {
    key: "$starred",
    label: "Starred",
    group: "meta",
    valueType: "boolean",
    cleanable: false,
    width: 90,
  },
  {
    key: "$flagged",
    label: "Flagged",
    group: "meta",
    valueType: "boolean",
    cleanable: false,
    width: 90,
  },
  {
    key: "$reviewed",
    label: "Reviewed",
    group: "meta",
    valueType: "boolean",
    cleanable: false,
    width: 100,
  },
  { key: "$spam", label: "Spam", group: "meta", valueType: "boolean", cleanable: false, width: 80 },
];

export function isMetaKey(key: string) {
  return key.startsWith("$");
}

/** The answer columns of a form, with matrix rows kept whole (one column per matrix). */
export function formAnswerDataColumns(document: Pick<FormDocument, "fields">): DataColumn[] {
  return answerColumns(document).map((column) => {
    const valueType = answerValueType(column);
    const field = column.field;
    let options: DataColumn["options"];
    if (column.part?.kind !== "other" && field.options?.length) {
      options = field.options.map((option) => ({ id: option.id, label: option.label }));
      if (field.allowOther)
        options.push({ id: OTHER_OPTION_ID, label: optionLabel(field, OTHER_OPTION_ID) });
    }
    return {
      key: column.key,
      label: column.label,
      group: "answer" as const,
      valueType,
      field,
      answer: column,
      options,
      cleanable: column.part?.kind === "other" || TEXT_TYPES.has(field.type),
      width: answerWidth(column),
    };
  });
}

export function extraDataColumn(
  key: string,
  label: string,
  valueType: ColumnValueType = "text",
): DataColumn {
  return { key, label, group: "extra", valueType, cleanable: valueType === "text", width: 180 };
}

// ---------------------------------------------------------------------------
// Cell access
// ---------------------------------------------------------------------------

/** The raw value of an answer column in a row (the Other text for Other columns). */
export function answerValue(column: DataColumn, answers: FormAnswers): FormAnswerValue | undefined {
  if (!column.answer) return undefined;
  if (column.answer.part?.kind === "other") return answers[column.key];
  return answers[column.answer.fieldId];
}

export function metaValue(key: string, record: FormResponseRecord): ExprValue | string[] {
  const meta = record.meta;
  switch (key) {
    case "$submittedAt":
      return record.createdAt;
    case "$duration":
      return meta.durationMs === null ? null : Math.round(meta.durationMs / 100) / 10;
    case "$score":
      return record.score;
    case "$ending":
      return record.endingId;
    case "$country":
      return meta.country;
    case "$city":
      return meta.city;
    case "$ip":
      return meta.ip;
    case "$device":
      return meta.device;
    case "$browser":
      return meta.browser;
    case "$os":
      return meta.os;
    case "$language":
      return meta.language;
    case "$referrer":
      return meta.referer;
    case "$utmSource":
      return meta.utm?.source ?? null;
    case "$utmMedium":
      return meta.utm?.medium ?? null;
    case "$utmCampaign":
      return meta.utm?.campaign ?? null;
    case "$tags":
      return record.admin.tags;
    case "$starred":
      return record.admin.starred;
    case "$flagged":
      return record.admin.flagged;
    case "$reviewed":
      return record.admin.reviewed;
    case "$spam":
      return record.spam;
    default:
      return null;
  }
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const dateTimeFormat =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return dateTimeFormat ? dateTimeFormat.format(time) : iso;
}

export type TextOptions = {
  /** Option ids instead of labels. */
  raw?: boolean;
  /** Dates as ISO strings instead of the admin's locale format. */
  isoDates?: boolean;
  endingTitles?: Map<string, string>;
};

function rawAnswerText(column: DataColumn, answers: FormAnswers): string {
  const value = answerValue(column, answers);
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    if (isFileAnswer(value)) return value.map((file) => file.key).join(", ");
    return value.map(String).join(", ");
  }
  if (typeof value === "object") {
    if (column.answer?.part?.kind === "row") {
      const cell = (value as Record<string, string | string[]>)[column.answer.part.rowId];
      return Array.isArray(cell) ? cell.join(", ") : (cell ?? "");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** A cell as display text (labels, joined parts, file names). */
export function cellText(column: DataColumn, row: WorkingRow, options: TextOptions = {}): string {
  if (column.group === "extra") {
    const value = row.extra[column.key];
    if (value === null || value === undefined) return "";
    if (typeof value === "number")
      return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
    return String(value);
  }
  if (column.group === "meta") {
    const value = metaValue(column.key, row.record);
    if (value === null || value === undefined) return "";
    if (column.key === "$submittedAt")
      return options.isoDates ? String(value) : formatDateTime(String(value));
    if (column.key === "$duration")
      return options.isoDates ? String(value) : formatDuration(value as number);
    if (column.key === "$country")
      return options.raw ? String(value) : `${value} ${countryName(String(value))}`.trim();
    if (column.key === "$ending") {
      const title = options.endingTitles?.get(String(value));
      return options.raw || !title ? String(value) : title;
    }
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }
  if (!column.answer) return "";
  if (options.raw) return rawAnswerText(column, row.answers);
  if (column.field?.type === "country" && column.answer.part === undefined) {
    const code = row.answers[column.key];
    return typeof code === "string" && code ? `${code} ${countryName(code)}` : "";
  }
  if (column.answer.part?.kind === "row") return columnText(column.answer, row.answers);
  if (column.answer.part?.kind === "other") return columnText(column.answer, row.answers);
  return answerToText(column.answer.field, row.answers[column.answer.fieldId]);
}

/** A comparable key: numbers for numbers, dates and booleans; lowercase text otherwise. */
export function sortKey(column: DataColumn, row: WorkingRow): number | string | null {
  if (column.group === "extra") {
    const value = row.extra[column.key];
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  }
  if (column.group === "meta") {
    const value = metaValue(column.key, row.record);
    if (value === null || value === undefined) return null;
    if (column.key === "$submittedAt") return Date.parse(String(value));
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (Array.isArray(value)) return value.length ? value.join(", ") : null;
    return String(value);
  }
  const value = answerValue(column, row.answers);
  if (value === undefined || value === null || value === "") return null;
  switch (column.valueType) {
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "date": {
      const time = Date.parse(String(value));
      return Number.isNaN(time) ? String(value) : time;
    }
    case "boolean":
      return value === true ? 1 : 0;
    case "file":
      return isFileAnswer(value) ? value.length : null;
    default: {
      const text = cellText(column, row);
      return text || null;
    }
  }
}

/** The ids a choice/multi cell holds (option ids, tag names, meta values). */
export function cellIds(column: DataColumn, row: WorkingRow): string[] {
  if (column.group === "meta") {
    const value = metaValue(column.key, row.record);
    if (value === null || value === undefined || value === "") return [];
    return Array.isArray(value) ? value : [String(value)];
  }
  if (column.group === "extra") {
    const value = row.extra[column.key];
    return value === null || value === undefined || value === "" ? [] : [String(value)];
  }
  const value = answerValue(column, row.answers);
  if (value === undefined || value === null) return [];
  if (column.answer?.part?.kind === "row" && typeof value === "object" && !Array.isArray(value)) {
    const cell = (value as Record<string, string | string[]>)[column.answer.part.rowId];
    return cell === undefined ? [] : Array.isArray(cell) ? cell : [cell];
  }
  if (Array.isArray(value)) return isFileAnswer(value) ? [] : value.map(String);
  return [String(value)];
}

export function cellFiles(column: DataColumn, row: WorkingRow): FormFileAnswer[] {
  if (column.valueType !== "file") return [];
  const value = answerValue(column, row.answers);
  return isFileAnswer(value) ? value : [];
}

/** Whether a cell holds an answer. */
export function cellIsEmpty(column: DataColumn, row: WorkingRow): boolean {
  const key = sortKey(column, row);
  if (key === null) return true;
  if (column.valueType === "file") return key === 0;
  return false;
}

/**
 * The value a formula sees for `{column}`: numbers for numeric columns,
 * booleans for yes/no, ISO strings for dates, text otherwise.
 */
export function exprValue(column: DataColumn, row: WorkingRow): ExprValue {
  if (column.group === "extra") return row.extra[column.key] ?? null;
  if (column.group === "meta") {
    const value = metaValue(column.key, row.record);
    if (Array.isArray(value)) return value.join(", ");
    return value ?? null;
  }
  const value = answerValue(column, row.answers);
  if (value === undefined || value === null) return null;
  if (column.valueType === "number") return typeof value === "number" ? value : null;
  if (column.valueType === "boolean") return value === true;
  if (column.valueType === "date") return String(value);
  if (column.valueType === "file") return isFileAnswer(value) ? value.length : 0;
  return cellText(column, row) || null;
}

/** Find a column by label (case-insensitive), field id or key. */
export function columnResolver(columns: readonly DataColumn[]) {
  const byName = new Map<string, DataColumn>();
  for (const column of columns) {
    byName.set(column.key.toLowerCase(), column);
    if (column.field && !column.answer?.part) byName.set(column.field.id.toLowerCase(), column);
  }
  // Labels win over ids only when they don't collide with one.
  for (const column of columns) {
    const label = column.label.trim().toLowerCase();
    if (!byName.has(label)) byName.set(label, column);
    const bare = label.replace(/^\$/, "");
    if (!byName.has(bare)) byName.set(bare, column);
  }
  return (name: string) => byName.get(name.trim().toLowerCase()) ?? null;
}
