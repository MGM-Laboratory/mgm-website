import {
  OTHER_OPTION_ID,
  isFileAnswer,
  otherKey,
  type AddressPart,
  type FormAnswers,
  type FormAnswerValue,
} from "./answers.js";
import { isInputType, type FormDocument, type FormField } from "./schema.js";

/**
 * Human-readable answers: option ids become labels, parts are joined, files
 * are listed by name. Used by the public page (answer piping, the review
 * step), the admin tables and charts, emails, and every export.
 */

export function optionLabel(field: Pick<FormField, "options" | "otherLabel">, id: string) {
  if (id === OTHER_OPTION_ID) return field.otherLabel || "Other";
  return field.options?.find((option) => option.id === id)?.label ?? id;
}

export function answerToText(
  field: FormField,
  value: FormAnswerValue | null | undefined,
  answers?: FormAnswers,
): string {
  if (value === undefined || value === null) return "";
  const other = answers ? answers[otherKey(field.id)] : undefined;
  const withOther = (id: string) =>
    id === OTHER_OPTION_ID && typeof other === "string" && other.trim()
      ? `${optionLabel(field, id)}: ${other.trim()}`
      : optionLabel(field, id);

  switch (field.type) {
    case "multiple_choice":
    case "dropdown":
    case "picture_choice":
    case "checkboxes":
    case "multiselect":
    case "ranking": {
      const ids = Array.isArray(value) ? value.map(String) : [String(value)];
      return ids.map(withOther).join(field.type === "ranking" ? " > " : ", ");
    }
    case "yes_no":
      return value === true ? "Yes" : value === false ? "No" : String(value);
    case "consent":
      return value === true ? "Agreed" : "";
    case "matrix": {
      if (typeof value !== "object" || Array.isArray(value)) return String(value);
      return (field.rowsList ?? [])
        .map((row) => {
          const cell = (value as Partial<Record<string, string | string[]>>)[row.id];
          if (cell === undefined) return "";
          const columns = (Array.isArray(cell) ? cell : [cell]).map(
            (id) => field.columnsList?.find((column) => column.id === id)?.label ?? id,
          );
          return `${row.label}: ${columns.join(", ")}`;
        })
        .filter(Boolean)
        .join("; ");
    }
    case "name": {
      if (typeof value !== "object" || Array.isArray(value)) return String(value);
      const parts = value as Record<string, string>;
      return [parts.first, parts.last].filter(Boolean).join(" ");
    }
    case "address": {
      if (typeof value !== "object" || Array.isArray(value)) return String(value);
      const { line1, line2, city, region, postal, country } = value as Partial<
        Record<AddressPart, string>
      >;
      return [line1, line2, city, region, postal, country].filter(Boolean).join(", ");
    }
    case "file_upload":
    case "image_upload":
    case "signature":
      return isFileAnswer(value) ? value.map((file) => file.name).join(", ") : "";
    case "number":
    case "slider":
      return typeof value === "number"
        ? `${field.prefix ?? ""}${value}${field.suffix ?? ""}`
        : String(value);
    default:
      if (Array.isArray(value)) return value.map(String).join(", ");
      if (typeof value === "object") return Object.values(value).join(" ");
      return String(value);
  }
}

const PIPE_PATTERN = /\{\{\s*([A-Za-z0-9_-]{1,64})\s*\}\}/g;

// Marks where an unanswered pipe was, so the separator in front of it can go
// too ("Your email, {{name}}?" reads "Your email?" before a name is given).
// A private-use character: printable, and never typed into a form.
const EMPTY_PIPE = "\uE000";
const EMPTY_PIPE_WITH_SEPARATOR = /[ \t]*[,;:]?[ \t]*\uE000[ \t]*(?=[?!.,;:)]|$)/g;
const EMPTY_PIPE_ALONE = /[ \t]*\uE000/g;
const LEADING_SEPARATOR = /^[ \t]*[,;:][ \t]*/;

/**
 * Replaces `{{fieldId}}` with that field's answer. An unanswered one becomes
 * `fallback`, or, without a fallback, disappears along with a comma or colon
 * right before it.
 */
export function pipeText(
  text: string,
  fields: readonly FormField[],
  answers: FormAnswers,
  fallback = "",
): string {
  if (!text.includes("{{")) return text;
  const byId = new Map(fields.map((field) => [field.id, field]));
  const piped = text.replace(PIPE_PATTERN, (_match, id: string) => {
    const field = byId.get(id);
    const rendered = field ? answerToText(field, answers[field.id], answers) : "";
    return rendered || fallback || EMPTY_PIPE;
  });
  if (!piped.includes(EMPTY_PIPE)) return piped;
  return piped
    .replace(EMPTY_PIPE_WITH_SEPARATOR, "")
    .replace(EMPTY_PIPE_ALONE, "")
    .replace(LEADING_SEPARATOR, "")
    .trim();
}

/**
 * The columns of a response table or export, in form order: one per
 * question, plus one for each "Other" text box and each matrix row.
 */
export type AnswerColumn = {
  key: string;
  fieldId: string;
  label: string;
  field: FormField;
  /** `other` for the Other text, `row` for one matrix row. */
  part?: { kind: "other" } | { kind: "row"; rowId: string };
};

export function answerColumns(
  document: Pick<FormDocument, "fields">,
  options: { splitMatrix?: boolean } = {},
): AnswerColumn[] {
  const columns: AnswerColumn[] = [];
  for (const field of document.fields) {
    if (!isInputType(field.type)) continue;
    const label = field.label || field.prefillParam || field.id;
    if (field.type === "matrix" && options.splitMatrix && field.rowsList?.length) {
      for (const row of field.rowsList) {
        columns.push({
          key: `${field.id}.${row.id}`,
          fieldId: field.id,
          label: `${label}: ${row.label}`,
          field,
          part: { kind: "row", rowId: row.id },
        });
      }
    } else {
      columns.push({ key: field.id, fieldId: field.id, label, field });
    }
    if (field.allowOther) {
      columns.push({
        key: otherKey(field.id),
        fieldId: field.id,
        label: `${label} (${field.otherLabel || "Other"})`,
        field,
        part: { kind: "other" },
      });
    }
  }
  return columns;
}

/** One cell of `answerColumns` as text. */
export function columnText(column: AnswerColumn, answers: FormAnswers): string {
  if (column.part?.kind === "other") {
    const value = answers[column.key];
    return typeof value === "string" ? value : "";
  }
  const value = answers[column.fieldId];
  if (column.part?.kind === "row") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const cell = (value as Partial<Record<string, string | string[]>>)[column.part.rowId];
    if (cell === undefined) return "";
    return (Array.isArray(cell) ? cell : [cell])
      .map((id) => column.field.columnsList?.find((item) => item.id === id)?.label ?? id)
      .join(", ");
  }
  // In a table the Other text has its own column, so the choice column shows the plain label.
  return answerToText(column.field, value);
}
