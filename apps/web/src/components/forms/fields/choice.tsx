"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, ThumbsDown, ThumbsUp } from "lucide-react";
import { OTHER_OPTION_ID, otherKey, type FormField, type FormOption } from "@repo/shared";

import { formMediaSrc } from "@/lib/forms/public-media";

import { Combobox } from "../controls/combobox";
import { useFormController, type FieldProps } from "../form-context";
import { ShapeSvg } from "../scene/scene-dom";
import { SHAPE_KINDS, hashSeed, seeded } from "../scene/vocabulary";
import { shuffleInPlace } from "../shuffle";
import { useHydrated } from "../use-hydrated";

/**
 * The choice family: option cards (single and multiple, with keyboard
 * letters, pictures and an "Other" answer), yes/no, the searchable
 * dropdown and tag picker, and ranking by drag or keyboard.
 */

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The options in display order: shuffled per respondent when asked, after hydration. */
function useOptions(field: FormField) {
  const hydrated = useHydrated();
  const { upload } = useFormController();
  return useMemo(() => {
    const options = [...(field.options ?? [])];
    if (!field.randomize || !hydrated) return options;
    return shuffleInPlace(options, seeded(hashSeed(`${upload.sessionId}:${field.id}`)));
  }, [field.id, field.options, field.randomize, hydrated, upload.sessionId]);
}

function OtherInput({ field, active }: { field: FormField; active: boolean }) {
  const { answers, setAnswer, copy } = useFormController();
  const key = otherKey(field.id);
  const other = answers[otherKey(field.id)];
  const value = typeof other === "string" ? other : "";
  if (!active) return null;
  return (
    <input
      className="fx-input fx-other-input"
      type="text"
      value={value}
      autoFocus
      maxLength={2000}
      placeholder={copy.otherPlaceholder}
      aria-label={`${field.otherLabel || copy.other}: ${copy.otherPlaceholder}`}
      onChange={(event) => {
        setAnswer(key, event.target.value || undefined);
      }}
    />
  );
}

type Card = { id: string; label: string; description?: string; image?: FormOption["image"] };

function cardsOf(field: FormField, options: FormOption[], otherLabel: string): Card[] {
  const cards: Card[] = options.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    image: option.image,
  }));
  if (field.allowOther) cards.push({ id: OTHER_OPTION_ID, label: field.otherLabel || otherLabel });
  return cards;
}

function ChoiceCards({
  field,
  cards,
  selected,
  multiple,
  onToggle,
  describedBy,
  invalid,
  picture = false,
  disabledIds,
}: {
  field: FormField;
  cards: Card[];
  selected: string[];
  multiple: boolean;
  onToggle: (id: string) => void;
  describedBy?: string;
  invalid: boolean;
  picture?: boolean;
  disabledIds?: Set<string>;
}) {
  const name = `fx-${field.id}`;
  const layout = picture ? "grid" : (field.optionLayout ?? (cards.length > 6 ? "grid" : "list"));
  return (
    <div
      className="fx-choices"
      data-layout={layout}
      data-picture={picture ? "" : undefined}
      role={multiple ? "group" : "radiogroup"}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={field.required || undefined}
    >
      {cards.map((card, index) => {
        const checked = selected.includes(card.id);
        const letter = LETTERS.charAt(index);
        const imageSrc = formMediaSrc(card.image);
        const disabled = disabledIds?.has(card.id);
        return (
          <label
            key={card.id}
            className="fx-choice"
            data-checked={checked ? "" : undefined}
            data-disabled={disabled ? "" : undefined}
            data-choice-key={letter}
            style={{ ["--piece" as string]: `var(--fx-piece-${index % 5})` } as CSSProperties}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={card.id}
              checked={checked}
              disabled={disabled}
              className="fx-choice-input"
              onChange={() => {
                onToggle(card.id);
              }}
              onClick={(event) => {
                // A second click on the chosen radio clears it.
                if (!multiple && checked && event.detail > 0) {
                  event.preventDefault();
                  onToggle(card.id);
                }
              }}
            />
            {imageSrc ? (
              <span className="fx-choice-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageSrc} alt={card.image?.alt ?? ""} loading="lazy" decoding="async" />
              </span>
            ) : null}
            <span className="fx-choice-body">
              <span className="fx-key" aria-hidden>
                {letter}
              </span>
              <span className="fx-choice-text">
                <span className="fx-choice-label">{card.label}</span>
                {card.description ? (
                  <span className="fx-choice-description">{card.description}</span>
                ) : null}
              </span>
              <span className="fx-choice-mark" aria-hidden>
                <ShapeSvg kind={SHAPE_KINDS[(index * 5 + 1) % SHAPE_KINDS.length]} />
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function selectionHint(field: FormField, copy: ReturnType<typeof useFormController>["copy"]) {
  const { minSelections: min, maxSelections: max } = field;
  if (min && max) return min === max ? copy.pickUpTo(max) : copy.pickBetween(min, max);
  if (max) return copy.pickUpTo(max);
  if (min && min > 1) return copy.pickAtLeast(min);
  return null;
}

export function MultipleChoice({
  field,
  value,
  onChange,
  describedBy,
  invalid,
  onComplete,
}: FieldProps<string>) {
  const { copy, sound } = useFormController();
  const options = useOptions(field);
  const cards = cardsOf(field, options, copy.other);
  const selected = typeof value === "string" ? [value] : [];
  return (
    <>
      <ChoiceCards
        field={field}
        cards={cards}
        selected={selected}
        multiple={false}
        describedBy={describedBy}
        invalid={invalid}
        onToggle={(id) => {
          const next = selected[0] === id ? undefined : id;
          onChange(next);
          if (next) sound("select");
          if (next && next !== OTHER_OPTION_ID) onComplete?.();
        }}
      />
      <OtherInput field={field} active={selected[0] === OTHER_OPTION_ID} />
    </>
  );
}

export function Checkboxes({ field, value, onChange, describedBy, invalid }: FieldProps<string[]>) {
  const { copy, sound } = useFormController();
  const options = useOptions(field);
  const cards = cardsOf(field, options, copy.other);
  const selected = Array.isArray(value) ? value : [];
  const full = field.maxSelections !== undefined && selected.length >= field.maxSelections;
  const disabled = full
    ? new Set(cards.filter((card) => !selected.includes(card.id)).map((card) => card.id))
    : undefined;
  const hint = selectionHint(field, copy);
  return (
    <>
      {hint ? (
        <p className="fx-choice-hint" aria-live="polite">
          {hint}
          {field.maxSelections ? (
            <span className="fx-choice-count">
              {" "}
              · {selected.length}/{field.maxSelections}
            </span>
          ) : null}
        </p>
      ) : null}
      <ChoiceCards
        field={field}
        cards={cards}
        selected={selected}
        multiple
        describedBy={describedBy}
        invalid={invalid}
        disabledIds={disabled}
        onToggle={(id) => {
          const next = selected.includes(id)
            ? selected.filter((item) => item !== id)
            : [...selected, id];
          if (!selected.includes(id)) sound("select");
          onChange(next.length ? next : undefined);
        }}
      />
      <OtherInput field={field} active={selected.includes(OTHER_OPTION_ID)} />
    </>
  );
}

export function PictureChoice(props: FieldProps<string | string[]>) {
  const { field, value, onChange, describedBy, invalid, onComplete } = props;
  const { copy, sound } = useFormController();
  const options = useOptions(field);
  const cards = cardsOf(field, options, copy.other);
  const multiple = (field.maxSelections ?? 1) > 1;
  const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const full =
    multiple && field.maxSelections !== undefined && selected.length >= field.maxSelections;
  return (
    <>
      {multiple ? <p className="fx-choice-hint">{selectionHint(field, copy)}</p> : null}
      <ChoiceCards
        field={field}
        cards={cards}
        selected={selected}
        multiple={multiple}
        picture
        describedBy={describedBy}
        invalid={invalid}
        disabledIds={
          full
            ? new Set(cards.filter((card) => !selected.includes(card.id)).map((card) => card.id))
            : undefined
        }
        onToggle={(id) => {
          if (multiple) {
            const next = selected.includes(id)
              ? selected.filter((item) => item !== id)
              : [...selected, id];
            onChange(next.length ? next : undefined);
          } else {
            const next = selected[0] === id ? undefined : id;
            onChange(next);
            if (next && next !== OTHER_OPTION_ID) onComplete?.();
          }
          sound("select");
        }}
      />
      <OtherInput field={field} active={selected.includes(OTHER_OPTION_ID)} />
    </>
  );
}

export function YesNo({
  field,
  value,
  onChange,
  describedBy,
  invalid,
  onComplete,
}: FieldProps<boolean>) {
  const { copy, sound } = useFormController();
  const name = `fx-${field.id}`;
  const choices = [
    // The keys follow the words: Y and N, or Y and T in Indonesian.
    { answer: true, label: copy.yes, letter: copy.yes.charAt(0).toUpperCase(), Icon: ThumbsUp },
    { answer: false, label: copy.no, letter: copy.no.charAt(0).toUpperCase(), Icon: ThumbsDown },
  ];
  return (
    <div
      className="fx-yesno"
      role="radiogroup"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      {choices.map(({ answer, label, letter, Icon }) => (
        <label
          key={label}
          className="fx-yesno-option"
          data-checked={value === answer ? "" : undefined}
          data-choice-key={letter}
          data-answer={answer ? "yes" : "no"}
        >
          <input
            type="radio"
            name={name}
            className="fx-choice-input"
            checked={value === answer}
            onChange={() => {
              onChange(answer);
              sound("select");
              onComplete?.();
            }}
          />
          <span className="fx-yesno-icon" aria-hidden>
            <Icon strokeWidth={2.25} size={26} />
          </span>
          <span className="fx-yesno-label">{label}</span>
          <span className="fx-key" aria-hidden>
            {letter}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Dropdown({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  onComplete,
}: FieldProps<string>) {
  const { labels, copy } = useFormController();
  const options = useOptions(field);
  const list = [
    ...options.map((option) => ({ id: option.id, label: option.label, hint: option.description })),
    ...(field.allowOther ? [{ id: OTHER_OPTION_ID, label: field.otherLabel || copy.other }] : []),
  ];
  return (
    <>
      <Combobox
        inputId={inputId}
        options={list}
        value={typeof value === "string" ? value : undefined}
        onChange={(next) => {
          onChange(next);
          if (next && next !== OTHER_OPTION_ID) onComplete?.();
        }}
        placeholder={field.placeholder ?? labels.selectPlaceholder}
        noMatches={copy.noMatches}
        describedBy={describedBy}
        invalid={invalid}
        required={field.required}
      />
      <OtherInput field={field} active={value === OTHER_OPTION_ID} />
    </>
  );
}

export function Multiselect({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<string[]>) {
  const { labels, copy } = useFormController();
  const options = useOptions(field);
  const list = [
    ...options.map((option) => ({ id: option.id, label: option.label, hint: option.description })),
    ...(field.allowOther ? [{ id: OTHER_OPTION_ID, label: field.otherLabel || copy.other }] : []),
  ];
  const selected = Array.isArray(value) ? value : [];
  const hint = selectionHint(field, copy);
  return (
    <>
      {hint ? <p className="fx-choice-hint">{hint}</p> : null}
      <Combobox
        multiple
        inputId={inputId}
        options={list}
        value={selected}
        onChange={onChange}
        maxSelections={field.maxSelections}
        placeholder={field.placeholder ?? labels.searchPlaceholder}
        noMatches={copy.noMatches}
        describedBy={describedBy}
        invalid={invalid}
        required={field.required}
        removeLabel={copy.removeFile}
      />
      <OtherInput field={field} active={selected.includes(OTHER_OPTION_ID)} />
    </>
  );
}

/**
 * Ranking: drag a row by its grip (pointer), or focus a row, press Space to
 * pick it up, move it with the arrow keys and Space again to drop. Every
 * move is announced. The order counts as an answer from the first move (or
 * the "keep this order" button).
 */
export function Ranking({ field, value, onChange, describedBy, invalid }: FieldProps<string[]>) {
  const { copy } = useFormController();
  const options = useOptions(field);
  const order =
    Array.isArray(value) && value.length === options.length
      ? value
      : options.map((option) => option.id);
  const labelOf = (id: string) => options.find((option) => option.id === id)?.label ?? id;
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<{ id: string; offset: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const answered = Array.isArray(value) && value.length > 0;

  const move = (id: string, to: number) => {
    const from = order.indexOf(id);
    if (from < 0 || to < 0 || to >= order.length || from === to) return false;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    onChange(next);
    return true;
  };

  const focusRow = (id: string) =>
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-rank-id="${CSS.escape(id)}"]`)?.focus(),
    );

  const onKeyDown = (event: React.KeyboardEvent, id: string) => {
    const index = order.indexOf(id);
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (grabbed === id) {
        setGrabbed(null);
        setAnnouncement(copy.rankDropped(labelOf(id), index + 1, order.length));
        if (!answered) onChange(order);
      } else {
        setGrabbed(id);
        setAnnouncement(copy.rankGrabbed(labelOf(id), index + 1, order.length));
      }
      return;
    }
    if (event.key === "Escape" && grabbed) {
      setGrabbed(null);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      const target = index + (event.key === "ArrowUp" ? -1 : 1);
      if (grabbed === id) {
        if (move(id, target)) {
          setAnnouncement(copy.rankMoved(labelOf(id), target + 1, order.length));
          focusRow(id);
        }
      } else {
        const neighbour = target >= 0 ? order.at(target) : undefined;
        if (neighbour) focusRow(neighbour);
      }
    }
  };

  // Pointer drag: the row follows the pointer; crossing a neighbour's middle swaps.
  const onPointerDown = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-rank-id]");
    if (!row) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const startY = event.clientY;
    let current = [...order];
    let base = startY;
    setDragging({ id, offset: 0 });
    const onMove = (moveEvent: PointerEvent) => {
      const index = current.indexOf(id);
      const height = row.getBoundingClientRect().height + 8;
      const offset = moveEvent.clientY - base;
      if (offset > height / 2 && index < current.length - 1) {
        current = [...current];
        current.splice(index, 1);
        current.splice(index + 1, 0, id);
        base += height;
        onChange(current);
      } else if (offset < -height / 2 && index > 0) {
        current = [...current];
        current.splice(index, 1);
        current.splice(index - 1, 0, id);
        base -= height;
        onChange(current);
      }
      setDragging({ id, offset: moveEvent.clientY - base });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragging(null);
      onChange(current);
      setAnnouncement(copy.rankDropped(labelOf(id), current.indexOf(id) + 1, current.length));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div className="fx-ranking" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      <p className="fx-choice-hint" id={`fx-${field.id}-rank-hint`}>
        {copy.rankHint}
      </p>
      <ol ref={listRef} className="fx-rank-list">
        {order.map((id, index) => (
          <li
            key={id}
            className="fx-rank-row"
            data-rank-id={id}
            data-grabbed={grabbed === id ? "" : undefined}
            data-dragging={dragging?.id === id ? "" : undefined}
            style={
              dragging?.id === id
                ? ({ translate: `0 ${dragging.offset}px` } as CSSProperties)
                : undefined
            }
            tabIndex={0}
            aria-roledescription="sortable item"
            aria-describedby={`fx-${field.id}-rank-hint`}
            aria-label={`${labelOf(id)}, ${index + 1} / ${order.length}`}
            onKeyDown={(event) => {
              onKeyDown(event, id);
            }}
          >
            <span
              className="fx-rank-grip"
              aria-hidden
              onPointerDown={(event) => {
                onPointerDown(event, id);
              }}
            >
              <GripVertical strokeWidth={2.25} size={18} />
            </span>
            <span className="fx-rank-number" aria-hidden>
              {index + 1}
            </span>
            <span className="fx-rank-label">{labelOf(id)}</span>
            <span className="fx-rank-buttons">
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${copy.moveUp}: ${labelOf(id)}`}
                disabled={index === 0}
                onClick={() => {
                  if (move(id, index - 1))
                    setAnnouncement(copy.rankMoved(labelOf(id), index, order.length));
                }}
              >
                <ChevronUp aria-hidden strokeWidth={2.25} size={18} />
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${copy.moveDown}: ${labelOf(id)}`}
                disabled={index === order.length - 1}
                onClick={() => {
                  if (move(id, index + 1))
                    setAnnouncement(copy.rankMoved(labelOf(id), index + 2, order.length));
                }}
              >
                <ChevronDown aria-hidden strokeWidth={2.25} size={18} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      {!answered ? (
        <button
          type="button"
          className="fx-link-button fx-rank-keep"
          onClick={() => {
            onChange(order);
          }}
        >
          <Check aria-hidden strokeWidth={2.25} size={16} /> {copy.keepOrder}
        </button>
      ) : null}
      <p className="fx-sr-only" aria-live="assertive">
        {announcement}
      </p>
    </div>
  );
}
