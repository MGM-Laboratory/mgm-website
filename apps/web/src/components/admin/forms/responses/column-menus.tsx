"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, DotsSixVertical, EyeSlash, PushPin, X } from "@phosphor-icons/react";

import { cellIds, countryLabel, type DataColumn, type WorkingRow } from "@/lib/forms/data/columns";
import {
  FILTER_OP_LABELS,
  filterOpsFor,
  type ColumnFilter,
  type FilterOp,
} from "@/lib/forms/data/filters";

export const inputClass =
  "h-9 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
export const labelClass =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-[#7e899d] dark:text-white/35";
export const ghostButton =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm font-semibold text-[#3b4150] transition hover:border-brand-blue hover:text-brand-blue disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75";
export const primaryButton =
  "inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50";

/** A floating panel anchored to a rect, kept on screen, closed by Escape or an outside click. */
export function Popover({
  anchor,
  onClose,
  children,
  width = 300,
  label,
}: {
  anchor: DOMRect;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom + 6 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const w = Math.min(width, viewportWidth - 16);
    let left = Math.min(anchor.right - w, viewportWidth - w - 8);
    left = Math.max(8, Math.min(left, anchor.left));
    let top = anchor.bottom + 6;
    if (top + rect.height > viewportHeight - 8) top = Math.max(8, anchor.top - rect.height - 6);
    setPosition({ left, top });
  }, [anchor, width]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);
  return createPortal(
    <div
      aria-label={label}
      className="fixed z-[60] max-h-[min(560px,80vh)] overflow-auto rounded-2xl border border-[#e4e8f0] bg-white p-3 text-sm shadow-[0_24px_60px_-20px_rgba(14,17,22,0.3)] dark:border-white/10 dark:bg-[#1c212a]"
      ref={ref}
      role="dialog"
      style={{
        left: position.left,
        top: position.top,
        width: Math.min(width, typeof window === "undefined" ? width : window.innerWidth - 16),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

const opLabels = new Map(Object.entries(FILTER_OP_LABELS));

function optionsFor(column: DataColumn, rows: WorkingRow[]) {
  if (column.options?.length) return column.options;
  // Meta choices (countries, devices...): the values present, most common first.
  const counts = new Map<string, number>();
  for (const row of rows)
    for (const id of cellIds(column, row)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([id, count]) => ({
      id,
      label: `${column.key === "$country" || column.field?.type === "country" ? countryLabel(id) : id} (${count})`,
    }));
}

export function FilterEditor({
  column,
  filter,
  rows,
  onChange,
}: {
  column: DataColumn;
  filter: ColumnFilter | undefined;
  rows: WorkingRow[];
  onChange: (filter: ColumnFilter | null) => void;
}) {
  const ops = filterOpsFor(column);
  const current: ColumnFilter = filter ?? { key: column.key, op: ops[0] };
  const op = current.op;
  const options = op === "in" ? optionsFor(column, rows) : [];
  const [search, setSearch] = useState("");
  const set = (patch: Partial<ColumnFilter>) => {
    onChange({ ...current, ...patch });
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Filter condition"
          className={inputClass}
          onChange={(event) => {
            set({ op: event.target.value as FilterOp });
          }}
          value={current.op}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {opLabels.get(op)}
            </option>
          ))}
        </select>
        {filter ? (
          <button
            aria-label="Clear filter"
            className="rounded-lg p-2 text-[#7e899d] hover:bg-[#f4f6fa] hover:text-brand-red dark:hover:bg-white/10"
            onClick={() => {
              onChange(null);
            }}
            type="button"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      {current.op === "contains" || current.op === "equals" ? (
        <input
          aria-label="Filter value"
          autoFocus
          className={inputClass}
          onChange={(event) => {
            set({ value: event.target.value });
          }}
          placeholder="Value"
          value={current.value ?? ""}
        />
      ) : null}
      {current.op === "range" ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label="Minimum"
            className={inputClass}
            inputMode="decimal"
            onChange={(event) => {
              set({ min: event.target.value === "" ? null : Number(event.target.value) });
            }}
            placeholder="Min"
            type="number"
            value={current.min ?? ""}
          />
          <input
            aria-label="Maximum"
            className={inputClass}
            inputMode="decimal"
            onChange={(event) => {
              set({ max: event.target.value === "" ? null : Number(event.target.value) });
            }}
            placeholder="Max"
            type="number"
            value={current.max ?? ""}
          />
        </div>
      ) : null}
      {current.op === "dateRange" ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label="From"
            className={inputClass}
            onChange={(event) => {
              set({ from: event.target.value });
            }}
            type="date"
            value={current.from ?? ""}
          />
          <input
            aria-label="To"
            className={inputClass}
            onChange={(event) => {
              set({ to: event.target.value });
            }}
            type="date"
            value={current.to ?? ""}
          />
        </div>
      ) : null}
      {current.op === "in" ? (
        <div>
          {options.length > 8 ? (
            <input
              aria-label="Search options"
              className={`${inputClass} mb-2`}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search"
              value={search}
            />
          ) : null}
          <div className="max-h-56 space-y-1 overflow-auto">
            {options
              .filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
              .map((option) => {
                const checked = current.values?.includes(option.id) ?? false;
                return (
                  <label
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-[#f4f6fa] dark:hover:bg-white/5"
                    key={option.id}
                  >
                    <input
                      checked={checked}
                      className="size-4 accent-brand-blue"
                      onChange={() => {
                        set({
                          values: checked
                            ? (current.values ?? []).filter((id) => id !== option.id)
                            : [...(current.values ?? []), option.id],
                        });
                      }}
                      type="checkbox"
                    />
                    <span className="truncate">{option.label}</span>
                  </label>
                );
              })}
            {!options.length ? <p className="text-xs text-[#9ba4b5]">No values yet.</p> : null}
          </div>
        </div>
      ) : null}
      {["empty", "notEmpty", "isTrue", "isFalse"].includes(current.op) && !filter ? (
        <button
          className={primaryButton}
          onClick={() => {
            onChange(current);
          }}
          type="button"
        >
          Apply
        </button>
      ) : null}
    </div>
  );
}

/** The header menu: sort, filter, pin, hide. */
export function ColumnMenu({
  column,
  anchor,
  filter,
  rows,
  pinned,
  onSort,
  onFilter,
  onHide,
  onPin,
  onClose,
}: {
  column: DataColumn;
  anchor: DOMRect;
  filter: ColumnFilter | undefined;
  rows: WorkingRow[];
  pinned: boolean;
  onSort: (direction: "asc" | "desc" | null) => void;
  onFilter: (filter: ColumnFilter | null) => void;
  onHide: () => void;
  onPin: () => void;
  onClose: () => void;
}) {
  const item =
    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f4f6fa] dark:hover:bg-white/5";
  return (
    <Popover anchor={anchor} label={`${column.label} options`} onClose={onClose} width={300}>
      <p
        className="mb-2 truncate px-1 text-xs font-semibold text-[#3b4150] dark:text-white/80"
        title={column.label}
      >
        {column.label}
      </p>
      <div className="mb-2 border-b border-[#eef0f4] pb-2 dark:border-white/5">
        <button
          className={item}
          onClick={() => {
            onSort("asc");
          }}
          type="button"
        >
          <ArrowUp size={14} /> Sort ascending
        </button>
        <button
          className={item}
          onClick={() => {
            onSort("desc");
          }}
          type="button"
        >
          <ArrowDown size={14} /> Sort descending
        </button>
        <button className={item} onClick={onPin} type="button">
          <PushPin size={14} /> {pinned ? "Unpin column" : "Pin up to here"}
        </button>
        <button className={item} onClick={onHide} type="button">
          <EyeSlash size={14} /> Hide column
        </button>
      </div>
      <p className={`${labelClass} mb-2 px-1`}>Filter</p>
      <FilterEditor column={column} filter={filter} onChange={onFilter} rows={rows} />
    </Popover>
  );
}

function ColumnItem({
  column,
  hidden,
  onToggle,
  onMove,
}: {
  column: DataColumn;
  hidden: boolean;
  onToggle: () => void;
  onMove: (delta: number) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="li"
      className="flex items-center gap-2 rounded-lg bg-white px-1 py-1 focus-within:ring-1 focus-within:ring-brand-blue/30 dark:bg-[#1c212a]"
      dragControls={controls}
      dragListener={false}
      onKeyDown={(event) => {
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          onMove(event.key === "ArrowUp" ? -1 : 1);
        }
      }}
      value={column.key}
    >
      <span
        aria-hidden
        className="cursor-grab touch-none rounded p-1 text-[#9ba4b5] hover:bg-[#f4f6fa] active:cursor-grabbing dark:hover:bg-white/10"
        onPointerDown={(event) => {
          controls.start(event);
        }}
      >
        <DotsSixVertical size={14} weight="bold" />
      </span>
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <input
          checked={!hidden}
          className="size-4 accent-brand-blue"
          onChange={onToggle}
          type="checkbox"
        />
        <span className="truncate">{column.label}</span>
        {column.group === "meta" ? (
          <span className="ml-auto shrink-0 text-[10px] text-[#9ba4b5]">meta</span>
        ) : null}
        {column.group === "extra" ? (
          <span className="ml-auto shrink-0 text-[10px] text-[#a97b1c]">computed</span>
        ) : null}
      </label>
    </Reorder.Item>
  );
}

/** Show, hide and reorder every column (drag the handle; arrow buttons for keyboards). */
export function ColumnsManager({
  anchor,
  columns,
  order,
  hidden,
  onOrder,
  onToggle,
  onShowAll,
  onReset,
  onClose,
}: {
  anchor: DOMRect;
  columns: DataColumn[];
  order: string[];
  hidden: Set<string>;
  onOrder: (order: string[]) => void;
  onToggle: (key: string) => void;
  onShowAll: (group: "answer" | "meta" | "all", show: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const move = (key: string, delta: number) => {
    const index = order.indexOf(key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    next.splice(index, 1);
    next.splice(target, 0, key);
    onOrder(next);
  };
  return (
    <Popover anchor={anchor} label="Columns" onClose={onClose} width={340}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <button
          className="rounded-lg px-2 py-1 font-semibold text-brand-blue hover:bg-brand-blue-50"
          onClick={() => {
            onShowAll("meta", true);
          }}
          type="button"
        >
          Show metadata
        </button>
        <button
          className="rounded-lg px-2 py-1 font-semibold text-brand-blue hover:bg-brand-blue-50"
          onClick={() => {
            onShowAll("meta", false);
          }}
          type="button"
        >
          Hide metadata
        </button>
        <button
          className="ml-auto rounded-lg px-2 py-1 font-semibold text-[#7e899d] hover:bg-[#f4f6fa]"
          onClick={onReset}
          type="button"
        >
          Reset
        </button>
      </div>
      <p className="mb-2 text-[11px] text-[#8a93a6]">
        Drag to reorder, or focus a column and use Alt + ↑ / ↓.
      </p>
      <Reorder.Group as="ul" axis="y" className="space-y-0.5" onReorder={onOrder} values={order}>
        {order.map((key) => {
          const column = byKey.get(key);
          if (!column) return null;
          return (
            <ColumnItem
              column={column}
              hidden={hidden.has(key)}
              key={key}
              onMove={(delta) => {
                move(key, delta);
              }}
              onToggle={() => {
                onToggle(key);
              }}
            />
          );
        })}
      </Reorder.Group>
    </Popover>
  );
}
