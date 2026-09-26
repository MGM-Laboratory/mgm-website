"use client";

import { useMemo, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { toast } from "sonner";
import {
  Broom,
  CaretDown,
  CaretRight,
  DotsSixVertical,
  Plus,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import type { FormRecord } from "@repo/shared";

import { formsAdminApi } from "@/lib/forms/admin-api";
import { cellText, columnResolver, exprValue, type DataColumn } from "@/lib/forms/data/columns";
import { EXPR_FUNCTIONS, compileExpr, evaluate, toText } from "@/lib/forms/data/expr";
import {
  STEP_LABELS,
  answerChanges,
  describeStep,
  newStep,
  suggestStandardize,
  type CleanStep,
  type CleanStepKind,
  type ColumnScope,
  type PipelineResult,
} from "@/lib/forms/data/pipeline";
import { loadResponses, setPipeline } from "@/lib/forms/data/store";

import { ghostButton, inputClass, labelClass, primaryButton } from "./column-menus";

const APPLY_BATCH = 2000;

type Props = {
  form: FormRecord;
  steps: CleanStep[];
  result: PipelineResult;
  /** Answer and meta columns (before the pipeline's own). */
  baseColumns: DataColumn[];
  canWrite: boolean;
  onClose: () => void;
};

/**
 * The Clean data side panel: an ordered, non-destructive list of steps the
 * table, the charts and the exports all see. Nothing changes on the server
 * until "Apply permanently", which writes only the changed answer cells.
 */
export function CleanPanel({ form, steps, result, baseColumns, canWrite, onClose }: Props) {
  const [open, setOpen] = useState<string | null>(steps.at(-1)?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const changes = useMemo(() => answerChanges(result), [result]);
  const changedCells = changes.reduce((total, change) => total + change.cells, 0);
  const statsById = new Map(result.steps.map((step) => [step.id, step]));

  const update = (id: string, patch: Partial<CleanStep>) =>
    setPipeline(form.id, (current) =>
      current.map((step) => (step.id === id ? ({ ...step, ...patch } as CleanStep) : step)),
    );
  const remove = (id: string) =>
    setPipeline(form.id, (current) => current.filter((step) => step.id !== id));
  const add = (kind: CleanStepKind) => {
    const step = newStep(kind);
    setPipeline(form.id, (current) => [...current, step]);
    setOpen(step.id);
    setAdding(false);
  };

  // The columns each step can see: the base ones plus the virtual columns made before it.
  const columnsBefore = (stepId: string) => {
    const index = steps.findIndex((step) => step.id === stepId);
    const earlier = new Set(steps.slice(0, index).map((step) => step.id));
    return [
      ...baseColumns,
      ...result.extraColumns.filter((column) => earlier.has(column.key.split(":")[0])),
    ];
  };
  const labelOf = (key: string) =>
    [...baseColumns, ...result.extraColumns].find((column) => column.key === key)?.label ?? key;

  const applyPermanently = async () => {
    setConfirming(false);
    setApplying({ done: 0, total: changes.length });
    try {
      for (let index = 0; index < changes.length; index += APPLY_BATCH) {
        const batch = changes.slice(index, index + APPLY_BATCH);
        await formsAdminApi.apply(form.id, {
          updates: batch.map((change) => ({ id: change.id, answers: change.answers })),
        });
        setApplying({
          done: Math.min(changes.length, index + batch.length),
          total: changes.length,
        });
      }
      await loadResponses(form.id, { force: true });
      // The text steps are now in the data; keep row filters and computed columns.
      setPipeline(form.id, (current) =>
        current.filter(
          (step) =>
            step.kind === "dedupe" ||
            step.kind === "exclude" ||
            step.kind === "split" ||
            step.kind === "compute",
        ),
      );
      toast.success("Cleaning applied", {
        description: `${changedCells} cells in ${changes.length} responses were saved.`,
      });
    } catch (error) {
      toast.error("Could not apply every change", {
        description: error instanceof Error ? error.message : undefined,
      });
      void loadResponses(form.id, { force: true });
    } finally {
      setApplying(null);
    }
  };

  return (
    <aside
      aria-label="Clean data"
      className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-[#e4e8f0] bg-white dark:border-white/10 dark:bg-[#14171d]"
      data-testid="clean-panel"
    >
      <header className="flex items-center gap-2 border-b border-[#eef0f4] px-4 py-3 dark:border-white/5">
        <Broom className="text-brand-green" size={18} weight="duotone" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">Clean data</h3>
          <p className="text-[11px] text-[#8a93a6]">
            {result.rows.length} of {result.inputCount} rows kept · nothing is saved until you apply
          </p>
        </div>
        <button
          aria-label="Close clean data"
          className="rounded-lg p-1.5 text-[#7e899d] hover:bg-[#f4f6fa] dark:hover:bg-white/10"
          onClick={onClose}
          type="button"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!steps.length ? (
          <p className="px-2 py-6 text-center text-xs leading-5 text-[#8a93a6]">
            Add steps to tidy the answers: trim spaces, fix spellings, drop duplicates or spam,
            split a column, or compute a new one from a formula. Every chart and export follows
            along.
          </p>
        ) : null}
        <Reorder.Group
          as="ol"
          axis="y"
          className="space-y-2"
          onReorder={(order: string[]) =>
            setPipeline(form.id, (current) =>
              order
                .map((id) => current.find((step) => step.id === id))
                .filter((step): step is CleanStep => Boolean(step)),
            )
          }
          values={steps.map((step) => step.id)}
        >
          {steps.map((step, index) => (
            <StepCard
              columns={columnsBefore(step.id)}
              describe={describeStep(step, labelOf)}
              expanded={open === step.id}
              form={form}
              index={index}
              key={step.id}
              onRemove={() => remove(step.id)}
              onToggleOpen={() => setOpen((current) => (current === step.id ? null : step.id))}
              onUpdate={(patch) => update(step.id, patch)}
              result={result}
              stats={statsById.get(step.id)}
              step={step}
            />
          ))}
        </Reorder.Group>

        <div className="relative mt-3">
          <button
            className={`${ghostButton} w-full justify-center`}
            onClick={() => setAdding((value) => !value)}
            type="button"
          >
            <Plus size={14} weight="bold" /> Add a step
          </button>
          {adding ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-[#e4e8f0] p-2 dark:border-white/10">
              {(Object.keys(STEP_LABELS) as CleanStepKind[]).map((kind) => (
                <button
                  className="rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-[#3b4150] hover:bg-brand-blue-50 hover:text-brand-blue dark:text-white/70 dark:hover:bg-white/5"
                  key={kind}
                  onClick={() => add(kind)}
                  type="button"
                >
                  {STEP_LABELS[kind]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="border-t border-[#eef0f4] p-3 dark:border-white/5">
        {applying ? (
          <div aria-live="polite">
            <p className="mb-1.5 text-xs">
              Saving {applying.done} of {applying.total} responses…
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#eef0f4] dark:bg-white/10">
              <div
                className="h-full bg-brand-blue transition-[width]"
                style={{ width: `${(applying.done / Math.max(1, applying.total)) * 100}%` }}
              />
            </div>
          </div>
        ) : confirming ? (
          <div className="space-y-2" role="alertdialog" aria-label="Apply cleaning permanently">
            <p className="text-xs leading-5">
              This rewrites <b>{changedCells}</b> answer cell{changedCells === 1 ? "" : "s"} in{" "}
              <b>{changes.length}</b> response{changes.length === 1 ? "" : "s"} on the server.
              Excluded rows are not deleted and computed or split columns stay virtual. It
              can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <button className={ghostButton} onClick={() => setConfirming(false)} type="button">
                Cancel
              </button>
              <button
                className={primaryButton}
                onClick={() => void applyPermanently()}
                type="button"
              >
                Apply {changedCells} changes
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-[#5c6679] dark:text-white/55">
              <b className="tabular-nums">{changedCells}</b> answer cells changed
            </p>
            {canWrite ? (
              <button
                className={primaryButton}
                disabled={!changedCells}
                onClick={() => setConfirming(true)}
                type="button"
              >
                Apply permanently
              </button>
            ) : null}
          </div>
        )}
      </footer>
    </aside>
  );
}

function StepCard({
  step,
  index,
  stats,
  describe,
  expanded,
  columns,
  result,
  form,
  onUpdate,
  onRemove,
  onToggleOpen,
}: {
  step: CleanStep;
  index: number;
  stats: PipelineResult["steps"][number] | undefined;
  describe: string;
  expanded: boolean;
  columns: DataColumn[];
  result: PipelineResult;
  form: FormRecord;
  onUpdate: (patch: Partial<CleanStep>) => void;
  onRemove: () => void;
  onToggleOpen: () => void;
}) {
  const controls = useDragControls();
  const effect = stats
    ? [
        stats.changedCells
          ? `${stats.changedCells} cell${stats.changedCells === 1 ? "" : "s"}`
          : null,
        stats.removedRows ? `−${stats.removedRows} row${stats.removedRows === 1 ? "" : "s"}` : null,
        stats.addedColumns
          ? `+${stats.addedColumns} column${stats.addedColumns === 1 ? "" : "s"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "no change"
    : "";
  return (
    <Reorder.Item
      data-testid="clean-step"
      as="li"
      className={`rounded-xl border bg-white dark:bg-[#171b22] ${step.enabled ? "border-[#e4e8f0] dark:border-white/10" : "border-dashed border-[#d9dfeb] opacity-60 dark:border-white/10"}`}
      dragControls={controls}
      dragListener={false}
      value={step.id}
    >
      <div className="flex items-center gap-1.5 px-2 py-2">
        <span
          aria-hidden
          className="cursor-grab touch-none rounded p-1 text-[#9ba4b5] hover:bg-[#f4f6fa] dark:hover:bg-white/10"
          onPointerDown={(event) => controls.start(event)}
        >
          <DotsSixVertical size={14} weight="bold" />
        </span>
        <button
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={onToggleOpen}
          type="button"
        >
          {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold">
              {index + 1}. {STEP_LABELS[step.kind]}
            </span>
            <span className="block truncate text-[11px] text-[#8a93a6]">{describe}</span>
          </span>
        </button>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${stats?.error ? "bg-brand-red-50 text-brand-red" : "bg-[#eef1f6] text-[#5c6679] dark:bg-white/10 dark:text-white/55"}`}
          title={stats?.error}
        >
          {stats?.error ? "error" : effect}
        </span>
        <button
          aria-checked={step.enabled}
          aria-label={step.enabled ? "Turn step off" : "Turn step on"}
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${step.enabled ? "bg-brand-blue" : "bg-[#d6dbe6] dark:bg-white/15"}`}
          onClick={() => onUpdate({ enabled: !step.enabled })}
          role="switch"
          type="button"
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${step.enabled ? "left-[18px]" : "left-0.5"}`}
          />
        </button>
        <button
          aria-label="Remove step"
          className="shrink-0 rounded-lg p-1 text-[#9ba4b5] hover:bg-brand-red-50 hover:text-brand-red"
          onClick={onRemove}
          type="button"
        >
          <Trash size={13} />
        </button>
      </div>
      {expanded ? (
        <div className="space-y-3 border-t border-[#eef0f4] px-3 py-3 dark:border-white/5">
          <StepEditor
            columns={columns}
            form={form}
            onUpdate={onUpdate}
            result={result}
            step={step}
          />
          {stats?.error ? (
            <p className="text-xs text-brand-red" role="alert">
              {stats.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Reorder.Item>
  );
}

function ColumnPicker({
  columns,
  value,
  onChange,
  allowAll = true,
}: {
  columns: DataColumn[];
  value: ColumnScope;
  onChange: (value: ColumnScope) => void;
  allowAll?: boolean;
}) {
  const selected = value === "all" ? null : new Set(value);
  return (
    <div>
      <span className={`${labelClass} mb-1 block`}>Columns</span>
      {allowAll ? (
        <label className="mb-1 flex items-center gap-2 text-xs">
          <input
            checked={value === "all"}
            className="size-3.5 accent-brand-blue"
            onChange={(event) => onChange(event.target.checked ? "all" : [])}
            type="checkbox"
          />
          Every text column
        </label>
      ) : null}
      {value !== "all" ? (
        <div className="max-h-36 space-y-0.5 overflow-auto rounded-lg border border-[#eef0f4] p-1.5 dark:border-white/10">
          {columns.map((column) => (
            <label className="flex items-center gap-2 text-xs" key={column.key}>
              <input
                checked={selected?.has(column.key) ?? false}
                className="size-3.5 accent-brand-blue"
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(column.key);
                  else next.delete(column.key);
                  onChange([...next]);
                }}
                type="checkbox"
              />
              <span className="truncate">{column.label}</span>
            </label>
          ))}
          {!columns.length ? <p className="text-[11px] text-[#9ba4b5]">No text columns.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function SingleColumn({
  columns,
  value,
  onChange,
  label = "Column",
}: {
  columns: DataColumn[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
}) {
  return (
    <label className="block">
      <span className={`${labelClass} mb-1 block`}>{label}</span>
      <select
        className={inputClass}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Choose…</option>
        {columns.map((column) => (
          <option key={column.key} value={column.key}>
            {column.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormulaHelp() {
  return (
    <details className="text-[11px] text-[#5c6679] dark:text-white/55">
      <summary className="cursor-pointer font-semibold text-brand-blue">Formula reference</summary>
      <p className="mt-1.5 leading-5">
        Columns in braces: <code>{"{Age}"}</code> or a field id. Text in quotes. Operators{" "}
        <code>+ - * / %</code>, <code>&amp;</code> joins text, comparisons{" "}
        <code>= != &lt; &lt;= &gt; &gt;=</code>, and <code>and or not</code>.
      </p>
      <ul className="mt-1.5 space-y-0.5 font-mono text-[10px]">
        {Object.values(EXPR_FUNCTIONS).map((spec) => (
          <li key={spec.help}>{spec.help}</li>
        ))}
      </ul>
    </details>
  );
}

function FormulaInput({
  value,
  onChange,
  columns,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  columns: DataColumn[];
  rows: PipelineResult["rows"];
  placeholder: string;
}) {
  const resolve = useMemo(() => columnResolver(columns), [columns]);
  const compiled = useMemo(
    () => (value.trim() ? compileExpr(value, (name) => resolve(name) !== null) : null),
    [value, resolve],
  );
  const preview = useMemo(() => {
    if (!compiled?.ok) return [];
    return rows.slice(0, 5).map((row) =>
      toText(
        evaluate(compiled.expr.ast, (name) => {
          const column = resolve(name);
          return column ? exprValue(column, row) : null;
        }),
      ),
    );
  }, [compiled, rows, resolve]);
  return (
    <div className="space-y-2">
      <textarea
        aria-invalid={compiled ? !compiled.ok : undefined}
        className={`${inputClass} h-auto min-h-16 py-2 font-mono text-xs`}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
      />
      {compiled && !compiled.ok ? (
        <p className="text-xs text-brand-red" role="alert">
          {compiled.error.message}
          {compiled.error.end > compiled.error.start ? (
            <span className="ml-1 font-mono text-[10px] text-[#8a93a6]">
              at “{value.slice(compiled.error.start, compiled.error.end)}”
            </span>
          ) : null}
        </p>
      ) : null}
      {preview.length ? (
        <div className="rounded-lg bg-[#f7f8fa] p-2 dark:bg-white/5">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a93a6]">
            <Sparkle size={11} /> Preview
          </p>
          <ol className="space-y-0.5 font-mono text-[11px]">
            {preview.map((text, index) => (
              <li className="truncate" key={index}>
                {text || <span className="text-[#aab2c0]">empty</span>}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {columns
          .filter((column) => column.group !== "meta")
          .slice(0, 16)
          .map((column) => (
            <button
              className="rounded-md border border-[#e4e8f0] px-1.5 py-0.5 font-mono text-[10px] text-[#5c6679] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
              key={column.key}
              onClick={() => onChange(`${value}{${column.label}}`)}
              type="button"
            >
              {`{${column.label.length > 18 ? column.label.slice(0, 17) + "…" : column.label}}`}
            </button>
          ))}
      </div>
      <FormulaHelp />
    </div>
  );
}

function StepEditor({
  step,
  columns,
  result,
  onUpdate,
}: {
  step: CleanStep;
  columns: DataColumn[];
  result: PipelineResult;
  form: FormRecord;
  onUpdate: (patch: Partial<CleanStep>) => void;
}) {
  const textColumns = columns.filter((column) => column.cleanable);
  switch (step.kind) {
    case "trim":
    case "collapse":
      return (
        <ColumnPicker
          columns={textColumns}
          onChange={(value) => onUpdate({ columns: value })}
          value={step.columns}
        />
      );
    case "case":
      return (
        <>
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Case</span>
            <select
              className={inputClass}
              onChange={(event) => onUpdate({ mode: event.target.value as typeof step.mode })}
              value={step.mode}
            >
              <option value="lower">lower case</option>
              <option value="upper">UPPER CASE</option>
              <option value="title">Title Case</option>
              <option value="sentence">Sentence case</option>
            </select>
          </label>
          <ColumnPicker
            allowAll
            columns={textColumns}
            onChange={(value) => onUpdate({ columns: value })}
            value={step.columns}
          />
        </>
      );
    case "replace":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`${labelClass} mb-1 block`}>Find</span>
              <input
                className={`${inputClass} font-mono`}
                maxLength={200}
                onChange={(event) => onUpdate({ find: event.target.value })}
                value={step.find}
              />
            </label>
            <label className="block">
              <span className={`${labelClass} mb-1 block`}>Replace with</span>
              <input
                className={`${inputClass} font-mono`}
                onChange={(event) => onUpdate({ replace: event.target.value })}
                value={step.replace}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {(
              [
                ["regex", "Regular expression"],
                ["caseSensitive", "Match case"],
                ["wholeCell", "Whole cell"],
              ] as const
            ).map(([key, label]) => (
              <label className="flex items-center gap-1.5" key={key}>
                <input
                  checked={step[key]}
                  className="size-3.5 accent-brand-blue"
                  onChange={(event) => onUpdate({ [key]: event.target.checked })}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
          {step.regex ? (
            <p className="text-[11px] text-[#8a93a6]">
              Use $1, $2 in the replacement for captured groups.
            </p>
          ) : null}
          <ColumnPicker
            columns={textColumns}
            onChange={(value) => onUpdate({ columns: value })}
            value={step.columns}
          />
        </>
      );
    case "fill":
      return (
        <>
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Fill empty cells with</span>
            <input
              className={inputClass}
              onChange={(event) => onUpdate({ value: event.target.value })}
              placeholder="e.g. Unknown, 0"
              value={step.value}
            />
          </label>
          <ColumnPicker
            allowAll={false}
            columns={columns.filter(
              (column) =>
                column.group !== "meta" &&
                (column.cleanable ||
                  column.valueType === "number" ||
                  column.valueType === "date" ||
                  column.group === "extra"),
            )}
            onChange={(value) => onUpdate({ columns: value })}
            value={step.columns}
          />
        </>
      );
    case "standardize":
      return (
        <StandardizeEditor columns={textColumns} onUpdate={onUpdate} result={result} step={step} />
      );
    case "dedupe":
      return (
        <>
          <ColumnPicker
            allowAll={false}
            columns={columns.filter((column) => column.group !== "meta" || column.key === "$ip")}
            onChange={(value) => onUpdate({ columns: value === "all" ? [] : value })}
            value={step.columns}
          />
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Keep</span>
            <select
              className={inputClass}
              onChange={(event) => onUpdate({ keep: event.target.value as "first" | "last" })}
              value={step.keep}
            >
              <option value="first">The newest (first in the list)</option>
              <option value="last">The oldest (last in the list)</option>
            </select>
          </label>
          <p className="text-[11px] text-[#8a93a6]">
            Rows match when the chosen columns are equal, ignoring case, accents and punctuation.
          </p>
        </>
      );
    case "exclude":
      return (
        <>
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Exclude</span>
            <select
              className={inputClass}
              onChange={(event) => onUpdate({ what: event.target.value as typeof step.what })}
              value={step.what}
            >
              <option value="spam">Spam</option>
              <option value="flagged">Flagged</option>
              <option value="incomplete">Incomplete (a required question unanswered)</option>
              <option value="condition">Rows matching a condition</option>
            </select>
          </label>
          {step.what === "condition" ? (
            <FormulaInput
              columns={columns}
              onChange={(formula) => onUpdate({ formula })}
              placeholder='{Age} < 18 or contains({Email}, "test")'
              rows={result.rows}
              value={step.formula ?? ""}
            />
          ) : null}
        </>
      );
    case "split":
      return (
        <>
          <SingleColumn
            columns={columns.filter(
              (column) => column.group !== "meta" || column.valueType === "text",
            )}
            onChange={(column) => onUpdate({ column })}
            value={step.column}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`${labelClass} mb-1 block`}>Delimiter</span>
              <input
                className={`${inputClass} font-mono`}
                onChange={(event) => onUpdate({ delimiter: event.target.value })}
                value={step.delimiter}
              />
            </label>
            <label className="block">
              <span className={`${labelClass} mb-1 block`}>At most</span>
              <input
                className={inputClass}
                max={10}
                min={2}
                onChange={(event) => onUpdate({ maxParts: Number(event.target.value) })}
                type="number"
                value={step.maxParts}
              />
            </label>
          </div>
        </>
      );
    case "compute":
      return (
        <>
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Column name</span>
            <input
              className={inputClass}
              onChange={(event) => onUpdate({ name: event.target.value })}
              value={step.name}
            />
          </label>
          <FormulaInput
            columns={columns}
            onChange={(formula) => onUpdate({ formula })}
            placeholder='if({Score} >= 8, "high", "low")'
            rows={result.rows}
            value={step.formula}
          />
        </>
      );
  }
}

function StandardizeEditor({
  step,
  columns,
  result,
  onUpdate,
}: {
  step: Extract<CleanStep, { kind: "standardize" }>;
  columns: DataColumn[];
  result: PipelineResult;
  onUpdate: (patch: Partial<CleanStep>) => void;
}) {
  const column = columns.find((item) => item.key === step.column);
  const suggestions = useMemo(() => {
    if (!column) return [];
    return suggestStandardize(result.rows.map((row) => cellText(column, row)));
  }, [column, result.rows]);
  const mapped = new Set(step.mappings.flatMap((mapping) => mapping.from));
  const fresh = suggestions.filter((suggestion) =>
    suggestion.from.some((value) => !mapped.has(value)),
  );
  return (
    <>
      <SingleColumn
        columns={columns}
        onChange={(key) => onUpdate({ column: key, mappings: [] })}
        value={step.column}
      />
      {step.mappings.length ? (
        <ul className="space-y-2">
          {step.mappings.map((mapping, index) => (
            <li className="rounded-lg border border-[#eef0f4] p-2 dark:border-white/10" key={index}>
              <div className="flex flex-wrap gap-1">
                {mapping.from.map((value) => (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-[#eef1f6] py-0.5 pr-1 pl-2 text-[11px] dark:bg-white/10"
                    key={value}
                  >
                    {value || "(blank)"}
                    <button
                      aria-label={`Keep ${value} as it is`}
                      className="rounded-full p-0.5 hover:text-brand-red"
                      onClick={() =>
                        onUpdate({
                          mappings: step.mappings
                            .map((item, i) =>
                              i === index
                                ? { ...item, from: item.from.filter((from) => from !== value) }
                                : item,
                            )
                            .filter((item) => item.from.length),
                        })
                      }
                      type="button"
                    >
                      <X size={9} weight="bold" />
                    </button>
                  </span>
                ))}
              </div>
              <label className="mt-1.5 flex items-center gap-2 text-xs">
                <span className="shrink-0 text-[#8a93a6]">becomes</span>
                <input
                  className={`${inputClass} h-8`}
                  onChange={(event) =>
                    onUpdate({
                      mappings: step.mappings.map((item, i) =>
                        i === index ? { ...item, to: event.target.value } : item,
                      ),
                    })
                  }
                  value={mapping.to}
                />
                <button
                  aria-label="Remove mapping"
                  className="shrink-0 rounded p-1 text-[#9ba4b5] hover:text-brand-red"
                  onClick={() =>
                    onUpdate({ mappings: step.mappings.filter((_, i) => i !== index) })
                  }
                  type="button"
                >
                  <Trash size={12} />
                </button>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {column ? (
        fresh.length ? (
          <div>
            <p className={`${labelClass} mb-1.5`}>Suggestions</p>
            <ul className="space-y-1">
              {fresh.slice(0, 8).map((suggestion) => (
                <li className="flex items-center gap-2 text-xs" key={suggestion.to}>
                  <span className="min-w-0 flex-1 truncate">
                    {suggestion.from.join(", ")} → <b>{suggestion.to}</b>{" "}
                    <span className="text-[#8a93a6]">({suggestion.count})</span>
                  </span>
                  <button
                    className="shrink-0 rounded-lg px-2 py-0.5 font-semibold text-brand-blue hover:bg-brand-blue-50"
                    onClick={() =>
                      onUpdate({
                        mappings: [...step.mappings, { from: suggestion.from, to: suggestion.to }],
                      })
                    }
                    type="button"
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
            {fresh.length > 1 ? (
              <button
                className="mt-1.5 text-xs font-semibold text-brand-blue hover:underline"
                onClick={() =>
                  onUpdate({
                    mappings: [
                      ...step.mappings,
                      ...fresh.map((suggestion) => ({ from: suggestion.from, to: suggestion.to })),
                    ],
                  })
                }
                type="button"
              >
                Use all {fresh.length}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-[#8a93a6]">
            No similar spellings left to merge in this column.
          </p>
        )
      ) : null}
      <button
        className="text-xs font-semibold text-brand-blue hover:underline"
        disabled={!column}
        onClick={() => onUpdate({ mappings: [...step.mappings, { from: [], to: "" }] })}
        type="button"
      >
        + Add a mapping by hand
      </button>
      {step.mappings.some((mapping) => !mapping.from.length) ? (
        <ManualVariants column={column} result={result} step={step} onUpdate={onUpdate} />
      ) : null}
    </>
  );
}

/** For hand-made mappings: pick the variants from the column's distinct values. */
function ManualVariants({
  step,
  column,
  result,
  onUpdate,
}: {
  step: Extract<CleanStep, { kind: "standardize" }>;
  column: DataColumn | undefined;
  result: PipelineResult;
  onUpdate: (patch: Partial<CleanStep>) => void;
}) {
  const values = useMemo(() => {
    if (!column) return [];
    const counts = new Map<string, number>();
    for (const row of result.rows) {
      const text = cellText(column, row).trim();
      if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  }, [column, result.rows]);
  const index = step.mappings.findIndex((mapping) => !mapping.from.length);
  return (
    <div className="max-h-40 overflow-auto rounded-lg border border-dashed border-[#d9dfeb] p-2 dark:border-white/10">
      <p className="mb-1 text-[11px] text-[#8a93a6]">Pick the values to merge:</p>
      <div className="flex flex-wrap gap-1">
        {values.map(([value, count]) => (
          <button
            className="rounded-full border border-[#e4e8f0] px-2 py-0.5 text-[11px] hover:border-brand-blue dark:border-white/10"
            key={value}
            onClick={() =>
              onUpdate({
                mappings: step.mappings.map((item, i) =>
                  i === index ? { from: [value], to: item.to || value } : item,
                ),
              })
            }
            type="button"
          >
            {value} <span className="text-[#9ba4b5]">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
