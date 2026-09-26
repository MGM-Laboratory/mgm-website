"use client";

import { useMemo, type CSSProperties } from "react";
import { CalendarDays, Check, Clock3, Pipette } from "lucide-react";
import { ADDRESS_PARTS } from "@repo/shared";

import { countries, matchCountry } from "@/lib/forms/public-countries";

import { Combobox } from "../controls/combobox";
import { useFormController, type FieldProps } from "../form-context";
import { RichText } from "../rich-text";

/**
 * Dates and times (native pickers, styled), and the structured answers:
 * name, address, country (ISO codes, searchable, never flags), colour and
 * consent.
 */

export function DateField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string>) {
  return (
    <div className="fx-input fx-affix fx-date">
      <CalendarDays aria-hidden strokeWidth={2.25} size={18} className="fx-affix-icon" />
      <input
        id={inputId}
        type="date"
        value={typeof value === "string" ? value : ""}
        min={field.minDate}
        max={field.maxDate}
        onChange={(event) => onChange(event.target.value || undefined)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={field.required || undefined}
      />
    </div>
  );
}

export function TimeField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string>) {
  return (
    <div className="fx-input fx-affix fx-date">
      <Clock3 aria-hidden strokeWidth={2.25} size={18} className="fx-affix-icon" />
      <input
        id={inputId}
        type="time"
        value={typeof value === "string" ? value : ""}
        onChange={(event) =>
          onChange(event.target.value ? event.target.value.slice(0, 5) : undefined)
        }
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={field.required || undefined}
      />
    </div>
  );
}

export function DateTimeField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string>) {
  return (
    <div className="fx-input fx-affix fx-date">
      <CalendarDays aria-hidden strokeWidth={2.25} size={18} className="fx-affix-icon" />
      <input
        id={inputId}
        type="datetime-local"
        value={typeof value === "string" ? value : ""}
        min={field.minDate ? `${field.minDate}T00:00` : undefined}
        max={field.maxDate ? `${field.maxDate}T23:59` : undefined}
        onChange={(event) =>
          onChange(event.target.value ? event.target.value.slice(0, 16) : undefined)
        }
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={field.required || undefined}
      />
    </div>
  );
}

type Parts = Record<string, string>;

function partsOf(value: unknown): Parts {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Parts) : {};
}

function withPart(parts: Parts, key: string, text: string) {
  const next = { ...parts };
  if (text) next[key] = text;
  else delete next[key];
  return Object.values(next).some((part) => part.trim()) ? next : undefined;
}

export function NameField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<Parts>) {
  const { copy } = useFormController();
  const parts = partsOf(value);
  return (
    <div className="fx-pair">
      {(["first", "last"] as const).map((part) => (
        <div key={part} className="fx-subfield">
          <label
            htmlFor={part === "first" ? inputId : `${inputId}-${part}`}
            className="fx-sublabel"
          >
            {part === "first" ? copy.first : copy.last}
          </label>
          <input
            id={part === "first" ? inputId : `${inputId}-${part}`}
            className="fx-input"
            type="text"
            value={parts[part] ?? ""}
            maxLength={200}
            autoComplete={part === "first" ? "given-name" : "family-name"}
            onChange={(event) => onChange(withPart(parts, part, event.target.value))}
            aria-invalid={(invalid && part === "first") || undefined}
            aria-describedby={describedBy}
            aria-required={(field.required && part === "first") || undefined}
          />
        </div>
      ))}
    </div>
  );
}

const ADDRESS_AUTOCOMPLETE: Record<(typeof ADDRESS_PARTS)[number], string> = {
  line1: "address-line1",
  line2: "address-line2",
  city: "address-level2",
  region: "address-level1",
  postal: "postal-code",
  country: "country",
};

function CountryPicker({
  inputId,
  value,
  onChange,
  describedBy,
  invalid,
  required,
  placeholder,
}: {
  inputId: string;
  value: string | undefined;
  onChange: (code: string | undefined) => void;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const { copy, language, labels } = useFormController();
  const list = useMemo(
    () =>
      countries(language).map((country) => ({
        id: country.code,
        label: country.name,
        hint: country.code,
      })),
    [language],
  );
  const byCode = useMemo(
    () => new Map(countries(language).map((country) => [country.code, country])),
    [language],
  );
  return (
    <Combobox
      inputId={inputId}
      options={list}
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? labels.selectPlaceholder}
      noMatches={copy.noMatches}
      describedBy={describedBy}
      invalid={invalid}
      required={required}
      filter={(option, query) => {
        const country = byCode.get(option.id);
        return country ? matchCountry(country, query) : false;
      }}
    />
  );
}

export function AddressField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<Parts>) {
  const { copy } = useFormController();
  const parts = partsOf(value);
  return (
    <div className="fx-address">
      {ADDRESS_PARTS.map((part) => {
        const id = part === "line1" ? inputId : `${inputId}-${part}`;
        return (
          <div key={part} className="fx-subfield" data-part={part}>
            <label htmlFor={id} className="fx-sublabel">
              {copy.addressParts[part]}
            </label>
            {part === "country" ? (
              <CountryPicker
                inputId={id}
                value={parts.country}
                onChange={(code) => onChange(withPart(parts, "country", code ?? ""))}
                describedBy={describedBy}
              />
            ) : (
              <input
                id={id}
                className="fx-input"
                type="text"
                value={parts[part] ?? ""}
                maxLength={300}
                autoComplete={ADDRESS_AUTOCOMPLETE[part]}
                onChange={(event) => onChange(withPart(parts, part, event.target.value))}
                aria-invalid={(invalid && part === "line1") || undefined}
                aria-describedby={describedBy}
                aria-required={(field.required && part === "line1") || undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CountryField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  onComplete,
}: FieldProps<string>) {
  return (
    <CountryPicker
      inputId={inputId}
      value={typeof value === "string" ? value : undefined}
      onChange={(code) => {
        onChange(code);
        if (code) onComplete?.();
      }}
      describedBy={describedBy}
      invalid={invalid}
      required={field.required}
      placeholder={field.placeholder}
    />
  );
}

const SWATCHES = [
  "#3a6dc5",
  "#f94141",
  "#f7bf33",
  "#0f8657",
  "#0e1116",
  "#ffffff",
  "#7ea4ea",
  "#ff9b9b",
  "#fde39a",
  "#8fd6b4",
  "#6b7280",
  "#d8d8d2",
];

export function ColorField({
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  field,
}: FieldProps<string>) {
  const { copy, sound } = useFormController();
  const current = typeof value === "string" ? value.toLowerCase() : undefined;
  const custom = current && !SWATCHES.includes(current);
  const name = `fx-${field.id}`;
  return (
    <div
      className="fx-colors"
      role="radiogroup"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      {SWATCHES.map((swatch, index) => (
        <label
          key={swatch}
          className="fx-swatch"
          data-checked={current === swatch ? "" : undefined}
          style={{ ["--swatch" as string]: swatch } as CSSProperties}
        >
          <input
            type="radio"
            name={name}
            className="fx-choice-input"
            checked={current === swatch}
            onChange={() => {
              onChange(swatch);
              sound("select");
            }}
            aria-label={swatch}
            id={index === 0 ? inputId : undefined}
          />
          <span className="fx-swatch-chip" aria-hidden>
            {current === swatch ? <Check strokeWidth={3} size={16} /> : null}
          </span>
        </label>
      ))}
      <label className="fx-swatch fx-swatch-custom" data-checked={custom ? "" : undefined}>
        <input
          type="color"
          value={current ?? "#3a6dc5"}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          aria-label={copy.customColor}
        />
        <span
          className="fx-swatch-chip"
          aria-hidden
          style={custom ? ({ ["--swatch" as string]: current } as CSSProperties) : undefined}
        >
          <Pipette strokeWidth={2.25} size={16} />
        </span>
        <span className="fx-swatch-text">{custom ? current : copy.customColor}</span>
      </label>
    </div>
  );
}

export function ConsentField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  onComplete,
}: FieldProps<boolean>) {
  const { pipe } = useFormController();
  return (
    <label className="fx-consent" data-checked={value === true ? "" : undefined}>
      <input
        id={inputId}
        type="checkbox"
        className="fx-choice-input"
        checked={value === true}
        onChange={(event) => {
          onChange(event.target.checked ? true : undefined);
          if (event.target.checked) onComplete?.();
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={field.required || undefined}
      />
      <span className="fx-consent-box" aria-hidden>
        <Check strokeWidth={3} size={16} />
      </span>
      <span className="fx-consent-text">
        {field.consentText ? (
          <RichText doc={field.consentText} transform={pipe} />
        ) : (
          pipe(field.label)
        )}
      </span>
    </label>
  );
}
