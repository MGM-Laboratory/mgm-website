"use client";

import { useState, type CSSProperties } from "react";
import { Circle, Heart, Smile, Star, ThumbsUp, Zap, type LucideIcon } from "lucide-react";
import type { RatingIcon } from "@repo/shared";

import { useFormController, type FieldProps } from "../form-context";

/**
 * The scale family: rating (icons in discs, with a hover preview), opinion
 * scale, NPS (colour shifting from red to green), the slider with its value
 * bubble, and the matrix (a grid on wide screens, stacked rows on phones).
 * Every choice is a native radio or checkbox underneath, so arrows, Space
 * and screen readers work as usual.
 */

const RATING_ICONS: Record<RatingIcon, LucideIcon> = {
  star: Star,
  heart: Heart,
  circle: Circle,
  thumb: ThumbsUp,
  bolt: Zap,
  smile: Smile,
};

export function Rating({
  field,
  value,
  onChange,
  describedBy,
  invalid,
  onComplete,
}: FieldProps<number>) {
  const { sound } = useFormController();
  const count = Math.min(10, Math.max(3, field.max ?? 5));
  const Icon = RATING_ICONS[field.ratingIcon ?? "star"];
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? (typeof value === "number" ? value : 0);
  const name = `fx-${field.id}`;
  return (
    <div
      className="fx-rating"
      role="radiogroup"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onPointerLeave={() => {
        setHover(null);
      }}
    >
      {Array.from({ length: count }, (_, index) => {
        const rating = index + 1;
        return (
          <label
            key={rating}
            className="fx-rating-unit"
            data-lit={rating <= shown ? "" : undefined}
            data-preview={hover !== null && rating <= hover ? "" : undefined}
            data-choice-key={rating <= 9 ? String(rating) : undefined}
            style={{ ["--i" as string]: index } as CSSProperties}
            onPointerEnter={() => {
              setHover(rating);
            }}
          >
            <input
              type="radio"
              name={name}
              className="fx-choice-input"
              value={rating}
              checked={value === rating}
              onChange={() => {
                onChange(rating);
                sound("select");
                onComplete?.();
              }}
              aria-label={`${rating} / ${count}`}
            />
            <span className="fx-rating-disc" aria-hidden>
              <Icon strokeWidth={2.25} size={22} />
            </span>
          </label>
        );
      })}
      <span className="fx-rating-readout" aria-hidden>
        {shown ? `${shown} / ${count}` : ""}
      </span>
    </div>
  );
}

function ScaleRow({
  field,
  values,
  value,
  onChange,
  describedBy,
  invalid,
  tone,
  onComplete,
}: FieldProps<number> & { values: number[]; tone?: (value: number) => string }) {
  const { sound } = useFormController();
  const name = `fx-${field.id}`;
  return (
    <div className="fx-scale">
      <div
        className="fx-scale-row"
        role="radiogroup"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        style={{ ["--count" as string]: values.length } as CSSProperties}
      >
        {values.map((number) => (
          <label
            key={number}
            className="fx-scale-cell"
            data-checked={value === number ? "" : undefined}
            data-tone={tone?.(number)}
            data-choice-key={
              values.length <= 10 && number >= 0 && number <= 9 ? String(number) : undefined
            }
          >
            <input
              type="radio"
              name={name}
              className="fx-choice-input"
              value={number}
              checked={value === number}
              onChange={() => {
                onChange(number);
                sound("select");
                onComplete?.();
              }}
            />
            <span>{number}</span>
          </label>
        ))}
      </div>
      {field.minLabel || field.midLabel || field.maxLabel ? (
        <div className="fx-scale-labels" aria-hidden>
          <span>{field.minLabel}</span>
          <span>{field.midLabel}</span>
          <span>{field.maxLabel}</span>
        </div>
      ) : null}
      {field.minLabel || field.maxLabel ? (
        <p className="fx-sr-only">
          {values[0]}: {field.minLabel ?? ""}. {values[values.length - 1]}: {field.maxLabel ?? ""}.
        </p>
      ) : null}
    </div>
  );
}

export function OpinionScale(props: FieldProps<number>) {
  const min = Math.max(0, Math.min(1, props.field.min ?? 1));
  const max = Math.min(10, Math.max(min + 2, props.field.max ?? 10));
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return <ScaleRow {...props} values={values} />;
}

export function Nps(props: FieldProps<number>) {
  const values = Array.from({ length: 11 }, (_, index) => index);
  return (
    <ScaleRow
      {...props}
      values={values}
      tone={(number) => (number <= 6 ? "red" : number <= 8 ? "yellow" : "green")}
    />
  );
}

export function Slider({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<number>) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? 1;
  const touched = typeof value === "number";
  const current = touched ? value : Math.round((min + max) / 2 / step) * step;
  const fraction = max > min ? (current - min) / (max - min) : 0;
  const format = (number: number) => `${field.prefix ?? ""}${number}${field.suffix ?? ""}`;
  return (
    <div
      className="fx-slider"
      data-touched={touched ? "" : undefined}
      style={{ ["--fraction" as string]: fraction } as CSSProperties}
    >
      <div className="fx-slider-track">
        <span className="fx-slider-fill" aria-hidden />
        <span className="fx-slider-bubble" aria-hidden>
          {format(current)}
        </span>
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
          onPointerDown={() => {
            if (!touched) onChange(current);
          }}
          aria-valuetext={format(current)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      </div>
      <div className="fx-scale-labels" aria-hidden>
        <span>{field.minLabel ?? format(min)}</span>
        <span>{field.midLabel}</span>
        <span>{field.maxLabel ?? format(max)}</span>
      </div>
    </div>
  );
}

export function Matrix({
  field,
  value,
  onChange,
  describedBy,
  invalid,
}: FieldProps<Record<string, string | string[]>>) {
  const { sound } = useFormController();
  const rows = field.rowsList ?? [];
  const columns = field.columnsList ?? [];
  const multiple = Boolean(field.matrixMultiple);
  const cells = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const set = (rowId: string, columnId: string) => {
    const next = new Map(Object.entries(cells));
    if (multiple) {
      const current = next.get(rowId);
      const picked = Array.isArray(current) ? [...current] : [];
      const index = picked.indexOf(columnId);
      if (index >= 0) picked.splice(index, 1);
      else picked.push(columnId);
      if (picked.length) next.set(rowId, picked);
      else next.delete(rowId);
    } else {
      next.set(rowId, columnId);
    }
    sound("select");
    onChange(next.size ? Object.fromEntries(next) : undefined);
  };

  return (
    <div
      className="fx-matrix"
      style={{ ["--columns" as string]: columns.length } as CSSProperties}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      <div className="fx-matrix-head" aria-hidden>
        <span />
        {columns.map((column) => (
          <span key={column.id}>{column.label}</span>
        ))}
      </div>
      {rows.map((row) => {
        const picked = cells[row.id];
        const pickedList = Array.isArray(picked) ? picked : picked ? [picked] : [];
        return (
          <fieldset
            key={row.id}
            className="fx-matrix-row"
            data-answered={pickedList.length ? "" : undefined}
          >
            <legend className="fx-matrix-label">{row.label}</legend>
            {columns.map((column) => {
              const checked = pickedList.includes(column.id);
              return (
                <label
                  key={column.id}
                  className="fx-matrix-cell"
                  data-checked={checked ? "" : undefined}
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    name={`fx-${field.id}-${row.id}`}
                    className="fx-choice-input"
                    checked={checked}
                    onChange={() => {
                      set(row.id, column.id);
                    }}
                  />
                  <span className="fx-matrix-dot" aria-hidden />
                  <span className="fx-matrix-cell-label">{column.label}</span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
