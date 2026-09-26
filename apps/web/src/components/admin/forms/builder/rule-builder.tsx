"use client";

import { Plus, Trash, Warning } from "@phosphor-icons/react";
import { memo, useId, useMemo } from "react";

import {
  FORM_LIMITS,
  OTHER_OPTION_ID,
  SCORE_SUBJECT,
  isInputType,
  isMultiChoiceType,
  operatorsFor,
  type FormCondition,
  type FormConditionGroup,
  type FormDocument,
  type FormField,
  type FormOperator,
} from "@repo/shared";

import { isQuestion } from "@/lib/forms/builder-fields";

import { Segmented, eyebrowClass, iconButtonClass, smallInputClass } from "./ui";

export const OPERATOR_LABELS: Record<FormOperator, string> = {
  is_answered: "is answered",
  is_not_answered: "is empty",
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  includes_any: "includes any of",
  includes_all: "includes all of",
  includes_none: "includes none of",
  before: "is before",
  after: "is after",
};

const PRESENCE = new Set<FormOperator>(["is_answered", "is_not_answered"]);
const LIST_OPERATORS = new Set<FormOperator>(["includes_any", "includes_all", "includes_none"]);

/** Questions (and hidden fields) a rule can look at, with their display number. */
export function ruleSubjects(document: FormDocument, beforeIndex?: number) {
  const subjects: { field: FormField; number?: number; index: number }[] = [];
  let number = 0;
  document.fields.forEach((field, index) => {
    if (isQuestion(field)) number += 1;
    if (!isInputType(field.type)) return;
    if (beforeIndex !== undefined && index >= beforeIndex) return;
    subjects.push({ field, number: isQuestion(field) ? number : undefined, index });
  });
  return subjects;
}

function questionNumber(document: FormDocument, fieldId: string) {
  let number = 0;
  for (const field of document.fields) {
    if (isQuestion(field)) number += 1;
    if (field.id === fieldId) return isQuestion(field) ? number : undefined;
  }
  return undefined;
}

function shortLabel(text: string, max = 36) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function subjectName(document: FormDocument, field: FormField) {
  const number = questionNumber(document, field.id);
  const label = shortLabel(
    field.label || (field.type === "hidden" ? (field.prefillParam ?? "hidden") : "Untitled"),
  );
  return `${number ? `Q${number} ` : field.type === "hidden" ? "Hidden " : ""}“${label}”`;
}

function optionName(field: FormField, id: string) {
  if (id === OTHER_OPTION_ID) return field.otherLabel || "Other";
  return field.options?.find((option) => option.id === id)?.label ?? id;
}

/** "Q3 “Attending?” is Yes" */
export function describeRule(document: FormDocument, rule: FormCondition): string {
  const isScore = rule.subject === SCORE_SUBJECT;
  const field = isScore ? undefined : document.fields.find((item) => item.id === rule.subject);
  if (!isScore && !field) return "a deleted question";
  const subject = isScore ? "Score" : subjectName(document, field as FormField);
  const operator = OPERATOR_LABELS[rule.operator] ?? rule.operator;
  if (PRESENCE.has(rule.operator)) return `${subject} ${operator}`;
  let value: string;
  if (typeof rule.value === "boolean") value = rule.value ? "Yes" : "No";
  else if (field?.options?.length) {
    const ids = Array.isArray(rule.value) ? rule.value : [String(rule.value ?? "")];
    value = ids.map((id) => `“${optionName(field, id)}”`).join(", ") || "nothing";
  } else if (Array.isArray(rule.value)) value = rule.value.join(", ");
  else value = rule.value === undefined || rule.value === "" ? "(empty)" : `${rule.value}`;
  if (
    field &&
    (field.type === "yes_no" || field.type === "consent") &&
    typeof rule.value === "string"
  ) {
    value = rule.value === "true" ? "Yes" : "No";
  }
  return `${subject} ${operator} ${value}`;
}

/** "When Q3 “Attending?” is Yes and Score is at least 6" (empty string when there are no rules). */
export function describeGroup(
  document: FormDocument,
  group: FormConditionGroup | undefined,
): string {
  if (!group?.rules.length) return "";
  const joiner = group.match === "any" ? " or " : " and ";
  return `When ${group.rules.map((rule) => describeRule(document, rule)).join(joiner)}`;
}

function subjectType(document: FormDocument, subject: string) {
  if (subject === SCORE_SUBJECT) return "score" as const;
  return document.fields.find((field) => field.id === subject)?.type;
}

/** A sensible starting value for `operator` on `field`. */
function defaultValue(
  field: FormField | undefined,
  operator: FormOperator,
): FormCondition["value"] {
  if (PRESENCE.has(operator)) return undefined;
  if (!field) return 0;
  if (field.options?.length) {
    const first = field.options[0].id;
    return LIST_OPERATORS.has(operator) || isMultiChoiceType(field.type, field) ? [first] : first;
  }
  if (field.type === "yes_no" || field.type === "consent") return true;
  if (["number", "rating", "opinion_scale", "nps", "slider"].includes(field.type)) {
    return field.min ?? (field.type === "rating" || field.type === "opinion_scale" ? 1 : 0);
  }
  return "";
}

/** Keeps a value when the operator changes, reshaping list/single where needed. */
function reshapeValue(
  field: FormField | undefined,
  operator: FormOperator,
  value: FormCondition["value"],
): FormCondition["value"] {
  if (PRESENCE.has(operator)) return undefined;
  if (field?.options?.length) {
    const wantsList = LIST_OPERATORS.has(operator) || isMultiChoiceType(field.type, field);
    if (wantsList)
      return Array.isArray(value) ? value : value ? [String(value)] : [field.options[0].id];
    return Array.isArray(value)
      ? (value[0] ?? field.options[0].id)
      : (value ?? field.options[0].id);
  }
  return value === undefined ? defaultValue(field, operator) : value;
}

function OptionChips({
  field,
  onChange,
  value,
  readOnly,
}: {
  field: FormField;
  onChange: (value: string[]) => void;
  value: string[];
  readOnly?: boolean;
}) {
  const options = [
    ...(field.options ?? []),
    ...(field.allowOther ? [{ id: OTHER_OPTION_ID, label: field.otherLabel || "Other" }] : []),
  ];
  return (
    <div aria-label="Options" className="flex flex-wrap gap-1" role="group">
      {options.map((option) => {
        const on = value.includes(option.id);
        return (
          <button
            aria-pressed={on}
            className={`inline-flex min-h-8 max-w-[14rem] items-center rounded-lg border px-2 text-xs font-semibold transition disabled:opacity-50 ${on ? "border-brand-blue bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20" : "border-[#d9dfeb] text-[#5d687d] hover:border-brand-blue/50 dark:border-white/10 dark:text-white/60"}`}
            disabled={readOnly}
            key={option.id}
            onClick={() =>
              onChange(on ? value.filter((id) => id !== option.id) : [...value, option.id])
            }
            type="button"
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ValueEditor({
  field,
  isScore,
  onChange,
  rule,
  readOnly,
}: {
  field: FormField | undefined;
  isScore: boolean;
  onChange: (value: FormCondition["value"]) => void;
  rule: FormCondition;
  readOnly?: boolean;
}) {
  if (PRESENCE.has(rule.operator)) return null;
  if (
    isScore ||
    (field && ["number", "rating", "opinion_scale", "nps", "slider"].includes(field.type))
  ) {
    return (
      <input
        aria-label="Value"
        className={`${smallInputClass} sm:w-28`}
        disabled={readOnly}
        inputMode="decimal"
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(event.target.value === "" || !Number.isFinite(parsed) ? 0 : parsed);
        }}
        type="number"
        value={typeof rule.value === "number" ? rule.value : Number(rule.value ?? 0) || 0}
      />
    );
  }
  if (!field) return null;
  if (field.type === "yes_no" || field.type === "consent") {
    const current = rule.value === true || rule.value === "true" ? "yes" : "no";
    return (
      <Segmented<"yes" | "no">
        label="Value"
        onChange={(next) => onChange(next === "yes")}
        options={[
          { value: "yes", label: field.type === "consent" ? "Agreed" : "Yes" },
          { value: "no", label: field.type === "consent" ? "Not agreed" : "No" },
        ]}
        size="sm"
        value={current}
      />
    );
  }
  if (field.options?.length) {
    const list = LIST_OPERATORS.has(rule.operator) || isMultiChoiceType(field.type, field);
    if (list) {
      const value = Array.isArray(rule.value) ? rule.value : rule.value ? [String(rule.value)] : [];
      return <OptionChips field={field} onChange={onChange} readOnly={readOnly} value={value} />;
    }
    return (
      <select
        aria-label="Option"
        className={`${smallInputClass} sm:max-w-[16rem]`}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        value={String(Array.isArray(rule.value) ? rule.value[0] : (rule.value ?? ""))}
      >
        {field.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {field.allowOther ? (
          <option value={OTHER_OPTION_ID}>{field.otherLabel || "Other"}</option>
        ) : null}
      </select>
    );
  }
  if (field.type === "date" || field.type === "datetime") {
    return (
      <input
        aria-label="Date"
        className={`${smallInputClass} sm:w-52`}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        type={field.type === "date" ? "date" : "datetime-local"}
        value={typeof rule.value === "string" ? rule.value : ""}
      />
    );
  }
  return (
    <input
      aria-label="Value"
      className={`${smallInputClass} sm:w-48`}
      disabled={readOnly}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Text to compare"
      type="text"
      value={
        typeof rule.value === "string"
          ? rule.value
          : rule.value === undefined
            ? ""
            : String(rule.value)
      }
    />
  );
}

const RuleRow = memo(function RuleRow({
  allowScore,
  document,
  index,
  onChange,
  onRemove,
  readOnly,
  rule,
  subjects,
}: {
  allowScore?: boolean;
  document: FormDocument;
  index: number;
  onChange: (index: number, rule: FormCondition) => void;
  onRemove: (index: number) => void;
  readOnly?: boolean;
  rule: FormCondition;
  subjects: ReturnType<typeof ruleSubjects>;
}) {
  const isScore = rule.subject === SCORE_SUBJECT;
  const known = isScore
    ? allowScore
    : subjects.some((subject) => subject.field.id === rule.subject);
  const field = isScore ? undefined : document.fields.find((item) => item.id === rule.subject);

  if (!known) {
    return (
      <li className="flex items-center gap-2 rounded-xl border border-brand-yellow/50 bg-brand-yellow-50 px-3 py-2 text-xs text-[#8a6412] dark:bg-brand-yellow/10 dark:text-brand-yellow">
        <Warning className="shrink-0" size={15} weight="fill" />
        <span className="min-w-0 flex-1">
          {isScore
            ? "This rule looks at the score, but scoring is off."
            : field
              ? "This rule refers to a question that comes later or can't be answered here."
              : "This rule refers to a question that was deleted."}
        </span>
        {readOnly ? null : (
          <button
            className="shrink-0 rounded-lg px-2 py-1 font-semibold hover:bg-brand-yellow/20"
            onClick={() => onRemove(index)}
            type="button"
          >
            Remove
          </button>
        )}
      </li>
    );
  }

  const type = subjectType(document, rule.subject);
  const operators = type ? operatorsFor(type) : [];

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-[#e3e7f0] bg-[#fbfcfe] p-2.5 sm:flex-row sm:flex-wrap sm:items-center dark:border-white/10 dark:bg-white/[0.025]">
      <select
        aria-label={`Rule ${index + 1} question`}
        className={`${smallInputClass} min-w-0 sm:max-w-[15rem] sm:flex-1`}
        disabled={readOnly}
        onChange={(event) => {
          const subject = event.target.value;
          const nextType = subjectType(document, subject);
          const nextField = document.fields.find((item) => item.id === subject);
          const operator = nextType ? operatorsFor(nextType)[0] : "equals";
          onChange(index, { subject, operator, value: defaultValue(nextField, operator) });
        }}
        value={rule.subject}
      >
        {allowScore ? <option value={SCORE_SUBJECT}>Score</option> : null}
        {subjects.map((subject) => (
          <option key={subject.field.id} value={subject.field.id}>
            {subject.number
              ? `Q${subject.number}. `
              : subject.field.type === "hidden"
                ? "Hidden: "
                : ""}
            {shortLabel(
              subject.field.label ||
                (subject.field.type === "hidden" ? (subject.field.prefillParam ?? "") : "Untitled"),
              48,
            )}
          </option>
        ))}
      </select>
      <select
        aria-label={`Rule ${index + 1} comparison`}
        className={`${smallInputClass} sm:w-44`}
        disabled={readOnly}
        onChange={(event) => {
          const operator = event.target.value as FormOperator;
          onChange(index, { ...rule, operator, value: reshapeValue(field, operator, rule.value) });
        }}
        value={rule.operator}
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {OPERATOR_LABELS[operator]}
          </option>
        ))}
      </select>
      <div className="min-w-0 sm:flex-1">
        <ValueEditor
          field={field}
          isScore={isScore}
          onChange={(value) => onChange(index, { ...rule, value })}
          readOnly={readOnly}
          rule={rule}
        />
      </div>
      {readOnly ? null : (
        <button
          aria-label={`Remove rule ${index + 1}`}
          className={`${iconButtonClass} self-end sm:self-auto hover:!text-brand-red`}
          onClick={() => onRemove(index)}
          type="button"
        >
          <Trash size={15} />
        </button>
      )}
    </li>
  );
});

export type RuleBuilderProps = {
  document: FormDocument;
  value: FormConditionGroup | undefined;
  /** Receives undefined when no rules are left. */
  onChange: (value: FormConditionGroup | undefined) => void;
  /** Only questions at a fields index lower than this can be subjects (undefined = every question). */
  beforeIndex?: number;
  /** Offer "Score" ($score) as a subject. */
  allowScore?: boolean;
  /** Title shown above ("Show this question when"). */
  label: string;
  emptyHint?: string;
  readOnly?: boolean;
};

/**
 * Edits one condition group: pick a question (or the score), a comparison
 * that fits its type, and a value editor that fits too; all/any toggle.
 */
export function RuleBuilder({
  allowScore,
  beforeIndex,
  document,
  emptyHint,
  label,
  onChange,
  readOnly,
  value,
}: RuleBuilderProps) {
  const labelId = useId();
  const subjects = useMemo(() => ruleSubjects(document, beforeIndex), [beforeIndex, document]);
  const rules = value?.rules ?? [];
  const match = value?.match ?? "all";

  const emit = (nextRules: FormCondition[], nextMatch = match) =>
    onChange(nextRules.length ? { match: nextMatch, rules: nextRules } : undefined);

  const addRule = () => {
    const first = subjects[subjects.length - 1];
    if (first) {
      const operator = operatorsFor(first.field.type)[0];
      emit([
        ...rules,
        { subject: first.field.id, operator, value: defaultValue(first.field, operator) },
      ]);
    } else if (allowScore) {
      emit([...rules, { subject: SCORE_SUBJECT, operator: "gte", value: 0 }]);
    }
  };

  const canAdd =
    !readOnly && rules.length < FORM_LIMITS.conditionsMax && (subjects.length > 0 || allowScore);

  return (
    <div aria-labelledby={labelId} className="space-y-2.5" role="group">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={eyebrowClass} id={labelId}>
          {label}
        </p>
        {rules.length > 1 ? (
          <Segmented<"all" | "any">
            label="How rules combine"
            onChange={(next) => emit(rules, next)}
            options={[
              { value: "all", label: "Match all rules" },
              { value: "any", label: "Match any rule" },
            ]}
            size="sm"
            value={match}
          />
        ) : null}
      </div>
      {rules.length ? (
        <ul className="space-y-1.5">
          {rules.map((rule, index) => (
            <RuleRow
              allowScore={allowScore}
              document={document}
              index={index}
              key={index}
              onChange={(position, next) =>
                emit(rules.map((item, itemIndex) => (itemIndex === position ? next : item)))
              }
              onRemove={(position) => emit(rules.filter((_, itemIndex) => itemIndex !== position))}
              readOnly={readOnly}
              rule={rule}
              subjects={subjects}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-5 text-[#8490a5] dark:text-white/40">
          {emptyHint ?? "No rules yet."}
        </p>
      )}
      {canAdd ? (
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-[#c6cedd] px-2.5 text-xs font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/15 dark:text-white/55"
          onClick={addRule}
          type="button"
        >
          <Plus size={13} weight="bold" />
          Add rule
        </button>
      ) : !readOnly && !subjects.length && !allowScore ? (
        <p className="text-xs text-[#9ba4b5]">Add a question before this one to build a rule.</p>
      ) : null}
    </div>
  );
}
