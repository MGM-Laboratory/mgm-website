"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Sparkles } from "lucide-react";
import { FORM_LIMITS } from "@repo/shared";

import { countries } from "@/lib/forms/public-countries";
import { emailSuggestion } from "@/lib/forms/public-email";

import { useFormController, type FieldProps } from "../form-context";

/**
 * The text family: short and long text, email (with a nudge for a mistyped
 * domain), link, number (prefix, suffix, steppers) and phone (a calling
 * code and the number).
 */

function Counter({ length, max, id }: { length: number; max: number; id: string }) {
  const { copy } = useFormController();
  const near = length / max > 0.9;
  return (
    <span id={id} className="fx-counter" data-near={near ? "" : undefined} aria-live="polite">
      {copy.chars(length, max)}
    </span>
  );
}

/** The format mask as a hint: `#` a digit, `A` a letter (first alternative only). */
function maskHint(mask: string | undefined) {
  if (!mask) return undefined;
  const first = mask.split(" | ")[0] ?? "";
  return first.replace(/\\(.)/g, "$1").replace(/#/g, "0").replace(/\*/g, "x");
}

export function ShortText({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string>) {
  const text = typeof value === "string" ? value : "";
  const max = field.maxLength;
  const counterId = `${inputId}-count`;
  return (
    <div className="fx-input-wrap">
      <input
        id={inputId}
        className="fx-input"
        type="text"
        value={text}
        maxLength={max ?? FORM_LIMITS.textAnswerMax}
        placeholder={field.placeholder ?? maskHint(field.pattern)}
        onChange={(event) => onChange(event.target.value || undefined)}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [describedBy, max ? counterId : null].filter(Boolean).join(" ") || undefined
        }
        aria-required={field.required || undefined}
        autoComplete="off"
        spellCheck
      />
      {max ? <Counter length={text.length} max={max} id={counterId} /> : null}
    </div>
  );
}

export function LongText({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  conversational,
  onComplete,
}: FieldProps<string>) {
  const { copy } = useFormController();
  const text = typeof value === "string" ? value : "";
  const ref = useRef<HTMLTextAreaElement>(null);
  const max = field.maxLength;
  const counterId = `${inputId}-count`;

  // Grows with its text (CSS field-sizing where supported, a measure elsewhere).
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || CSS.supports("field-sizing", "content")) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [text]);

  return (
    <div className="fx-input-wrap">
      <textarea
        ref={ref}
        id={inputId}
        className="fx-input fx-textarea"
        rows={field.rows ?? (conversational ? 3 : 4)}
        value={text}
        maxLength={max ?? FORM_LIMITS.textAnswerMax}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value || undefined)}
        onKeyDown={(event) => {
          if (
            conversational &&
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            onComplete?.();
          }
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [describedBy, max ? counterId : null].filter(Boolean).join(" ") || undefined
        }
        aria-required={field.required || undefined}
      />
      <div className="fx-input-foot">
        {conversational ? <span className="fx-key-hint">{copy.shiftEnter}</span> : <span />}
        {max ? <Counter length={text.length} max={max} id={counterId} /> : null}
      </div>
    </div>
  );
}

export function EmailField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string>) {
  const { copy } = useFormController();
  const text = typeof value === "string" ? value : "";
  const [checked, setChecked] = useState("");
  const suggestion = checked && checked === text ? emailSuggestion(text) : null;
  const suggestionId = `${inputId}-suggestion`;
  return (
    <div className="fx-input-wrap">
      <input
        id={inputId}
        className="fx-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        value={text}
        placeholder={field.placeholder ?? "name@example.com"}
        onChange={(event) => onChange(event.target.value.trim() ? event.target.value : undefined)}
        onBlur={() => setChecked(text)}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [describedBy, suggestion ? suggestionId : null].filter(Boolean).join(" ") || undefined
        }
        aria-required={field.required || undefined}
      />
      <p id={suggestionId} className="fx-suggestion" aria-live="polite">
        {suggestion ? (
          <>
            <Sparkles aria-hidden strokeWidth={2.25} size={15} />
            <span>{copy.didYouMean(suggestion)}</span>
            <button
              type="button"
              className="fx-link-button"
              onClick={() => {
                onChange(suggestion);
                setChecked("");
              }}
            >
              {copy.useSuggestion}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

export function UrlField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string>) {
  const text = typeof value === "string" ? value : "";
  return (
    <input
      id={inputId}
      className="fx-input"
      type="url"
      inputMode="url"
      autoComplete="url"
      spellCheck={false}
      value={text}
      placeholder={field.placeholder ?? "https://"}
      onChange={(event) => onChange(event.target.value.trim() ? event.target.value : undefined)}
      onBlur={() => {
        // A bare domain gets its scheme, so "labmgm.org" counts as a link.
        const trimmed = text.trim();
        if (trimmed && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && /\.[a-z]{2,}/i.test(trimmed)) {
          onChange(`https://${trimmed}`);
        }
      }}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={field.required || undefined}
    />
  );
}

function roundTo(value: number, decimals: number | undefined) {
  if (decimals === undefined) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function NumberField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<number>) {
  const { copy, language } = useFormController();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === "number" ? String(value) : "");
  const step = field.step ?? 1;

  const commit = (text: string) => {
    const normalized = text.replace(/\s/g, "").replace(",", ".");
    if (!normalized) {
      onChange(undefined);
      return;
    }
    const number = Number(normalized);
    if (Number.isFinite(number)) onChange(roundTo(number, field.decimals));
  };
  const nudge = (direction: 1 | -1) => {
    const base =
      typeof value === "number" ? value : (field.min ?? 0) - (direction > 0 ? step : -step);
    let next = roundTo(
      base + direction * step,
      field.decimals ?? String(step).split(".")[1]?.length ?? 0,
    );
    if (field.min !== undefined) next = Math.max(field.min, next);
    if (field.max !== undefined) next = Math.min(field.max, next);
    setDraft(null);
    onChange(next);
  };

  return (
    <div className="fx-number">
      <button
        type="button"
        className="fx-stepper"
        aria-label={copy.decrease}
        onClick={() => nudge(-1)}
        disabled={typeof value === "number" && field.min !== undefined && value <= field.min}
      >
        <Minus aria-hidden strokeWidth={2.25} size={18} />
      </button>
      <div className="fx-input fx-affix">
        {field.prefix ? <span className="fx-affix-part">{field.prefix}</span> : null}
        <input
          id={inputId}
          type="text"
          inputMode={field.decimals === 0 ? "numeric" : "decimal"}
          value={shown}
          placeholder={field.placeholder ?? (field.min !== undefined ? String(field.min) : "0")}
          onChange={(event) => {
            const text = event.target.value;
            if (!/^-?[\d\s.,]*$/.test(text)) return;
            setDraft(text);
            commit(text);
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              nudge(1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              nudge(-1);
            }
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={field.required || undefined}
          lang={language}
        />
        {field.suffix ? <span className="fx-affix-part">{field.suffix}</span> : null}
      </div>
      <button
        type="button"
        className="fx-stepper"
        aria-label={copy.increase}
        onClick={() => nudge(1)}
        disabled={typeof value === "number" && field.max !== undefined && value >= field.max}
      >
        <Plus aria-hidden strokeWidth={2.25} size={18} />
      </button>
    </div>
  );
}

/** "+62 812 3456" → the country whose calling code prefixes it, and the rest. */
function splitPhone(value: string, fallbackCode: string, language: string) {
  const list = countries(language);
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    const match = [...list]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((country) => trimmed.startsWith(country.dial));
    if (match) {
      const sameDial = list.find(
        (country) => country.code === fallbackCode && country.dial === match.dial,
      );
      return { code: (sameDial ?? match).code, number: trimmed.slice(match.dial.length).trim() };
    }
  }
  return { code: fallbackCode, number: trimmed };
}

export function PhoneField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string>) {
  const { copy, language } = useFormController();
  const list = useMemo(() => countries(language), [language]);
  const fallback = (field.defaultCountry ?? "ID").toUpperCase();
  const current = typeof value === "string" ? value : "";
  const [selected, setSelected] = useState<string | null>(null);
  const parts = splitPhone(current, selected ?? fallback, language);
  const code = selected ?? parts.code;
  const dial = list.find((country) => country.code === code)?.dial ?? "+62";

  const emit = (nextCode: string, number: string) => {
    const nextDial = list.find((country) => country.code === nextCode)?.dial ?? dial;
    const digits = number.replace(/[^\d\s().-]/g, "");
    onChange(digits.trim() ? `${nextDial} ${digits.trim()}` : undefined);
  };

  return (
    <div className="fx-phone" role="group" aria-label={copy.phoneNumber}>
      <label className="fx-sr-only" htmlFor={`${inputId}-country`}>
        {copy.countryCode}
      </label>
      <div className="fx-input fx-select-native">
        <select
          id={`${inputId}-country`}
          value={code}
          onChange={(event) => {
            setSelected(event.target.value);
            emit(event.target.value, parts.number);
          }}
          autoComplete="tel-country-code"
        >
          {list.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name} ({country.dial})
            </option>
          ))}
        </select>
        <span className="fx-select-shown" aria-hidden>
          {code} {dial}
        </span>
      </div>
      <input
        id={inputId}
        className="fx-input"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={parts.number}
        placeholder={field.placeholder ?? "812 3456 7890"}
        onChange={(event) => emit(code, event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={field.required || undefined}
      />
    </div>
  );
}
