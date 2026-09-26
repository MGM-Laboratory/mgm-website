"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { CalendarDays, Clock3, X } from "lucide-react";
import { formErrorMessage } from "@repo/shared";

import { useHydrated } from "../use-hydrated";
import {
  formatDateLong,
  formatDateTime,
  formatTime,
  parseDateText,
  parseDateTimeText,
  parseIso,
  parseTimeText,
  parseTimeValue,
  pickerCopy,
  type PickerLanguage,
} from "./picker-dates";
import { PickerPopover, useSheet } from "./picker-popover";

import "./picker.css";

/**
 * The field of a date, time or datetime picker: a text input that shows
 * the value in the form's language and also takes a typed value, read
 * leniently while typing (so Enter in the conversational layout already
 * sees it), a clear button when the answer is optional, and the button
 * that opens the panel. A typed value that can't be read is committed as
 * typed (`invalidText: "raw"`, the public form, whose validators then say
 * so) or kept out of the value with a message here (`"message"`, the
 * admin). Touch screens tap straight into the panel.
 */

export type PickerKind = "date" | "time" | "datetime";

export type PanelApi = {
  /** Commits a value (the answer's shape) without closing. */
  commit: (value: string | undefined) => void;
  /** Closes the panel, focus back on the field when asked. */
  close: (returnFocus: boolean) => void;
  sheet: boolean;
  /** Move focus into the panel when it mounts. */
  autoFocus: boolean;
};

const coarseQuery = "(pointer: coarse)";
function subscribeCoarse(callback: () => void) {
  const query = window.matchMedia(coarseQuery);
  query.addEventListener("change", callback);
  return () => {
    query.removeEventListener("change", callback);
  };
}
function useCoarse() {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(coarseQuery).matches,
    () => false,
  );
}

function parseText(kind: PickerKind, text: string) {
  switch (kind) {
    case "date":
      return parseDateText(text);
    case "time":
      return parseTimeText(text);
    default:
      return parseDateTimeText(text);
  }
}

/** The value as the field shows it; a value it can't read shows as stored. */
export function displayValue(kind: PickerKind, value: string, language: PickerLanguage) {
  switch (kind) {
    case "date":
      return parseIso(value) ? formatDateLong(value, language) : value;
    case "time":
      return parseTimeValue(value) ? formatTime(value, language) : value;
    default:
      return formatDateTime(value, language);
  }
}

export function PickerField({
  kind,
  inputId,
  value,
  onChange,
  language,
  required,
  placeholder,
  describedBy,
  invalid,
  invalidText = "raw",
  skin = "form",
  className,
  disabled,
  ariaLabel,
  showHint = true,
  panel,
  footer,
}: {
  kind: PickerKind;
  inputId: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  language: PickerLanguage;
  required?: boolean;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  invalidText?: "raw" | "message";
  skin?: "form" | "admin";
  /** The admin's box classes (the form skin wears the form's field style). */
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Show the typing hint under the field while it has focus. */
  showHint?: boolean;
  panel: (api: PanelApi) => ReactNode;
  footer?: (api: PanelApi) => ReactNode;
}) {
  const copy = pickerCopy(language);
  const hydrated = useHydrated();
  const coarse = useCoarse();
  const sheet = useSheet();
  const hintId = useId();
  const dialogId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [autoFocus, setAutoFocus] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [focused, setFocused] = useState(false);

  const shown = draft ?? (value && hydrated ? displayValue(kind, value, language) : (value ?? ""));
  const hint =
    kind === "date" ? copy.dateHint : kind === "time" ? copy.timeHint : copy.dateTimeHint;
  const format =
    kind === "date"
      ? copy.dateFormat
      : kind === "time"
        ? copy.timeFormat
        : `${copy.dateFormat} ${copy.timeFormat}`;
  const label =
    kind === "date" ? copy.chooseDate : kind === "time" ? copy.chooseTime : copy.chooseDateTime;
  const errorCode = kind === "time" ? "invalid" : "date";
  const localError =
    invalidText === "message" && unreadable ? formErrorMessage(errorCode, {}, language) : null;

  const commit = useCallback(
    (next: string | undefined) => {
      setDraft(null);
      setUnreadable(false);
      onChange(next);
    },
    [onChange],
  );

  // By id, not the ref: the panel's render functions receive this.
  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) document.getElementById(inputId)?.focus({ preventScroll: true });
    },
    [inputId],
  );

  /** Reads the typed text: live while typing, and settles it on blur or Enter. */
  const readDraft = (text: string, settle: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setUnreadable(false);
      onChange(undefined);
      if (settle) setDraft(null);
      return;
    }
    const parsed = parseText(kind, trimmed);
    if (parsed) {
      setUnreadable(false);
      onChange(parsed);
      if (settle) setDraft(null);
      return;
    }
    if (invalidText === "raw") onChange(trimmed);
    else if (settle) setUnreadable(true);
  };

  const show = (focusPanel: boolean) => {
    if (disabled) return;
    if (draft !== null) readDraft(draft, true);
    setAutoFocus(focusPanel);
    setOpen(true);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      show(true);
      return;
    }
    // Enter keeps its meaning (next question, submit); the value is already in.
    if (event.key === "Enter" && draft !== null) readDraft(draft, true);
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(false);
    }
  };

  const api: PanelApi = { commit, close, sheet, autoFocus };
  const describedIds = [describedBy, hintId].filter(Boolean).join(" ");
  const Icon = kind === "time" ? Clock3 : CalendarDays;

  return (
    <div className={`pk-wrap pk-skin-${skin}`}>
      <div
        ref={anchorRef}
        className={skin === "form" ? "fx-input fx-affix pk-field" : `pk-field ${className ?? ""}`}
        data-open={open ? "" : undefined}
        data-skin={skin}
        data-disabled={disabled ? "" : undefined}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="pk-input"
          value={shown}
          placeholder={placeholder || format}
          readOnly={coarse}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label={ariaLabel}
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          aria-autocomplete="none"
          aria-invalid={invalid || Boolean(localError) || undefined}
          aria-describedby={describedIds}
          aria-required={required || undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            readDraft(event.target.value, false);
          }}
          onFocus={(event) => {
            setFocused(true);
            if (draft === null) event.currentTarget.select();
          }}
          onBlur={(event) => {
            setFocused(false);
            const next = event.relatedTarget as Node | null;
            if (next && anchorRef.current?.contains(next)) return;
            if (draft !== null) readDraft(draft, true);
          }}
          onClick={() => {
            if (!open) show(coarse);
          }}
          onKeyDown={onKeyDown}
        />
        {value && !required && !disabled ? (
          <button
            type="button"
            className="pk-clear"
            aria-label={copy.clear}
            onClick={() => {
              commit(undefined);
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden strokeWidth={2.25} size={16} />
          </button>
        ) : null}
        <button
          type="button"
          className="pk-toggle"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            if (open) close(true);
            else show(true);
          }}
        >
          <Icon aria-hidden strokeWidth={2.25} size={18} />
        </button>
      </div>
      <p
        id={hintId}
        className="pk-hint"
        data-show={(showHint && focused) || localError ? "" : undefined}
        data-error={localError ? "" : undefined}
        aria-live="polite"
      >
        {localError ?? hint}
      </p>
      <PickerPopover
        open={open}
        anchorRef={anchorRef}
        ownerId={inputId}
        dialogId={dialogId}
        label={label}
        closeLabel={copy.close}
        skin={skin}
        kind={kind}
        onClose={close}
        footer={footer?.(api)}
      >
        {panel(api)}
      </PickerPopover>
    </div>
  );
}
