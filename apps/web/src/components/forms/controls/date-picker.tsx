"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import {
  addDays,
  addMonths,
  clampIso,
  formatDateFull,
  formatMonthYear,
  inRange,
  monthGrid,
  monthNames,
  parseIso,
  pickerCopy,
  toIso,
  todayIso,
  weekStartOf,
  weekdayNames,
  weekdayOf,
  type PickerLanguage,
} from "./picker-dates";
import { PickerField } from "./picker-field";

/**
 * The calendar (the APG date picker dialog's grid: arrows move a day or a
 * week, Home and End to the week's ends, PageUp and PageDown a month, with
 * Shift a year, Enter or Space picks, Escape closes) with a month grid and
 * a year list for long jumps, and the date picker built on it.
 */

type View = "days" | "months" | "years";

const monthIndex = (iso: string) => {
  const date = parseIso(iso);
  return date ? date.y * 12 + date.m - 1 : 0;
};

/** The nearest day from `start` stepping by `step` that is in range, or null. */
function nearestEnabled(start: string, step: number, min?: string, max?: string) {
  let day = start;
  for (let guard = 0; guard < 400; guard += 1) {
    if (inRange(day, min, max)) return day;
    if ((min && day < min && step < 0) || (max && day > max && step > 0)) return null;
    day = addDays(day, step);
  }
  return null;
}

export function Calendar({
  language,
  value,
  min,
  max,
  autoFocus,
  onPick,
}: {
  language: PickerLanguage;
  value: string | undefined;
  min?: string;
  max?: string;
  autoFocus: boolean;
  onPick: (iso: string) => void;
}) {
  const copy = pickerCopy(language);
  const today = useMemo(() => todayIso(), []);
  const weekStart = weekStartOf(language);
  const [focus, setFocus] = useState(() =>
    clampIso(value && parseIso(value) ? value : today, min, max),
  );
  const [view, setView] = useState<View>("days");
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const wantFocus = useRef(autoFocus);
  const gridRef = useRef<HTMLDivElement>(null);

  const current = parseIso(focus) ?? { y: 2026, m: 1, d: 1 };
  const days = useMemo(
    () => monthGrid(current.y, current.m, weekStart),
    [current.y, current.m, weekStart],
  );
  const weekdaysShort = useMemo(() => weekdayNames(language, "short"), [language]);
  const weekdaysLong = useMemo(() => weekdayNames(language, "long"), [language]);
  const months = useMemo(() => monthNames(language, "short"), [language]);
  const monthsLong = useMemo(() => monthNames(language, "long"), [language]);
  const heading = formatMonthYear(current.y, current.m, language);

  const minDate = parseIso(min);
  const maxDate = parseIso(max);
  const todayDate = parseIso(today) ?? current;
  const firstYear = Math.min(minDate?.y ?? todayDate.y - 120, current.y);
  const lastYear = Math.max(maxDate?.y ?? todayDate.y + 30, current.y);

  // Keyboard moves bring focus along to the new cell.
  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const selector =
      view === "days"
        ? `[data-day="${focus}"]`
        : view === "months"
          ? `[data-month="${current.m}"]`
          : `[data-year="${current.y}"]`;
    gridRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }, [focus, view, current.m, current.y]);

  // The year list opens scrolled to the shown year (its own scroll only).
  useLayoutEffect(() => {
    if (view !== "years") return;
    const list = gridRef.current?.querySelector<HTMLElement>(".pk-years");
    const year = list?.querySelector<HTMLElement>(`[data-year="${current.y}"]`);
    if (list && year) {
      list.scrollTop = year.offsetTop - list.clientHeight / 2 + year.offsetHeight / 2;
    }
    // The shown year only changes here by picking one, which leaves the list.
  }, [view, current.y]);

  const go = (next: string | null, withFocus: boolean) => {
    if (!next) return;
    const delta = monthIndex(next) - monthIndex(focus);
    if (delta) setDirection(delta > 0 ? "next" : "prev");
    wantFocus.current = withFocus;
    setFocus(next);
  };

  const monthOutOfRange = (y: number, m: number) => {
    const first = toIso({ y, m, d: 1 });
    const last = addDays(addMonths(first, 1), -1);
    return Boolean((max && first > max) || (min && last < min));
  };
  const firstOfMonth = toIso({ y: current.y, m: current.m, d: 1 });
  const previous = parseIso(addMonths(firstOfMonth, -1));
  const following = parseIso(addMonths(firstOfMonth, 1));
  const canPrev = Boolean(previous && !monthOutOfRange(previous.y, previous.m));
  const canNext = Boolean(following && !monthOutOfRange(following.y, following.m));

  const onDayKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    const dow = (weekdayOf(focus) - weekStart + 7) % 7;
    let target: string | null = null;
    let step = 1;
    switch (event.key) {
      case "ArrowLeft":
        step = -1;
        target = addDays(focus, -1);
        break;
      case "ArrowRight":
        target = addDays(focus, 1);
        break;
      case "ArrowUp":
        step = -7;
        target = addDays(focus, -7);
        break;
      case "ArrowDown":
        step = 7;
        target = addDays(focus, 7);
        break;
      case "Home":
        target = addDays(focus, -dow);
        break;
      case "End":
        step = -1;
        target = addDays(focus, 6 - dow);
        break;
      case "PageUp":
        target = clampIso(addMonths(focus, event.shiftKey ? -12 : -1), min, max);
        break;
      case "PageDown":
        target = clampIso(addMonths(focus, event.shiftKey ? 12 : 1), min, max);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (inRange(focus, min, max)) onPick(focus);
        return;
      default:
        return;
    }
    event.preventDefault();
    go(nearestEnabled(target, step, min, max), true);
  };

  const pickMonth = (m: number) => {
    const day = Math.min(current.d, new Date(Date.UTC(current.y, m, 0)).getUTCDate());
    setView("days");
    go(clampIso(toIso({ y: current.y, m, d: day }), min, max), true);
  };
  const pickYear = (y: number) => {
    const day = Math.min(current.d, new Date(Date.UTC(y, current.m, 0)).getUTCDate());
    setView("months");
    go(clampIso(toIso({ y, m: current.m, d: day }), min, max), true);
  };

  /** Arrow keys in the month grid (4 columns) and the year list (4 columns). */
  const onChoiceKey = (
    event: ReactKeyboardEvent<HTMLElement>,
    index: number,
    count: number,
    pick: (index: number) => void,
  ) => {
    let next = index;
    switch (event.key) {
      case "ArrowLeft":
        next = index - 1;
        break;
      case "ArrowRight":
        next = index + 1;
        break;
      case "ArrowUp":
        next = index - 4;
        break;
      case "ArrowDown":
        next = index + 4;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        wantFocus.current = true;
        setView("days");
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        pick(index);
        return;
      default:
        return;
    }
    event.preventDefault();
    const clamped = Math.max(0, Math.min(count - 1, next));
    gridRef.current?.querySelector<HTMLElement>(`[data-choice="${clamped}"]`)?.focus();
  };

  const weeks = Array.from({ length: 6 }, (_, row) => days.slice(row * 7, row * 7 + 7));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);

  return (
    <div className="pk-cal" data-view={view}>
      <div className="pk-cal-head">
        <button
          type="button"
          className="pk-icon-btn"
          aria-label={copy.previousMonth}
          disabled={!canPrev || view !== "days"}
          onClick={() => {
            go(clampIso(addMonths(focus, -1), min, max), false);
          }}
        >
          <ChevronLeft aria-hidden strokeWidth={2.25} size={18} />
        </button>
        <div className="pk-cal-title">
          <button
            type="button"
            className="pk-title-btn"
            aria-label={`${copy.chooseMonth}, ${monthsLong.at(current.m - 1) ?? ""}`}
            aria-pressed={view === "months"}
            onClick={() => {
              wantFocus.current = true;
              setView(view === "months" ? "days" : "months");
            }}
          >
            {monthsLong.at(current.m - 1)}
            <ChevronDown aria-hidden strokeWidth={2.25} size={14} />
          </button>
          <button
            type="button"
            className="pk-title-btn"
            aria-label={`${copy.chooseYear}, ${current.y}`}
            aria-pressed={view === "years"}
            onClick={() => {
              wantFocus.current = true;
              setView(view === "years" ? "days" : "years");
            }}
          >
            {current.y}
            <ChevronDown aria-hidden strokeWidth={2.25} size={14} />
          </button>
        </div>
        <button
          type="button"
          className="pk-icon-btn"
          aria-label={copy.nextMonth}
          disabled={!canNext || view !== "days"}
          onClick={() => {
            go(clampIso(addMonths(focus, 1), min, max), false);
          }}
        >
          <ChevronRight aria-hidden strokeWidth={2.25} size={18} />
        </button>
      </div>
      <p className="pk-sr" aria-live="polite">
        {heading}
      </p>
      <div ref={gridRef} className="pk-cal-stage">
        {view === "days" ? (
          <table
            role="grid"
            className="pk-grid"
            aria-label={heading}
            key={`${current.y}-${current.m}`}
            data-direction={direction ?? undefined}
          >
            <thead>
              <tr>
                {weekdaysShort.map((name, index) => (
                  <th key={name} scope="col" abbr={weekdaysLong.at(index)}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.at(0)}>
                  {week.map((day) => {
                    const date = parseIso(day);
                    const disabled = !inRange(day, min, max);
                    const selected = day === value;
                    const isToday = day === today;
                    const outside = date?.m !== current.m;
                    const full = formatDateFull(day, language);
                    return (
                      <td
                        key={day}
                        role="gridcell"
                        data-day={day}
                        tabIndex={day === focus ? 0 : -1}
                        aria-selected={selected}
                        aria-disabled={disabled || undefined}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={isToday ? `${copy.todayPrefix}, ${full}` : full}
                        data-outside={outside ? "" : undefined}
                        data-today={isToday ? "" : undefined}
                        className="pk-day"
                        onKeyDown={onDayKey}
                        onClick={() => {
                          if (disabled) return;
                          go(day, false);
                          onPick(day);
                        }}
                      >
                        <span className="pk-day-num" aria-hidden>
                          {date?.d}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {view === "months" ? (
          <div className="pk-choices" role="group" aria-label={copy.chooseMonth}>
            {months.map((name, index) => {
              const m = index + 1;
              const off = monthOutOfRange(current.y, m);
              return (
                <button
                  key={name}
                  type="button"
                  className="pk-choice"
                  data-month={m}
                  data-choice={index}
                  tabIndex={m === current.m ? 0 : -1}
                  aria-label={`${monthsLong.at(index) ?? name} ${current.y}`}
                  aria-current={m === current.m || undefined}
                  disabled={off}
                  onKeyDown={(event) => {
                    onChoiceKey(event, index, 12, (chosen) => {
                      pickMonth(chosen + 1);
                    });
                  }}
                  onClick={() => {
                    pickMonth(m);
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : null}
        {view === "years" ? (
          <div className="pk-choices pk-years" role="group" aria-label={copy.chooseYear}>
            {years.map((year, index) => {
              const off = Boolean((minDate && year < minDate.y) || (maxDate && year > maxDate.y));
              return (
                <button
                  key={year}
                  type="button"
                  className="pk-choice"
                  data-year={year}
                  data-choice={index}
                  data-now={year === todayDate.y ? "" : undefined}
                  tabIndex={year === current.y ? 0 : -1}
                  aria-current={year === current.y || undefined}
                  disabled={off}
                  onKeyDown={(event) => {
                    onChoiceKey(event, index, years.length, (chosen) => {
                      const picked = years.at(chosen);
                      if (picked !== undefined) pickYear(picked);
                    });
                  }}
                  onClick={() => {
                    pickYear(year);
                  }}
                >
                  {year}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type DatePickerProps = {
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

/** A date (`YYYY-MM-DD`) picker. */
export function DatePicker(props: DatePickerProps) {
  const { language, value, min, max, required } = props;
  const copy = pickerCopy(language);
  const picked = value && parseIso(value) ? value : undefined;
  return (
    <PickerField
      {...props}
      kind="date"
      panel={(api) => (
        <Calendar
          language={language}
          value={picked}
          min={min}
          max={max}
          autoFocus={api.autoFocus}
          onPick={(day) => {
            api.commit(day);
            api.close(true);
          }}
        />
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
                api.commit(today);
                api.close(true);
              }}
            >
              {copy.today}
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
            {api.sheet ? (
              <button
                type="button"
                className="pk-done"
                onClick={() => {
                  api.close(true);
                }}
              >
                {copy.done}
              </button>
            ) : null}
          </>
        );
      }}
    />
  );
}
