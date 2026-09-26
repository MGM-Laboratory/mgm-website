/**
 * Exports of the responses: CSV (UTF-8 with a BOM, RFC 4180 quoting), TSV,
 * JSON (raw records or flat rows), Markdown and .xlsx. They all start from
 * the same `ExportTable` (the chosen columns and rows, as labels or raw ids).
 */

import { isFileAnswer } from "@repo/shared";

import { cellText, metaValue, sortKey, type DataColumn, type WorkingRow } from "./columns";
import { buildXlsx, type XlsxCell } from "./xlsx";

export type ExportOptions = {
  /** Option ids, keys and ISO dates instead of labels and local dates. */
  raw: boolean;
  endingTitles?: Map<string, string>;
};

export type ExportTable = {
  header: string[];
  columns: DataColumn[];
  rows: WorkingRow[];
  options: ExportOptions;
};

export function exportTable(
  rows: WorkingRow[],
  columns: DataColumn[],
  options: ExportOptions,
): ExportTable {
  return {
    header: ["Response ID", ...columns.map((column) => column.label)],
    columns,
    rows,
    options,
  };
}

function textCell(column: DataColumn, row: WorkingRow, options: ExportOptions) {
  if (column.key === "$submittedAt") return row.record.createdAt;
  if (column.key === "$duration") {
    const value = metaValue("$duration", row.record);
    return value === null ? "" : String(value);
  }
  return cellText(column, row, {
    raw: options.raw,
    isoDates: true,
    endingTitles: options.endingTitles,
  });
}

/** RFC 4180: quote when the field holds the separator, a quote or a line break. */
export function quoteField(value: string, separator: string) {
  if (
    value.includes(separator) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Spreadsheet apps run cells starting with = + - @ as formulas; a leading quote defuses them. */
function defuse(value: string) {
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  // A plain signed number stays readable; anything else after + or - could
  // be arithmetic a spreadsheet evaluates (even "+1-1"), so it's quoted too.
  if (/^[+-]?[\d.]+$/.test(value) && Number.isFinite(Number(value))) return value;
  return `'${value}`;
}

export function toDelimited(table: ExportTable, separator: "," | "\t"): string {
  const lines: string[] = [];
  const clean = (value: string) => (separator === "\t" ? value.replace(/\t/g, " ") : value);
  // Headers come from question labels, which an admin (or an import) writes.
  lines.push(
    table.header.map((title) => quoteField(clean(defuse(title)), separator)).join(separator),
  );
  for (const row of table.rows) {
    const cells = [
      row.id,
      ...table.columns.map((column) => defuse(textCell(column, row, table.options))),
    ];
    lines.push(cells.map((value) => quoteField(clean(value), separator)).join(separator));
  }
  return lines.join("\r\n") + "\r\n";
}

export function toCsvBytes(table: ExportTable): Uint8Array {
  const body = new TextEncoder().encode(toDelimited(table, ","));
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

// Markdown tables have no line breaks of their own; an inline HTML break stands in.
const LINE_BREAK_HTML = "<br>";

export function toMarkdown(table: ExportTable): string {
  const escape = (value: string) =>
    value.replace(/\|/g, "\\|").replace(/\r?\n/g, () => LINE_BREAK_HTML);
  const lines = [
    `| ${table.header.map(escape).join(" | ")} |`,
    `| ${table.header.map(() => "---").join(" | ")} |`,
  ];
  for (const row of table.rows) {
    lines.push(
      `| ${[row.id, ...table.columns.map((column) => textCell(column, row, table.options))].map(escape).join(" | ")} |`,
    );
  }
  return lines.join("\n") + "\n";
}

/** Flat rows keyed by column label (duplicated labels get their key appended). */
export function toFlatJson(table: ExportTable): string {
  const names = new Set<string>(["id"]);
  const named = table.columns.map((column) => {
    let name = column.label;
    if (names.has(name)) name = `${column.label} [${column.key}]`;
    names.add(name);
    return { column, name };
  });
  const out = table.rows.map((row): Record<string, unknown> =>
    Object.fromEntries([
      ["id", row.id],
      ...named.map(({ column, name }) => [name, typedValue(column, row, table.options)]),
    ]),
  );
  return JSON.stringify(out, null, 2);
}

/** The records as the API sends them, with cleaned answers and the virtual columns. */
export function toRawJson(table: ExportTable): string {
  return JSON.stringify(
    table.rows.map((row) => ({
      ...row.record,
      answers: row.answers,
      ...(Object.keys(row.extra).length ? { computed: row.extra } : {}),
    })),
    null,
    2,
  );
}

/** A cell as a typed value (numbers stay numbers, dates become Date objects for .xlsx). */
function typedValue(
  column: DataColumn,
  row: WorkingRow,
  options: ExportOptions,
  dates = false,
): XlsxCell | string[] {
  if (column.key === "$submittedAt")
    return dates ? new Date(row.record.createdAt) : row.record.createdAt;
  const key = sortKey(column, row);
  if (key === null) return null;
  if (column.valueType === "number" && typeof key === "number") return key;
  if (column.valueType === "boolean") {
    if (column.group === "extra") return row.extra[column.key] as boolean;
    return key === 1;
  }
  if (column.group === "extra" && typeof row.extra[column.key] === "number")
    return row.extra[column.key] as number;
  if (column.valueType === "date" && column.group === "answer" && dates) {
    const raw = row.answers[column.answer?.fieldId ?? ""];
    const match =
      typeof raw === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:$|T(\d{2}):(\d{2})$)/.exec(raw) : null;
    if (match) {
      const [, year, month, day, hours = "0", minutes = "0"] = match;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
    }
  }
  if (column.valueType === "file") {
    const value = row.answers[column.answer?.fieldId ?? ""];
    if (isFileAnswer(value))
      return value.map((file) => (options.raw ? file.key : file.name)).join(", ");
  }
  return textCell(column, row, options);
}

export function toXlsxBytes(table: ExportTable, sheetName: string): Uint8Array {
  const rows = table.rows.map((row) => [
    row.id,
    ...table.columns.map((column) => {
      const value = typedValue(column, row, table.options, true);
      return Array.isArray(value) ? value.join(", ") : value;
    }),
  ]);
  const widths = [
    26,
    ...table.columns.map((column) => Math.min(60, Math.max(10, Math.round(column.width / 7)))),
  ];
  return buildXlsx({ name: sheetName, header: table.header, rows, widths }, sheetName);
}

/** A file name from the form title and today's date. */
export function exportFileName(title: string, extension: string) {
  const stem =
    title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "responses";
  const date = new Date();
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${stem}-${day}.${extension}`;
}

/** Hands bytes or text to the browser as a download. */
export function downloadBlob(parts: BlobPart[] | Blob, name: string, type: string) {
  const blob = parts instanceof Blob ? parts : new Blob(parts, { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}
