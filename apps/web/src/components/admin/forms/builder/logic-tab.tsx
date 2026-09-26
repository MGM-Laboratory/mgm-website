"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  Eye,
  EyeSlash,
  Files,
  Flag,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { memo, useCallback, useMemo, useState } from "react";

import {
  FORM_LIMITS,
  OTHER_OPTION_ID,
  buildPages,
  computeScore,
  isChoiceType,
  isFieldVisible,
  isInputType,
  isMultiChoiceType,
  logicContext,
  maxScore,
  pickEnding,
  resolvePath,
  visibleFields,
  type FormAnswers,
  type FormAnswerValue,
  type FormDocument,
  type FormField,
  type FormJump,
} from "@repo/shared";

import { documentIds, isQuestion, mintId } from "@/lib/forms/builder-fields";
import { patchEnding, patchField } from "@/lib/forms/builder-ops";

import { AdminDatePicker } from "./admin-pickers";
import { FieldIcon } from "./field-icons";
import { FlowMap } from "./flow-map";
import { RuleBuilder, describeGroup } from "./rule-builder";
import type { TabProps } from "./types";
import {
  NumberInput,
  Segmented,
  Switch,
  cardClass,
  eyebrowClass,
  ghostButtonClass,
  iconButtonClass,
  smallInputClass,
} from "./ui";

type Change = TabProps["change"];

function SectionCard({
  children,
  description,
  icon,
  id,
  title,
  aside,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
  icon: React.ReactNode;
  id: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`${cardClass} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"
            id={id}
          >
            <span className="text-brand-blue">{icon}</span>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#69748a] dark:text-white/45">
              {description}
            </p>
          ) : null}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function short(text: string, max = 60) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// ---------------------------------------------------------------------------
// Page flow and jumps
// ---------------------------------------------------------------------------

function JumpEditor({
  breakField,
  breakIndex,
  document,
  change,
  destinations,
  readOnly,
}: {
  breakField: FormField;
  breakIndex: number;
  document: FormDocument;
  change: Change;
  destinations: { value: string; label: string }[];
  readOnly: boolean;
}) {
  const jumps = breakField.jumps ?? [];
  const setJumps = (next: FormJump[], key?: string) => {
    change(
      (doc) =>
        patchField(doc, breakField.id, (field) => ({
          ...field,
          jumps: next.length ? next : undefined,
        })),
      key,
    );
  };

  const add = () => {
    const id = mintId("jump", documentIds(document));
    setJumps([
      ...jumps,
      { id, when: { match: "all", rules: [] }, to: destinations[0]?.value ?? "end" },
    ]);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= jumps.length) return;
    const next = [...jumps];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setJumps(next);
  };

  return (
    <div className="space-y-2.5">
      {jumps.map((jump, index) => (
        <div
          className="rounded-xl border border-brand-yellow/40 bg-brand-yellow-50/40 p-3 dark:border-brand-yellow/20 dark:bg-brand-yellow/[0.05]"
          key={jump.id}
        >
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-[#8a6412] uppercase dark:text-brand-yellow">
              Jump {index + 1}
            </span>
            <label className="sr-only" htmlFor={`${jump.id}-to`}>
              Destination of jump {index + 1}
            </label>
            <span className="text-xs text-[#69748a] dark:text-white/50">go to</span>
            <select
              className={`${smallInputClass} w-auto max-w-full min-w-40 flex-1 basis-40 sm:max-w-xs`}
              disabled={readOnly}
              id={`${jump.id}-to`}
              onChange={(event) => {
                setJumps(
                  jumps.map((item) =>
                    item.id === jump.id ? { ...item, to: event.target.value } : item,
                  ),
                );
              }}
              value={jump.to}
            >
              {destinations.some((item) => item.value === jump.to) ? null : (
                <option value={jump.to}>Missing destination</option>
              )}
              {destinations.map((destination) => (
                <option key={destination.value} value={destination.value}>
                  {destination.label}
                </option>
              ))}
            </select>
            {readOnly ? null : (
              <span className="ml-auto flex items-center">
                <button
                  aria-label={`Move jump ${index + 1} up`}
                  className={iconButtonClass}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                  type="button"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label={`Move jump ${index + 1} down`}
                  className={iconButtonClass}
                  disabled={index === jumps.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                  type="button"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  aria-label={`Remove jump ${index + 1}`}
                  className={`${iconButtonClass} hover:!text-brand-red`}
                  onClick={() => {
                    setJumps(jumps.filter((item) => item.id !== jump.id));
                  }}
                  type="button"
                >
                  <Trash size={14} />
                </button>
              </span>
            )}
          </div>
          <RuleBuilder
            allowScore={document.settings.scoring.enabled}
            beforeIndex={breakIndex}
            document={document}
            emptyHint="No rules: this jump always happens, so later jumps never run."
            label="When"
            onChange={(when) => {
              setJumps(
                jumps.map((item) =>
                  item.id === jump.id
                    ? { ...item, when: when ?? { match: "all", rules: [] } }
                    : item,
                ),
                `jump:${jump.id}`,
              );
            }}
            readOnly={readOnly}
            value={jump.when}
          />
        </div>
      ))}
      {!readOnly ? (
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-[#c6cedd] px-3 text-xs font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue disabled:opacity-40 dark:border-white/15 dark:text-white/55"
          disabled={jumps.length >= FORM_LIMITS.jumpsMax}
          onClick={add}
          type="button"
        >
          <Plus size={13} weight="bold" />
          Add a jump
        </button>
      ) : null}
    </div>
  );
}

function PageFlowSection({
  change,
  document,
  readOnly,
}: {
  change: Change;
  document: FormDocument;
  readOnly: boolean;
}) {
  const pages = useMemo(() => buildPages(document.fields), [document.fields]);
  const [focusPage, setFocusPage] = useState<string | null>(null);
  const breaks = pages.filter((page) => page.closer);

  return (
    <SectionCard
      description="Pages follow each other in order. At the end of a page, jumps can skip ahead to a later page, straight to submit, or to one ending. The first jump whose rules match wins; jumps only go forward."
      icon={<Files size={18} weight="duotone" />}
      id="logic-flow"
      title="Page flow"
    >
      {pages.length < 2 ? (
        <div className="rounded-xl border border-dashed border-[#d3dae6] px-5 py-6 text-center dark:border-white/10">
          <p className="text-sm font-semibold">This form is a single page</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#778299] dark:text-white/45">
            Add a Page break block in Build to split the form into steps. Each page can then jump
            ahead depending on the answers.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <FlowMap
            document={document}
            onSelectPage={(id) => {
              setFocusPage(id);
            }}
          />
          <div className="min-w-0 space-y-3">
            {breaks.map((page) => {
              const closer = page.closer as FormField;
              const breakIndex = document.fields.findIndex((field) => field.id === closer.id);
              const destinations = [
                ...pages
                  .filter((candidate) => candidate.index > page.index + 1)
                  .map((candidate) => ({
                    value: candidate.id,
                    label: `Page ${candidate.index + 1}${candidate.title ? `: ${short(candidate.title, 30)}` : ""}`,
                  })),
                { value: "end", label: "Submit the form" },
                ...document.endings.map((ending, index) => ({
                  value: `ending:${ending.id}`,
                  label: `Ending ${index + 1}: ${short(ending.title || "Untitled", 30)}`,
                })),
              ];
              const open = focusPage === null || focusPage === page.id;
              return (
                <details
                  className="group rounded-xl border border-[#e3e7f0] dark:border-white/10"
                  key={closer.id}
                  open={open}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold">
                    <CaretRight
                      className="transition group-open:rotate-90 motion-reduce:transition-none"
                      size={13}
                    />
                    Leaving page {page.index + 1}
                    {page.title ? (
                      <span className="truncate font-normal text-[#69748a]">
                        · {short(page.title, 30)}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-[#8490a5]">
                      {closer.jumps?.length ?? 0} jumps
                    </span>
                  </summary>
                  <div className="border-t border-[#eef1f6] p-3 dark:border-white/[0.07]">
                    <JumpEditor
                      breakField={closer}
                      breakIndex={breakIndex}
                      change={change}
                      destinations={destinations}
                      document={document}
                      readOnly={readOnly}
                    />
                  </div>
                </details>
              );
            })}
            {focusPage !== null ? (
              <button
                className={ghostButtonClass}
                onClick={() => {
                  setFocusPage(null);
                }}
                type="button"
              >
                Show all pages
              </button>
            ) : null}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Question visibility
// ---------------------------------------------------------------------------

const VisibilityRow = memo(function VisibilityRow({
  change,
  document,
  expanded,
  field,
  index,
  number,
  onToggle,
  readOnly,
  summary,
}: {
  change: Change;
  /** Only passed while expanded, so collapsed rows skip re-rendering. */
  document?: FormDocument;
  expanded: boolean;
  field: FormField;
  index: number;
  number?: number;
  onToggle: (id: string) => void;
  readOnly: boolean;
  summary: string;
}) {
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[#eef1f6] text-[#5d687d] dark:bg-white/10 dark:text-white/60">
          <FieldIcon size={13} type={field.type} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {number ? (
              <span className="mr-1.5 font-mono text-[11px] text-[#8490a5]">{number}</span>
            ) : null}
            {field.label || <span className="text-[#9ba4b5] italic">Untitled</span>}
          </p>
          <p
            className={`truncate text-xs ${summary ? "text-brand-blue" : "text-[#9ba4b5] dark:text-white/35"}`}
          >
            {summary || "Always shown"}
          </p>
        </div>
        <button
          aria-expanded={expanded}
          className={ghostButtonClass}
          onClick={() => {
            onToggle(field.id);
          }}
          type="button"
        >
          {expanded ? <CaretDown size={13} /> : <CaretRight size={13} />}
          {readOnly ? "View" : summary ? "Edit" : "Add rule"}
        </button>
      </div>
      {expanded && document ? (
        <div className="mt-2.5 ml-8">
          <RuleBuilder
            allowScore={document.settings.scoring.enabled}
            beforeIndex={index}
            document={document}
            emptyHint="No rules: the question always shows."
            label="Show this question when"
            onChange={(visibleIf) => {
              change(
                (doc) => patchField(doc, field.id, (item) => ({ ...item, visibleIf })),
                `visible:${field.id}`,
              );
            }}
            readOnly={readOnly}
            value={field.visibleIf}
          />
        </div>
      ) : null}
    </li>
  );
});

function VisibilitySection({
  change,
  document,
  readOnly,
}: {
  change: Change;
  document: FormDocument;
  readOnly: boolean;
}) {
  const [onlyRules, setOnlyRules] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    let number = 0;
    const list: { field: FormField; index: number; number?: number }[] = [];
    document.fields.forEach((field, index) => {
      if (isQuestion(field)) number += 1;
      if (field.type === "page_break" || field.type === "hidden") return;
      list.push({ field, index, number: isQuestion(field) ? number : undefined });
    });
    return list;
  }, [document.fields]);

  const withRules = rows.filter((row) => row.field.visibleIf?.rules.length).length;
  const shown = onlyRules ? rows.filter((row) => row.field.visibleIf?.rules.length) : rows;

  return (
    <SectionCard
      aside={
        <div className="w-48">
          <Switch checked={onlyRules} label="Only with rules" onChange={setOnlyRules} size="sm" />
        </div>
      }
      description={`A block with rules shows only while they match. ${withRules} of ${rows.length} blocks have rules.`}
      icon={<Eye size={18} weight="duotone" />}
      id="logic-visibility"
      title="Question visibility"
    >
      {shown.length ? (
        <ul className="divide-y divide-[#eef1f6] dark:divide-white/[0.07]">
          {shown.map((row) => (
            <VisibilityRow
              change={change}
              document={expanded.has(row.field.id) ? document : undefined}
              expanded={expanded.has(row.field.id)}
              field={row.field}
              index={row.index}
              key={row.field.id}
              number={row.number}
              onToggle={toggle}
              readOnly={readOnly}
              summary={describeGroup(document, row.field.visibleIf)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#8490a5]">
          {rows.length ? "No block has visibility rules yet." : "Add questions in Build first."}
        </p>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

function EndingsSection({
  change,
  document,
  readOnly,
}: {
  change: Change;
  document: FormDocument;
  readOnly: boolean;
}) {
  const defaultIndex = document.endings.findIndex((ending) => !ending.when?.rules.length);
  return (
    <SectionCard
      description="After submitting, endings are checked in order and the first whose rules match is shown. The first ending without rules is the default."
      icon={<Flag size={18} weight="duotone" />}
      id="logic-endings"
      title="Endings"
    >
      <ol className="space-y-3">
        {document.endings.map((ending, index) => (
          <li
            className="rounded-xl border border-[#e3e7f0] p-3 dark:border-white/10"
            key={ending.id}
          >
            <p className="mb-2.5 flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="font-mono text-[10px] text-[#8490a5]">{index + 1}</span>
              {ending.title || "Untitled ending"}
              {index === defaultIndex ? (
                <span className="rounded-full bg-brand-green-50 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-brand-green uppercase dark:bg-brand-green/15">
                  Default
                </span>
              ) : null}
            </p>
            <RuleBuilder
              allowScore={document.settings.scoring.enabled}
              document={document}
              emptyHint={
                index === defaultIndex
                  ? "No rules: this is the default ending."
                  : defaultIndex < index && defaultIndex !== -1
                    ? "No rules, but an earlier ending is already the default, so this one only shows when a jump sends respondents here."
                    : "No rules yet."
              }
              label="Show this ending when"
              onChange={(when) => {
                change((doc) => patchEnding(doc, ending.id, { when }), `ending-when:${ending.id}`);
              }}
              readOnly={readOnly}
              value={ending.when}
            />
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function ScoringSection({
  change,
  document,
  readOnly,
}: {
  change: Change;
  document: FormDocument;
  readOnly: boolean;
}) {
  const scoring = document.settings.scoring;
  const choiceFields = document.fields.filter(
    (field) => isChoiceType(field.type) && field.options?.length,
  );
  const computedMax = maxScore(document);
  const setScoring = (patch: Partial<typeof scoring>, key?: string) => {
    change(
      (doc) => ({
        ...doc,
        settings: { ...doc.settings, scoring: { ...doc.settings.scoring, ...patch } },
      }),
      key,
    );
  };

  return (
    <SectionCard
      aside={
        <div className="w-44">
          <Switch
            checked={scoring.enabled}
            disabled={readOnly}
            label="Scoring"
            onChange={(enabled) => {
              setScoring({ enabled });
            }}
            size="sm"
          />
        </div>
      }
      description="Each chosen option adds its points to the score. Rules and endings can use the score, and an ending can show it."
      icon={<ArrowsClockwise size={18} weight="duotone" />}
      id="logic-scoring"
      title="Scoring"
    >
      {choiceFields.length ? (
        <div className="space-y-3">
          {choiceFields.map((field) => (
            <div className="rounded-xl border border-[#e3e7f0] dark:border-white/10" key={field.id}>
              <p className="truncate border-b border-[#eef1f6] px-3 py-2 text-sm font-semibold dark:border-white/[0.07]">
                {field.label || "Untitled"}
                {isMultiChoiceType(field.type, field) ? (
                  <span className="ml-2 font-mono text-[10px] font-normal text-[#8490a5]">
                    points add up
                  </span>
                ) : null}
              </p>
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Option</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {(field.options ?? []).map((option) => (
                    <tr
                      className="border-t border-[#f1f3f8] first:border-t-0 dark:border-white/[0.05]"
                      key={option.id}
                    >
                      <td className="max-w-0 truncate px-3 py-1.5 text-[#3c4659] dark:text-white/70">
                        {option.label}
                      </td>
                      <td className="w-28 px-3 py-1.5">
                        <NumberInput
                          ariaLabel={`Points for ${option.label}`}
                          className={`${smallInputClass} h-8 text-right`}
                          onChange={(points) => {
                            change(
                              (doc) =>
                                patchField(doc, field.id, (item) => ({
                                  ...item,
                                  options: item.options?.map((candidate) =>
                                    candidate.id === option.id
                                      ? { ...candidate, points }
                                      : candidate,
                                  ),
                                })),
                              `points:${option.id}`,
                            );
                          }}
                          placeholder="0"
                          step="any"
                          value={option.points}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-4 rounded-xl bg-[#f4f6fa] p-3 dark:bg-white/[0.04]">
            <div>
              <p className={eyebrowClass}>Highest possible score</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{computedMax}</p>
            </div>
            <div className="w-44">
              <label className={eyebrowClass} htmlFor="logic-max-score">
                Shown as maximum
              </label>
              <NumberInput
                className={`${smallInputClass} mt-1`}
                id="logic-max-score"
                min={1}
                onChange={(value) => {
                  setScoring({ maxScore: value && value > 0 ? value : undefined }, "scoring.max");
                }}
                placeholder={String(computedMax || "")}
                value={scoring.maxScore}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[#8490a5]">Add a choice question to give options points.</p>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Test the logic
// ---------------------------------------------------------------------------

const NUMERIC = new Set(["number", "rating", "opinion_scale", "nps", "slider"]);
const TEXT = new Set([
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "country",
  "color",
  "time",
]);

const TestInput = memo(function TestInput({
  field,
  onChange,
  value,
}: {
  field: FormField;
  onChange: (id: string, value: FormAnswerValue | undefined) => void;
  value: FormAnswerValue | undefined;
}) {
  const id = `test-${field.id}`;
  if (TEXT.has(field.type)) {
    return (
      <input
        className={smallInputClass}
        id={id}
        onChange={(event) => {
          onChange(field.id, event.target.value || undefined);
        }}
        value={typeof value === "string" ? value : ""}
      />
    );
  }
  if (NUMERIC.has(field.type)) {
    return (
      <NumberInput
        id={id}
        onChange={(next) => {
          onChange(field.id, next);
        }}
        step="any"
        value={typeof value === "number" ? value : undefined}
      />
    );
  }
  if (field.type === "yes_no" || field.type === "consent") {
    return (
      <Segmented<"none" | "yes" | "no">
        label={field.label || "Answer"}
        onChange={(next) => {
          onChange(field.id, next === "none" ? undefined : next === "yes");
        }}
        options={[
          { value: "none", label: "Empty" },
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
        size="sm"
        value={value === true ? "yes" : value === false ? "no" : "none"}
      />
    );
  }
  if (field.type === "date" || field.type === "datetime") {
    return (
      <AdminDatePicker
        id={id}
        kind={field.type}
        onChange={(next) => {
          onChange(field.id, next);
        }}
        value={typeof value === "string" ? value : undefined}
      />
    );
  }
  if (field.options?.length) {
    const options = [
      ...field.options,
      ...(field.allowOther ? [{ id: OTHER_OPTION_ID, label: field.otherLabel || "Other" }] : []),
    ];
    if (isMultiChoiceType(field.type, field)) {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {options.map((option) => {
            const on = list.includes(option.id);
            return (
              <button
                aria-pressed={on}
                className={`min-h-7 max-w-[12rem] truncate rounded-lg border px-2 text-xs font-semibold transition ${on ? "border-brand-blue bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20" : "border-[#d9dfeb] text-[#5d687d] dark:border-white/10 dark:text-white/60"}`}
                key={option.id}
                onClick={() => {
                  const next = on
                    ? list.filter((item) => item !== option.id)
                    : [...list, option.id];
                  onChange(field.id, next.length ? next : undefined);
                }}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <select
        className={smallInputClass}
        id={id}
        onChange={(event) => {
          onChange(field.id, event.target.value || undefined);
        }}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">No answer</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return <p className="text-[11px] text-[#9ba4b5] italic">Not simulated</p>;
});

function TestPanel({ document }: { document: FormDocument }) {
  const [answers, setAnswers] = useState<FormAnswers>({});
  const setAnswer = useCallback((id: string, value: FormAnswerValue | undefined) => {
    setAnswers((current) =>
      value === undefined
        ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id))
        : { ...current, [id]: value },
    );
  }, []);

  const questions = useMemo(
    () => document.fields.filter((field) => isInputType(field.type)),
    [document.fields],
  );
  const result = useMemo(() => {
    const path = resolvePath(document, answers);
    const context = logicContext(document, answers);
    // A form with no endings has nothing to pick.
    const ending = pickEnding(document, answers, path.forcedEndingId) as
      FormDocument["endings"][number] | undefined;
    const visible = new Set(visibleFields(document, answers).map((field) => field.id));
    const routed = new Set(
      path.route.flatMap((index) => path.pages.at(index)?.fields.map((field) => field.id) ?? []),
    );
    return {
      path,
      visible,
      routed,
      context,
      score: computeScore(document, answers),
      max: document.settings.scoring.maxScore ?? maxScore(document),
      ending,
    };
  }, [answers, document]);

  const hiddenCount = questions.filter(
    (field) => field.type !== "hidden" && !result.visible.has(field.id),
  ).length;

  return (
    <section aria-labelledby="logic-test" className={`${cardClass} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-[-0.03em]" id="logic-test">
          Test the logic
        </h2>
        <button
          className={ghostButtonClass}
          disabled={!Object.keys(answers).length}
          onClick={() => {
            setAnswers({});
          }}
          type="button"
        >
          Reset
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#69748a] dark:text-white/45">
        Fill in sample answers to see what a respondent would meet. Nothing is saved.
      </p>

      <div
        aria-live="polite"
        className="mt-4 space-y-3 rounded-xl bg-[#f4f6fa] p-3 text-sm dark:bg-white/[0.04]"
      >
        <div>
          <p className={eyebrowClass}>Route</p>
          <p className="mt-1 leading-6">
            {result.path.route
              .map((index) => result.path.pages.at(index)?.title?.trim() || `Page ${index + 1}`)
              .join(" → ")}
            {" → "}
            {result.path.forcedEndingId ? "ending (by jump)" : "Submit"}
          </p>
        </div>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className={eyebrowClass}>Score</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">
              {result.score}
              {result.max ? <span className="text-sm text-[#8490a5]"> / {result.max}</span> : null}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <p className={eyebrowClass}>Ending</p>
            <p className="mt-1 truncate font-semibold text-brand-green">
              {result.ending?.title || "Untitled ending"}
            </p>
          </div>
        </div>
        <p className="text-xs text-[#69748a] dark:text-white/50">
          {hiddenCount
            ? `${hiddenCount} question${hiddenCount === 1 ? " is" : "s are"} skipped or hidden.`
            : "Every question shows."}
        </p>
      </div>

      <ol className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {questions.map((field) => {
          const onRoute = result.routed.has(field.id);
          const shown = field.type === "hidden" ? onRoute : result.visible.has(field.id);
          const ownRule = isFieldVisible(field, result.context);
          return (
            <li className={shown ? "" : "opacity-55"} key={field.id}>
              <label
                className="mb-1 flex items-center gap-1.5 text-xs font-semibold"
                htmlFor={`test-${field.id}`}
              >
                {shown ? (
                  <Eye className="shrink-0 text-brand-green" size={12} weight="bold" />
                ) : (
                  <EyeSlash className="shrink-0 text-[#8490a5]" size={12} weight="bold" />
                )}
                <span className="truncate">
                  {field.label ||
                    (field.type === "hidden" ? `Hidden: ${field.prefillParam ?? ""}` : "Untitled")}
                </span>
                {!shown ? (
                  <span className="shrink-0 font-normal text-[#8490a5]">
                    {field.type === "hidden"
                      ? ""
                      : !onRoute
                        ? "· page skipped"
                        : !ownRule
                          ? "· hidden by rule"
                          : ""}
                  </span>
                ) : null}
              </label>
              <TestInput field={field} onChange={setAnswer} value={answers[field.id]} />
            </li>
          );
        })}
        {!questions.length ? (
          <li className="text-sm text-[#8490a5]">No questions to answer yet.</li>
        ) : null}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

/** Every piece of logic in one place, with a live simulator on the side. */
export function LogicTab({ change, document, readOnly }: TabProps) {
  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:px-8">
      <div className="min-w-0 space-y-5">
        <PageFlowSection change={change} document={document} readOnly={readOnly} />
        <VisibilitySection change={change} document={document} readOnly={readOnly} />
        <EndingsSection change={change} document={document} readOnly={readOnly} />
        <ScoringSection change={change} document={document} readOnly={readOnly} />
      </div>
      <div className="min-w-0 lg:sticky lg:top-[calc(var(--builder-top)+1rem)] lg:self-start">
        <TestPanel document={document} />
      </div>
    </div>
  );
}
