/**
 * The non-destructive cleaning pipeline: an ordered list of steps the admin
 * builds in the Clean data panel, replayed in the browser over the loaded
 * responses before the table, the charts and the exports see them. Nothing
 * here writes to the API; "Apply permanently" sends `answerChanges` later.
 *
 * Text steps rewrite the string parts of cleanable cells only (text-like
 * answers, Other texts, name and address parts, split columns), never
 * option ids, numbers, files or metadata. Answers are copied on write, so an
 * untouched row keeps the record's own `answers` object.
 */

import {
  isAnswered,
  visibleQuestions,
  type FormAnswerValue,
  type FormAnswers,
  type FormDocument,
  type FormResponseRecord,
} from "@repo/shared";

import {
  cellText,
  columnResolver,
  exprValue,
  extraDataColumn,
  type DataColumn,
  type WorkingRow,
} from "./columns";
import { compileExpr, evaluate, type ExprValue } from "./expr";
import { compileUserPattern, replaceWithUserPattern } from "./user-pattern";

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** `all` targets every cleanable column. */
export type ColumnScope = "all" | string[];

export type CaseMode = "lower" | "upper" | "title" | "sentence";

export type CleanStep = { id: string; enabled: boolean } & (
  | { kind: "trim"; columns: ColumnScope }
  | { kind: "collapse"; columns: ColumnScope }
  | { kind: "case"; columns: ColumnScope; mode: CaseMode }
  | {
      kind: "replace";
      columns: ColumnScope;
      find: string;
      replace: string;
      regex: boolean;
      caseSensitive: boolean;
      wholeCell: boolean;
    }
  | { kind: "fill"; columns: ColumnScope; value: string }
  | { kind: "standardize"; column: string; mappings: { from: string[]; to: string }[] }
  | { kind: "dedupe"; columns: string[]; keep: "first" | "last" }
  | { kind: "exclude"; what: "spam" | "flagged" | "incomplete" | "condition"; formula?: string }
  | { kind: "split"; column: string; delimiter: string; maxParts: number }
  | { kind: "compute"; name: string; formula: string }
);

export type CleanStepKind = CleanStep["kind"];

export const STEP_LABELS: Record<CleanStepKind, string> = {
  trim: "Trim whitespace",
  collapse: "Collapse spaces",
  case: "Change case",
  replace: "Find and replace",
  fill: "Fill empty cells",
  standardize: "Standardize values",
  dedupe: "Remove duplicates",
  exclude: "Exclude rows",
  split: "Split a column",
  compute: "Computed column",
};

/** A step id: the time it was added plus a random word, e.g. `smg1k2x3a9f2kq`. */
function stepId() {
  const [word] = crypto.getRandomValues(new Uint32Array(1));
  return `s${Date.now().toString(36)}${word.toString(36)}`;
}

export function newStep(kind: CleanStepKind, id = stepId()): CleanStep {
  const base = { id, enabled: true };
  switch (kind) {
    case "trim":
      return { ...base, kind, columns: "all" };
    case "collapse":
      return { ...base, kind, columns: "all" };
    case "case":
      return { ...base, kind, columns: [], mode: "title" };
    case "replace":
      return {
        ...base,
        kind,
        columns: "all",
        find: "",
        replace: "",
        regex: false,
        caseSensitive: false,
        wholeCell: false,
      };
    case "fill":
      return { ...base, kind, columns: [], value: "" };
    case "standardize":
      return { ...base, kind, column: "", mappings: [] };
    case "dedupe":
      return { ...base, kind, columns: [], keep: "first" };
    case "exclude":
      return { ...base, kind, what: "spam" };
    case "split":
      return { ...base, kind, column: "", delimiter: ",", maxParts: 3 };
    case "compute":
      return { ...base, kind, name: "Computed", formula: "" };
  }
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

export function toTitleCase(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(
      /(^|[\s\-/(["'])(\p{L})/gu,
      (_, lead: string, letter: string) => lead + letter.toLocaleUpperCase(),
    );
}

export function toSentenceCase(text: string) {
  const lower = text.toLocaleLowerCase();
  return lower.replace(
    /(^\s*|[.!?]\s+)(\p{L})/gu,
    (_, lead: string, letter: string) => lead + letter.toLocaleUpperCase(),
  );
}

/** Plain-text find & replace, without building a regular expression. */
function plainReplacer(find: string, replace: string, caseSensitive: boolean, wholeCell: boolean) {
  const needle = caseSensitive ? find : find.toLocaleLowerCase();
  return (text: string) => {
    const haystack = caseSensitive ? text : text.toLocaleLowerCase();
    if (wholeCell) return haystack === needle ? replace : text;
    if (!haystack.includes(needle)) return text;
    let out = "";
    let from = 0;
    for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, from)) {
      out += text.slice(from, at) + replace;
      from = at + needle.length;
    }
    return out + text.slice(from);
  };
}

/** Compiles a find & replace step into a string function, or an error message. */
export function replacer(
  step: Extract<CleanStep, { kind: "replace" }>,
): ((text: string) => string) | string {
  if (!step.find) return (text) => text;
  if (!step.regex)
    return plainReplacer(step.find, step.replace, step.caseSensitive, step.wholeCell);
  const compiled = compileUserPattern(step.find, {
    caseSensitive: step.caseSensitive,
    wholeCell: step.wholeCell,
  });
  if (typeof compiled === "string") return compiled;
  return (text) => replaceWithUserPattern(compiled, text, step.replace);
}

/** Lowercased, accent-free, punctuation-free, single-spaced: the key variants share. */
export function normalizeKey(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function levenshtein(a: string, b: string, limit = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

export type StandardizeSuggestion = { to: string; from: string[]; count: number };

/**
 * Groups a column's distinct values that are probably the same thing:
 * identical once normalized, or one or two typos apart (for longer words).
 * The most frequent spelling is suggested as the target.
 */
export function suggestStandardize(
  values: readonly string[],
  maxGroups = 30,
): StandardizeSuggestion[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const text = value.trim();
    if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const distinct = [...counts.keys()];
  if (distinct.length > 4000) distinct.length = 4000;
  const byKey = new Map<string, string[]>();
  for (const value of distinct) {
    const key = normalizeKey(value);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(value);
    byKey.set(key, list);
  }
  // Merge keys a typo or two apart (union-find over the normalized keys).
  const keys = [...byKey.keys()];
  const parent = new Map(keys.map((key) => [key, key]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(key, root);
    return root;
  };
  if (keys.length <= 1500) {
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = keys[i];
        const b = keys[j];
        const shortest = Math.min(a.length, b.length);
        if (shortest < 4) continue;
        const limit = shortest >= 9 ? 2 : 1;
        if (levenshtein(a, b, limit) <= limit) parent.set(find(a), find(b));
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const root = find(key);
    groups.set(root, [...(groups.get(root) ?? []), ...(byKey.get(key) ?? [])]);
  }
  const suggestions: StandardizeSuggestion[] = [];
  for (const variants of groups.values()) {
    if (variants.length < 2) continue;
    const ordered = [...variants].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
    );
    const to = ordered[0];
    suggestions.push({
      to,
      from: ordered.slice(1),
      count: ordered.slice(1).reduce((total, value) => total + (counts.get(value) ?? 0), 0),
    });
  }
  return suggestions.sort((a, b) => b.count - a.count).slice(0, maxGroups);
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export type StepResult = {
  id: string;
  /** Cells rewritten (text steps), filled or computed. */
  changedCells: number;
  /** Rows removed (dedupe and exclude). */
  removedRows: number;
  /** New virtual columns (split, compute). */
  addedColumns: number;
  error?: string;
};

export type PipelineResult = {
  rows: WorkingRow[];
  /** Virtual columns in the order the steps created them. */
  extraColumns: DataColumn[];
  steps: StepResult[];
  /** How many responses went in. */
  inputCount: number;
};

/** Rewrites every string inside an answer value (name/address parts included). */
function mapStrings(value: FormAnswerValue, fn: (text: string) => string): FormAnswerValue {
  if (typeof value === "string") return fn(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    let changed = false;
    const out: Record<string, string | string[]> = {};
    for (const [key, part] of Object.entries(value)) {
      if (typeof part === "string") {
        const next = fn(part);
        if (next !== part) changed = true;
        out[key] = next;
      } else out[key] = part;
    }
    return changed ? out : value;
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown) {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

type Context = {
  columns: DataColumn[];
  byKey: Map<string, DataColumn>;
  document: FormDocument;
};

function scopeColumns(scope: ColumnScope, context: Context): DataColumn[] {
  const list =
    scope === "all" ? context.columns : scope.map((key) => context.byKey.get(key)).filter(Boolean);
  return (list as DataColumn[]).filter((column) => column.cleanable);
}

/** Applies a string function to one cleanable column of a row; true when it changed. */
function rewriteCell(row: WorkingRow, column: DataColumn, fn: (text: string) => string): boolean {
  if (column.group === "extra") {
    const value = row.extra[column.key];
    if (typeof value !== "string") return false;
    const next = fn(value);
    if (next === value) return false;
    row.extra = { ...row.extra, [column.key]: next };
    return true;
  }
  if (column.group !== "answer" || !column.answer) return false;
  const key = column.answer.part?.kind === "other" ? column.key : column.answer.fieldId;
  const value = row.answers[key];
  if (value === undefined || value === null) return false;
  const next = mapStrings(value, fn);
  if (next === value || valuesEqual(next, value)) return false;
  if (row.answers === row.record.answers) row.answers = { ...row.answers };
  row.answers[key] = next;
  return true;
}

function isIncomplete(document: FormDocument, answers: FormAnswers) {
  try {
    return visibleQuestions(document, answers).some(
      (field) => field.required && !isAnswered(answers[field.id]),
    );
  } catch {
    return false;
  }
}

export function runPipeline(
  document: FormDocument,
  responses: readonly FormResponseRecord[],
  baseColumns: readonly DataColumn[],
  steps: readonly CleanStep[],
): PipelineResult {
  let rows: WorkingRow[] = responses.map((record, index) => ({
    id: record.id,
    index,
    record,
    answers: record.answers,
    extra: {},
  }));
  const extraColumns: DataColumn[] = [];
  const context: Context = {
    columns: [...baseColumns],
    byKey: new Map(baseColumns.map((column) => [column.key, column])),
    document,
  };
  const results: StepResult[] = [];

  for (const step of steps) {
    const result: StepResult = { id: step.id, changedCells: 0, removedRows: 0, addedColumns: 0 };
    results.push(result);
    if (!step.enabled) continue;
    const textStep = (fn: (text: string) => string, scope: ColumnScope) => {
      const targets = scopeColumns(scope, context);
      for (const row of rows) {
        for (const column of targets) if (rewriteCell(row, column, fn)) result.changedCells += 1;
      }
    };
    switch (step.kind) {
      case "trim":
        textStep((text) => text.trim(), step.columns);
        break;
      case "collapse":
        textStep(
          (text) => text.replace(/[^\S\n]{2,}/g, " ").replace(/\n{3,}/g, "\n\n"),
          step.columns,
        );
        break;
      case "case": {
        const fn =
          step.mode === "lower"
            ? (text: string) => text.toLocaleLowerCase()
            : step.mode === "upper"
              ? (text: string) => text.toLocaleUpperCase()
              : step.mode === "title"
                ? toTitleCase
                : toSentenceCase;
        textStep(fn, step.columns);
        break;
      }
      case "replace": {
        const fn = replacer(step);
        if (typeof fn === "string") result.error = fn;
        else if (step.find) textStep(fn, step.columns);
        break;
      }
      case "fill": {
        if (!step.value) break;
        const targets =
          step.columns === "all"
            ? context.columns.filter((column) => column.cleanable)
            : step.columns
                .map((key) => context.byKey.get(key))
                .filter((column): column is DataColumn => Boolean(column));
        for (const row of rows) {
          for (const column of targets) {
            if (column.group === "extra") {
              const value = row.extra[column.key];
              if (value === null || value === undefined || value === "") {
                row.extra = { ...row.extra, [column.key]: step.value };
                result.changedCells += 1;
              }
              continue;
            }
            if (!column.answer || column.answer.part?.kind === "row") continue;
            const key = column.answer.part?.kind === "other" ? column.key : column.answer.fieldId;
            if (isAnswered(row.answers[key])) continue;
            let next: FormAnswerValue | null = null;
            if (column.valueType === "number") {
              const number = Number(step.value);
              if (Number.isFinite(number)) next = number;
            } else if (column.cleanable || column.valueType === "date") {
              if (column.field?.type === "name" || column.field?.type === "address") continue;
              next = step.value;
            }
            if (next === null) continue;
            if (row.answers === row.record.answers) row.answers = { ...row.answers };
            row.answers[key] = next;
            result.changedCells += 1;
          }
        }
        break;
      }
      case "standardize": {
        const column = context.byKey.get(step.column);
        if (!column || !step.mappings.length) break;
        const map = new Map<string, string>();
        for (const mapping of step.mappings) {
          for (const from of mapping.from)
            if (from !== mapping.to) map.set(from.trim(), mapping.to);
        }
        const fn = (text: string) => map.get(text.trim()) ?? text;
        for (const row of rows) if (rewriteCell(row, column, fn)) result.changedCells += 1;
        break;
      }
      case "dedupe": {
        const columns = step.columns
          .map((key) => context.byKey.get(key))
          .filter((column): column is DataColumn => Boolean(column));
        if (!columns.length) break;
        const seen = new Set<string>();
        const ordered = step.keep === "last" ? [...rows].reverse() : rows;
        const kept: WorkingRow[] = [];
        for (const row of ordered) {
          const key = columns
            .map((column) => normalizeKey(cellText(column, row, { raw: true })))
            .join("\u0001");
          if (seen.has(key)) {
            result.removedRows += 1;
            continue;
          }
          seen.add(key);
          kept.push(row);
        }
        rows = step.keep === "last" ? kept.reverse() : kept;
        break;
      }
      case "exclude": {
        let test: ((row: WorkingRow) => boolean) | null = null;
        if (step.what === "spam") test = (row) => row.record.spam;
        else if (step.what === "flagged") test = (row) => row.record.admin.flagged;
        else if (step.what === "incomplete") test = (row) => isIncomplete(document, row.answers);
        else {
          const resolve = columnResolver(context.columns);
          const compiled = compileExpr(step.formula ?? "", (name) => resolve(name) !== null);
          if (!compiled.ok) {
            result.error = compiled.error.message;
            break;
          }
          test = (row) => {
            const value = evaluate(compiled.expr.ast, (name) => {
              const column = resolve(name);
              return column ? exprValue(column, row) : null;
            });
            return (
              value === true ||
              (typeof value === "number" && value !== 0) ||
              (typeof value === "string" && value !== "")
            );
          };
        }
        const before = rows.length;
        rows = rows.filter((row) => !test(row));
        result.removedRows = before - rows.length;
        break;
      }
      case "split": {
        const column = context.byKey.get(step.column);
        if (!column || !step.delimiter) break;
        const maxParts = Math.max(2, Math.min(10, Math.trunc(step.maxParts) || 2));
        let partsSeen = 0;
        const split = rows.map((row) => {
          const parts = cellText(column, row)
            .split(step.delimiter)
            .map((part) => part.trim());
          if (parts.length > 1 || parts[0])
            partsSeen = Math.max(partsSeen, Math.min(maxParts, parts.length));
          if (parts.length > maxParts)
            parts.splice(
              maxParts - 1,
              parts.length,
              parts.slice(maxParts - 1).join(step.delimiter),
            );
          return parts;
        });
        const count = Math.max(2, partsSeen);
        const added: DataColumn[] = [];
        for (let part = 0; part < count; part += 1) {
          const extra = extraDataColumn(`${step.id}:${part + 1}`, `${column.label} (${part + 1})`);
          added.push(extra);
        }
        rows.forEach((row, index) => {
          const parts = split[index];
          const next = { ...row.extra };
          added.forEach((extra, part) => {
            const value = parts[part] ?? "";
            next[extra.key] = value || null;
            if (value) result.changedCells += 1;
          });
          row.extra = next;
        });
        for (const extra of added) {
          extraColumns.push(extra);
          context.columns.push(extra);
          context.byKey.set(extra.key, extra);
        }
        result.addedColumns = added.length;
        break;
      }
      case "compute": {
        const resolve = columnResolver(context.columns);
        const compiled = compileExpr(step.formula, (name) => resolve(name) !== null);
        const name = step.name.trim() || "Computed";
        if (!compiled.ok) {
          result.error = compiled.error.message;
          break;
        }
        const values: ExprValue[] = rows.map((row) =>
          evaluate(compiled.expr.ast, (ref) => {
            const column = resolve(ref);
            return column ? exprValue(column, row) : null;
          }),
        );
        const numeric = values.every((value) => value === null || typeof value === "number");
        const boolean = values.every((value) => value === null || typeof value === "boolean");
        const extra = extraDataColumn(
          `${step.id}:value`,
          name,
          numeric && values.some((value) => value !== null)
            ? "number"
            : boolean && values.some((value) => value !== null)
              ? "boolean"
              : "text",
        );
        rows.forEach((row, index) => {
          const value = values[index];
          row.extra = { ...row.extra, [extra.key]: value };
          if (value !== null && value !== "") result.changedCells += 1;
        });
        extraColumns.push(extra);
        context.columns.push(extra);
        context.byKey.set(extra.key, extra);
        result.addedColumns = 1;
        break;
      }
    }
  }
  return { rows, extraColumns, steps: results, inputCount: responses.length };
}

/**
 * The answer cells the pipeline changed, per response, as full answer
 * objects ready for `formsAdminApi.apply` (virtual columns never go).
 */
export function answerChanges(
  result: PipelineResult,
): { id: string; answers: FormAnswers; cells: number }[] {
  const out: { id: string; answers: FormAnswers; cells: number }[] = [];
  for (const row of result.rows) {
    if (row.answers === row.record.answers) continue;
    let cells = 0;
    const keys = new Set([...Object.keys(row.answers), ...Object.keys(row.record.answers)]);
    for (const key of keys) if (!valuesEqual(row.answers[key], row.record.answers[key])) cells += 1;
    if (cells) out.push({ id: row.id, answers: row.answers, cells });
  }
  return out;
}

export function describeStep(step: CleanStep, columnLabel: (key: string) => string): string {
  const scope = (columns: ColumnScope) =>
    columns === "all"
      ? "all text columns"
      : columns.length
        ? columns.map(columnLabel).join(", ")
        : "no columns yet";
  switch (step.kind) {
    case "trim":
    case "collapse":
      return scope(step.columns);
    case "case":
      return `${step.mode} case · ${scope(step.columns)}`;
    case "replace":
      return step.find
        ? `"${step.find}" → "${step.replace}" · ${scope(step.columns)}`
        : "Nothing to find yet";
    case "fill":
      return step.value ? `"${step.value}" · ${scope(step.columns)}` : "No fill value yet";
    case "standardize":
      return step.column
        ? `${columnLabel(step.column)} · ${step.mappings.length} mapping${step.mappings.length === 1 ? "" : "s"}`
        : "Pick a column";
    case "dedupe":
      return step.columns.length
        ? `by ${step.columns.map(columnLabel).join(", ")} · keep ${step.keep}`
        : "Pick the columns that identify a duplicate";
    case "exclude":
      return step.what === "condition" ? step.formula || "Write a condition" : step.what;
    case "split":
      return step.column ? `${columnLabel(step.column)} by "${step.delimiter}"` : "Pick a column";
    case "compute":
      return step.formula ? `${step.name} = ${step.formula}` : "Write a formula";
  }
}
