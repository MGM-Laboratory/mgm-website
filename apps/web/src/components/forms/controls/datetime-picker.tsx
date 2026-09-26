"use client";

import { useRef, useState } from "react";

import { Calendar } from "./date-picker";
import {
  formatTime,
  inRange,
  nowTime,
  parseIso,
  parseTimeValue,
  pickerCopy,
  todayIso,
  type PickerLanguage,
} from "./picker-dates";
import { PickerField, type PanelApi } from "./picker-field";
import { TimeColumns } from "./time-picker";

/**
 * A date and time (`YYYY-MM-DDTHH:mm`, local) picker: one field, one panel
 * with the calendar on one side and the time on the other (stacked on
 * phones). Like the native control, a value exists only once both halves
 * do; a picked day waits here for its time.
 */

export type DateTimePickerProps = {
  inputId: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  language: PickerLanguage;
  min?: string;
  max?: string;
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

function halves(value: string | undefined) {
  const [date, time] = (value ?? "").split("T");
  return {
    date: date && parseIso(date) ? date : undefined,
    time: time && parseTimeValue(time) ? time : undefined,
  };
}

export function DateTimePicker(props: DateTimePickerProps) {
  const { language, value, min, max, required } = props;
  const copy = pickerCopy(language);
  const [pending, setPending] = useState<{ date?: string; time?: string }>({});
  const timeRef = useRef<HTMLDivElement>(null);
  const committed = halves(value);
  const date = committed.date ?? pending.date;
  const time = committed.time ?? pending.time;

  const put = (api: PanelApi, next: { date?: string; time?: string }) => {
    if (next.date && next.time) {
      setPending({});
      api.commit(`${next.date}T${next.time}`);
    } else {
      setPending(next);
    }
  };

  return (
    <PickerField
      {...props}
      kind="datetime"
      panel={(api) => (
        <>
          <Calendar
            language={language}
            value={date}
            min={min}
            max={max}
            autoFocus={api.autoFocus}
            onPick={(day) => {
              put(api, { date: day, time });
              // The time comes next.
              requestAnimationFrame(() => {
                timeRef.current?.querySelector<HTMLElement>("[role=listbox]")?.focus();
              });
            }}
          />
          <div className="pk-time-side" ref={timeRef}>
            <p className="pk-time-title" data-empty={time ? undefined : ""} aria-hidden>
              {time ? formatTime(time, language) : copy.pickTime}
            </p>
            <TimeColumns
              language={language}
              value={time}
              onChange={(next) => {
                put(api, { date, time: next });
              }}
              onDone={() => {
                api.close(true);
              }}
              wheel={api.sheet}
              autoFocus={false}
            />
          </div>
        </>
      )}
      footer={(api) => {
        const today = todayIso();
        return (
          <>
            <button
              type="button"
              className="pk-chip"
              disabled={!inRange(today, min, max)}
              onClick={() => {
                put(api, { date: today, time });
              }}
            >
              {copy.today}
            </button>
            <button
              type="button"
              className="pk-chip"
              disabled={!inRange(today, min, max)}
              onClick={() => {
                put(api, { date: today, time: nowTime() });
              }}
            >
              {copy.now}
            </button>
            {value && !required ? (
              <button
                type="button"
                className="pk-chip pk-chip-quiet"
                onClick={() => {
                  setPending({});
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
        );
      }}
    />
  );
}
