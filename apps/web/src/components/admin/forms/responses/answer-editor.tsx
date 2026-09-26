"use client";

import { useEffect, useRef, useState } from "react";
import { OTHER_OPTION_ID, optionLabel, type FormAnswerValue, type FormAnswers } from "@repo/shared";

import { answerValue, type DataColumn } from "@/lib/forms/data/columns";

const editorInput =
  "w-full rounded-lg border border-brand-blue bg-white px-2 py-1 text-sm text-[#171b25] outline-none ring-4 ring-brand-blue/10 dark:bg-[#1c212a] dark:text-white";

/** Where an answer column's value lives in the answers object. */
export function answerKeyOf(column: DataColumn) {
  return column.answer?.part?.kind === "other"
    ? column.key
    : (column.answer?.fieldId ?? column.key);
}

/** The answers with one cell replaced (or removed when `value` is undefined). */
export function withAnswer(
  answers: FormAnswers,
  column: DataColumn,
  value: FormAnswerValue | undefined,
): FormAnswers {
  const key = answerKeyOf(column);
  const next = { ...answers };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/**
 * A type-aware editor for one answer cell. Enter (or Ctrl/Cmd+Enter in
 * long text) saves, Escape cancels, blurring saves.
 */
export function AnswerEditor({
  column,
  answers,
  onCommit,
  onCancel,
  compact = true,
}: {
  column: DataColumn;
  answers: FormAnswers;
  onCommit: (value: FormAnswerValue | undefined) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const field = column.field;
  const original = answerValue(column, answers);
  const isOther = column.answer?.part?.kind === "other";
  const [text, setText] = useState(() => {
    if (original === undefined || original === null) return "";
    if (field?.type === "name" && typeof original === "object" && !Array.isArray(original)) {
      const parts = original as Record<string, string>;
      return [parts.first, parts.last].filter(Boolean).join(" ");
    }
    return typeof original === "object" ? "" : String(original);
  });
  const [multi, setMulti] = useState<string[]>(() =>
    Array.isArray(original) ? original.map(String) : [],
  );
  const committed = useRef(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current as HTMLInputElement | null;
    element?.focus();
    if (element && "select" in element && typeof element.select === "function") element.select();
  }, []);

  if (!field) return null;
  const type = isOther ? "short_text" : field.type;

  const commit = (value: FormAnswerValue | undefined) => {
    if (committed.current) return;
    committed.current = true;
    onCommit(value);
  };

  const fromText = (): FormAnswerValue | undefined => {
    const value = text;
    if (!value.trim()) return undefined;
    switch (type) {
      case "number":
      case "rating":
      case "opinion_scale":
      case "nps":
      case "slider": {
        const number = Number(value.replace(",", "."));
        return Number.isFinite(number) ? number : (original as FormAnswerValue);
      }
      case "name": {
        const [first, ...rest] = value.trim().split(/\s+/);
        return { first, last: rest.join(" ") };
      }
      case "country":
        return value.trim().toUpperCase().slice(0, 2);
      default:
        return value;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      committed.current = true;
      onCancel();
    } else if (event.key === "Enter" && (type !== "long_text" || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (
        type === "checkboxes" ||
        type === "multiselect" ||
        (type === "picture_choice" && Array.isArray(original))
      )
        commit(multi.length ? multi : undefined);
      else commit(fromText());
    }
  };

  const options = [
    ...(field.options ?? []).map((option) => ({ id: option.id, label: option.label })),
    ...(field.allowOther
      ? [{ id: OTHER_OPTION_ID, label: optionLabel(field, OTHER_OPTION_ID) }]
      : []),
  ];

  switch (type) {
    case "multiple_choice":
    case "dropdown":
    case "picture_choice":
      if (!Array.isArray(original)) {
        return (
          <select
            className={editorInput}
            defaultValue={typeof original === "string" ? original : ""}
            onBlur={(event) => {
              commit(event.target.value || undefined);
            }}
            onChange={(event) => {
              commit(event.target.value || undefined);
            }}
            onKeyDown={onKeyDown}
            ref={(element) => {
              ref.current = element;
            }}
          >
            <option value="">(no answer)</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }
    // falls through to the multi editor for multi picture choice
    case "checkboxes":
    case "multiselect":
      return (
        <div
          className={`${editorInput} ${compact ? "max-h-56 overflow-auto shadow-xl" : ""} space-y-1 py-2`}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              commit(multi.length ? multi : undefined);
          }}
          onKeyDown={onKeyDown}
          ref={(element) => {
            ref.current = element?.querySelector("input") ?? null;
          }}
        >
          {options.map((option) => (
            <label className="flex items-center gap-2 text-sm" key={option.id}>
              <input
                checked={multi.includes(option.id)}
                className="size-4 accent-brand-blue"
                onChange={(event) => {
                  setMulti((current) =>
                    event.target.checked
                      ? [...current, option.id]
                      : current.filter((id) => id !== option.id),
                  );
                }}
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
          <p className="pt-1 text-[10px] text-[#8a93a6]">Enter saves · Esc cancels</p>
        </div>
      );
    case "yes_no":
    case "consent":
      return (
        <select
          className={editorInput}
          defaultValue={original === true ? "true" : original === false ? "false" : ""}
          onBlur={(event) => {
            commit(event.target.value === "" ? undefined : event.target.value === "true");
          }}
          onChange={(event) => {
            commit(event.target.value === "" ? undefined : event.target.value === "true");
          }}
          onKeyDown={onKeyDown}
          ref={(element) => {
            ref.current = element;
          }}
        >
          <option value="">(no answer)</option>
          <option value="true">{type === "consent" ? "Agreed" : "Yes"}</option>
          {type === "yes_no" ? <option value="false">No</option> : null}
        </select>
      );
    case "long_text":
      return (
        <textarea
          className={`${editorInput} ${compact ? "min-h-28 shadow-xl" : "min-h-32"}`}
          onBlur={() => {
            commit(fromText());
          }}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={onKeyDown}
          ref={(element) => {
            ref.current = element;
          }}
          value={text}
        />
      );
    default: {
      const inputType =
        type === "number" ||
        type === "rating" ||
        type === "opinion_scale" ||
        type === "nps" ||
        type === "slider"
          ? "number"
          : type === "date"
            ? "date"
            : type === "datetime"
              ? "datetime-local"
              : type === "time"
                ? "time"
                : type === "email"
                  ? "email"
                  : type === "url"
                    ? "url"
                    : type === "phone"
                      ? "tel"
                      : "text";
      return (
        <span className="flex items-center gap-1.5">
          {type === "color" ? (
            <input
              aria-label="Pick a colour"
              className="h-7 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              onChange={(event) => {
                setText(event.target.value);
              }}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(text) ? text : "#000000"}
            />
          ) : null}
          <input
            className={editorInput}
            max={field.max}
            min={field.min}
            onBlur={() => {
              commit(fromText());
            }}
            onChange={(event) => {
              setText(event.target.value);
            }}
            onKeyDown={onKeyDown}
            ref={(element) => {
              ref.current = element;
            }}
            step={field.step ?? (inputType === "number" ? "any" : undefined)}
            type={inputType}
            value={text}
          />
        </span>
      );
    }
  }
}
