"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  nowTime,
  pad2,
  parseTimeValue,
  pickerCopy,
  timeValue,
  uses12Hour,
  type PickerLanguage,
  type TimeParts,
} from "./picker-dates";
import { PickerField } from "./picker-field";

/**
 * The time panel: an hours and a minutes column (5-minute steps, plus the
 * exact minute when one was typed), and AM or PM in English. Each column is
 * a listbox the arrow keys move through (Left and Right change column,
 * Enter is Done). On phones the columns are scroll-snap wheels: whatever
 * settles in the middle is picked.
 */

type ColumnItem = { key: string; label: string; value: number };

function Column({
  label,
  items,
  selected,
  onSelect,
  onDone,
  wheel,
  autoFocus,
  suggested,
  shortLabel,
}: {
  label: string;
  /** The visible heading when it differs from the accessible name. */
  shortLabel?: string;
  items: ColumnItem[];
  selected: number | null;
  /** Centred while nothing is picked, so the column opens on a likely time. */
  suggested: number;
  onSelect: (value: number) => void;
  onDone: () => void;
  wheel: boolean;
  autoFocus: boolean;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const userScroll = useRef(false);
  const settleTimer = useRef(0);
  const first = useRef(true);
  const index = items.findIndex((item) => item.value === selected);
  const active = items.at(index);
  const centred =
    index >= 0
      ? index
      : Math.max(
          0,
          items.findIndex((item) => item.value === suggested),
        );

  // The picked item sits in the middle of its column.
  useLayoutEffect(() => {
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-index="${centred}"]`);
    if (!list || !option || userScroll.current) return;
    const top = option.offsetTop - list.clientHeight / 2 + option.offsetHeight / 2;
    const smooth =
      !first.current && window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    first.current = false;
    list.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
  }, [centred]);

  useEffect(() => {
    if (autoFocus) listRef.current?.focus({ preventScroll: true });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const onScroll = () => {
    if (!wheel || !userScroll.current) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const list = listRef.current;
      userScroll.current = false;
      if (!list) return;
      const middle = list.scrollTop + list.clientHeight / 2;
      let closest = -1;
      let distance = Number.POSITIVE_INFINITY;
      list.querySelectorAll<HTMLElement>("[data-index]").forEach((option, position) => {
        const gap = Math.abs(option.offsetTop + option.offsetHeight / 2 - middle);
        if (gap < distance) {
          distance = gap;
          closest = position;
        }
      });
      const item = items.at(closest);
      if (item && item.value !== selected) onSelect(item.value);
    }, 120);
  };
  const markUser = () => {
    userScroll.current = true;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next = index;
    switch (event.key) {
      case "ArrowDown":
        next = index < 0 ? centred : (index + 1) % items.length;
        break;
      case "ArrowUp":
        next = index < 0 ? centred : (index - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      case "PageDown":
        next = Math.min(items.length - 1, Math.max(index, 0) + 4);
        break;
      case "PageUp":
        next = Math.max(0, index - 4);
        break;
      case "ArrowLeft":
      case "ArrowRight": {
        event.preventDefault();
        const columns = [
          ...(listRef.current
            ?.closest(".pk-time")
            ?.querySelectorAll<HTMLElement>("[role=listbox]") ?? []),
        ];
        const at = columns.findIndex((column) => column === listRef.current);
        columns.at((at + (event.key === "ArrowLeft" ? -1 : 1)) % columns.length)?.focus();
        return;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (index < 0) {
          const fallback = items.at(centred);
          if (fallback) onSelect(fallback.value);
        }
        if (event.key === "Enter") onDone();
        return;
      default:
        return;
    }
    event.preventDefault();
    const item = items.at(next);
    if (item) onSelect(item.value);
  };

  return (
    <div className="pk-col">
      <span className="pk-col-label" aria-hidden>
        {shortLabel ?? label}
      </span>
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={active ? `${id}-${active.key}` : undefined}
        className="pk-col-list"
        data-wheel={wheel ? "" : undefined}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        onTouchStart={markUser}
        onWheel={markUser}
      >
        {items.map((item, position) => (
          <div
            key={item.key}
            id={`${id}-${item.key}`}
            role="option"
            aria-selected={item.value === selected}
            data-index={position}
            className="pk-opt"
            onClick={() => {
              onSelect(item.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelect(item.value);
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

const HOURS_24: ColumnItem[] = Array.from({ length: 24 }, (_, h) => ({
  key: `h${h}`,
  label: pad2(h),
  value: h,
}));
const HOURS_12: ColumnItem[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => ({
  key: `h${h}`,
  label: String(h),
  value: h % 12,
}));

/** The time columns, shared by the time and datetime pickers. */
export function TimeColumns({
  language,
  value,
  onChange,
  onDone,
  wheel,
  autoFocus,
  step = 5,
}: {
  language: PickerLanguage;
  value: string | undefined;
  onChange: (value: string) => void;
  onDone: () => void;
  wheel: boolean;
  autoFocus: boolean;
  step?: number;
}) {
  const copy = pickerCopy(language);
  const twelve = uses12Hour(language);
  const time = parseTimeValue(value);
  const pm = time ? time.h >= 12 : false;

  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, index) => index * step);
  if (time && !minutes.includes(time.min)) {
    minutes.push(time.min);
    minutes.sort((a, b) => a - b);
  }
  const minuteItems = minutes.map((min) => ({ key: `m${min}`, label: pad2(min), value: min }));

  const set = (next: Partial<TimeParts> & { pm?: boolean }) => {
    const base = time ?? { h: 0, min: 0 };
    let h = next.h ?? base.h;
    if (twelve) {
      const hour12 = next.h ?? base.h % 12;
      const isPm = next.pm ?? pm;
      h = hour12 + (isPm ? 12 : 0);
    }
    onChange(timeValue({ h, min: next.min ?? base.min }));
  };

  return (
    <div className="pk-time" role="group" aria-label={copy.chooseTime}>
      <Column
        label={copy.hours}
        items={twelve ? HOURS_12 : HOURS_24}
        selected={time ? (twelve ? time.h % 12 : time.h) : null}
        suggested={9}
        onSelect={(h) => {
          set({ h });
        }}
        onDone={onDone}
        wheel={wheel}
        autoFocus={autoFocus}
      />
      <span className="pk-colon" aria-hidden>
        :
      </span>
      <Column
        label={copy.minutes}
        items={minuteItems}
        selected={time ? time.min : null}
        suggested={0}
        onSelect={(min) => {
          set({ min });
        }}
        onDone={onDone}
        wheel={wheel}
        autoFocus={false}
      />
      {twelve ? (
        <Column
          label={copy.period}
          shortLabel="AM/PM"
          suggested={0}
          items={[
            { key: "am", label: "AM", value: 0 },
            { key: "pm", label: "PM", value: 1 },
          ]}
          selected={time ? (pm ? 1 : 0) : null}
          onSelect={(period) => {
            set({ pm: period === 1 });
          }}
          onDone={onDone}
          wheel={wheel}
          autoFocus={false}
        />
      ) : null}
    </div>
  );
}

export type TimePickerProps = {
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
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  showHint?: boolean;
};

/** A time (`HH:mm`, 24h) picker. */
export function TimePicker(props: TimePickerProps) {
  const { language, value, required } = props;
  const copy = pickerCopy(language);
  const picked = parseTimeValue(value) ? value : undefined;
  return (
    <PickerField
      {...props}
      kind="time"
      panel={(api) => (
        <TimeColumns
          language={language}
          value={picked}
          onChange={(next) => {
            api.commit(next);
          }}
          onDone={() => {
            api.close(true);
          }}
          wheel={api.sheet}
          autoFocus={api.autoFocus}
        />
      )}
      footer={(api) => (
        <>
          <button
            type="button"
            className="pk-chip"
            onClick={() => {
              api.commit(nowTime());
            }}
          >
            {copy.now}
          </button>
          {value && !required ? (
            <button
              type="button"
              className="pk-chip pk-chip-quiet"
              onClick={() => {
                api.commit(undefined);
                api.close(true);
              }}
            >
              {copy.clear}
            </button>
          ) : null}
          <button
            type="button"
            className="pk-done"
            onClick={() => {
              api.close(true);
            }}
          >
            {copy.done}
          </button>
        </>
      )}
    />
  );
}
