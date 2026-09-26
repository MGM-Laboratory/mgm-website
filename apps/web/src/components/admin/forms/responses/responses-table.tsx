"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Flag,
  PencilSimpleLine,
  Prohibit,
  Star,
} from "@phosphor-icons/react";
import type { FormAnswerValue } from "@repo/shared";

import type { DataColumn, WorkingRow } from "@/lib/forms/data/columns";
import type { SortState } from "@/lib/forms/data/filters";

import { AnswerEditor } from "./answer-editor";
import { CellView, answerIsEditable, type OpenFile } from "./cells";

export type Density = "compact" | "normal" | "roomy";
export function rowHeightOf(density: Density) {
  switch (density) {
    case "compact":
      return 34;
    case "normal":
      return 44;
    case "roomy":
      return 60;
  }
}
const LEAD_WIDTH = 76;
const OVERSCAN = 8;

type Props = {
  formId: string;
  rows: WorkingRow[];
  columns: DataColumn[];
  widths: Partial<Record<string, number>>;
  pinned: number;
  density: Density;
  sort: SortState;
  selected: Set<string>;
  activeRowId: string | null;
  canWrite: boolean;
  filteredKeys: Set<string>;
  onSort: (key: string) => void;
  onResize: (key: string, width: number) => void;
  onHeaderMenu: (column: DataColumn, anchor: DOMRect) => void;
  onToggleRow: (id: string, index: number, shift: boolean) => void;
  onToggleAll: () => void;
  onOpen: (row: WorkingRow) => void;
  onEdit: (row: WorkingRow, column: DataColumn, value: FormAnswerValue | undefined) => void;
  onOpenFile: OpenFile;
};

/**
 * The responses grid: windowed rows (only the visible ones plus a small
 * overscan are in the DOM, so ten thousand responses scroll smoothly), a
 * sticky header, pinned leading columns, resizable columns, type-aware
 * cells and inline editing.
 *
 * Keyboard: arrows move the active cell, Enter edits an answer cell (or
 * opens the response elsewhere), Space selects the row, O opens it.
 * Clicking a row opens it; double-clicking an answer cell edits it.
 */
export function ResponsesTable(props: Props) {
  const { rows, columns, widths, pinned, density, sort, selected, canWrite } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const [activeState, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const active = {
    row: Math.max(0, Math.min(activeState.row, rows.length - 1)),
    col: activeState.col,
  };
  const [editing, setEditing] = useState<{ rowId: string; key: string } | null>(null);
  const clickTimer = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const rowHeight = rowHeightOf(density);
  const headerHeight = 40;

  const layout = useMemo(() => {
    const cells: LayoutCell[] = [];
    let left = LEAD_WIDTH;
    for (const [index, column] of columns.entries()) {
      const width = widths[column.key] ?? column.width;
      cells.push({ column, width, left, pinned: index < pinned });
      left += width;
    }
    return { cells, total: left };
  }, [columns, widths, pinned]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      setViewport({ top: element.scrollTop, height: element.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    // One state update per frame at most.
    requestAnimationFrame(() => {
      setViewport((current) =>
        current.top === element.scrollTop
          ? current
          : { top: element.scrollTop, height: element.clientHeight },
      );
    });
  }, []);

  const start = Math.max(0, Math.floor(viewport.top / rowHeight) - OVERSCAN);
  const end = Math.min(
    rows.length,
    Math.ceil((viewport.top + viewport.height) / rowHeight) + OVERSCAN,
  );
  const visible = rows.slice(start, end);

  const scrollToRow = (index: number) => {
    const element = scrollRef.current;
    if (!element) return;
    const top = index * rowHeight;
    const bottom = top + rowHeight + headerHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight;
  };

  // Out-of-range positions (including -1, the lead column) have nothing, as with plain indexing.
  const rowAt = (index: number) => (index >= 0 ? rows.at(index) : undefined);
  const columnAt = (col: number) => (col >= 0 ? columns.at(col) : undefined);

  const scrollToColumn = (col: number) => {
    const element = scrollRef.current;
    const cell = col >= 0 ? layout.cells.at(col) : undefined;
    if (!element || !cell || cell.pinned) return;
    const pinnedWidth = layout.cells
      .filter((item) => item.pinned)
      .reduce((sum, item) => sum + item.width, LEAD_WIDTH);
    if (cell.left < element.scrollLeft + pinnedWidth) element.scrollLeft = cell.left - pinnedWidth;
    else if (cell.left + cell.width > element.scrollLeft + element.clientWidth)
      element.scrollLeft = cell.left + cell.width - element.clientWidth;
  };

  const startEdit = (row: WorkingRow, column: DataColumn) => {
    if (!canWrite || !answerIsEditable(column)) return false;
    setEditing({ rowId: row.id, key: column.key });
    return true;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const maxRow = rows.length - 1;
    const maxCol = columns.length - 1;
    let { row, col } = active;
    switch (event.key) {
      case "ArrowDown":
        row = Math.min(maxRow, row + 1);
        break;
      case "ArrowUp":
        row = Math.max(0, row - 1);
        break;
      case "ArrowRight":
        col = Math.min(maxCol, col + 1);
        break;
      case "ArrowLeft":
        col = Math.max(-1, col - 1);
        break;
      case "PageDown":
        row = Math.min(maxRow, row + Math.floor(viewport.height / rowHeight));
        break;
      case "PageUp":
        row = Math.max(0, row - Math.floor(viewport.height / rowHeight));
        break;
      case "Home":
        if (event.ctrlKey || event.metaKey) row = 0;
        col = -1;
        break;
      case "End":
        if (event.ctrlKey || event.metaKey) row = maxRow;
        col = maxCol;
        break;
      case "Enter": {
        const target = rowAt(row);
        if (!target) return;
        event.preventDefault();
        const column = columnAt(col);
        if (!(column && startEdit(target, column))) props.onOpen(target);
        return;
      }
      case "o":
      case "O": {
        const target = rowAt(row);
        if (target) props.onOpen(target);
        return;
      }
      case " ": {
        event.preventDefault();
        const target = rowAt(row);
        if (target) props.onToggleRow(target.id, row, event.shiftKey);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    setActive({ row, col });
    scrollToRow(row);
    scrollToColumn(col);
  };

  /** The body cell a pointer event landed in (not the lead column, not an open editor). */
  const cellOf = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-cell-editor]")) return null;
    const cell = target.closest<HTMLElement>("[data-grid-col]");
    const rowElement = cell?.closest<HTMLElement>("[data-grid-row]");
    if (!cell || !rowElement || !event.currentTarget.contains(rowElement)) return null;
    const index = Number(rowElement.dataset.gridRow);
    const row = rowAt(index);
    return row ? { row, index, col: Number(cell.dataset.gridCol) } : null;
  };

  // Clicks are handled here, on the grid that also owns the keyboard: a
  // click activates the cell and opens the row, a double click edits an
  // answer cell (Enter does the same from the keyboard).
  const onGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const hit = cellOf(event);
    if (!hit) return;
    setActive({ row: hit.index, col: hit.col });
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      props.onOpen(hit.row);
    }, 230);
  };

  const onGridDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const hit = cellOf(event);
    if (!hit) return;
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    const column = columnAt(hit.col);
    if (!column || !startEdit(hit.row, column)) props.onOpen(hit.row);
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someSelected = !allSelected && rows.some((row) => selected.has(row.id));
  const activeRow = rowAt(active.row);
  const activeId = activeRow ? `cell-${activeRow.id}-${active.col}` : undefined;
  const pinnedEdge = layout.cells.filter((cell) => cell.pinned).at(-1);

  return (
    <div
      aria-activedescendant={activeId}
      aria-colcount={columns.length + 1}
      aria-label="Responses"
      aria-multiselectable="true"
      aria-rowcount={rows.length + 1}
      className="relative h-full min-h-0 overflow-auto overscroll-contain rounded-xl border border-[#e4e8f0] bg-white text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 dark:border-white/10 dark:bg-[#12151b]"
      data-testid="responses-grid"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onClick={onGridClick}
      onDoubleClick={onGridDoubleClick}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
      ref={scrollRef}
      role="grid"
      tabIndex={0}
    >
      <div className="sticky top-0 z-20" role="rowgroup" style={{ width: layout.total }}>
        <div
          aria-rowindex={1}
          className="flex border-b border-[#e4e8f0] bg-[#f8f9fb] dark:border-white/10 dark:bg-[#171b22]"
          role="row"
          style={{ height: headerHeight, width: layout.total }}
        >
          <div
            className="sticky left-0 z-10 flex items-center gap-2 border-r border-[#eef0f4] bg-[#f8f9fb] px-3 dark:border-white/5 dark:bg-[#171b22]"
            role="columnheader"
            style={{ width: LEAD_WIDTH, minWidth: LEAD_WIDTH }}
          >
            <input
              aria-label={allSelected ? "Unselect all" : "Select all shown"}
              checked={allSelected}
              className="size-4 accent-brand-blue"
              onChange={props.onToggleAll}
              ref={(element) => {
                if (element) element.indeterminate = someSelected;
              }}
              type="checkbox"
            />
          </div>
          {layout.cells.map((cell) => (
            <HeaderCell
              cell={cell}
              filtered={props.filteredKeys.has(cell.column.key)}
              isEdge={cell === pinnedEdge}
              key={cell.column.key}
              onMenu={props.onHeaderMenu}
              onResize={props.onResize}
              onSort={props.onSort}
              sort={sort?.key === cell.column.key ? sort.direction : null}
            />
          ))}
        </div>
      </div>
      <div
        className="relative"
        role="rowgroup"
        style={{ height: rows.length * rowHeight, width: layout.total }}
      >
        {visible.map((row, offset) => {
          const index = start + offset;
          return (
            <Row
              activeCol={focused && active.row === index ? active.col : null}
              canWrite={canWrite}
              cells={layout.cells}
              density={density}
              editingKey={editing?.rowId === row.id ? editing.key : null}
              formId={props.formId}
              index={index}
              isActiveRow={props.activeRowId === row.id}
              isEdgeKey={pinnedEdge?.column.key ?? null}
              key={row.id}
              onCancelEdit={() => {
                setEditing(null);
              }}
              onCommitEdit={(column, value) => {
                setEditing(null);
                props.onEdit(row, column, value);
                scrollRef.current?.focus();
              }}
              onOpenFile={props.onOpenFile}
              onToggle={(shift) => {
                props.onToggleRow(row.id, index, shift);
              }}
              row={row}
              rowHeight={rowHeight}
              selected={selected.has(row.id)}
              total={layout.total}
            />
          );
        })}
      </div>
      {!rows.length ? (
        <div className="sticky left-0 flex h-40 w-full items-center justify-center text-sm text-[#9ba4b5] dark:text-white/35">
          No responses match.
        </div>
      ) : null}
    </div>
  );
}

type LayoutCell = { column: DataColumn; width: number; left: number; pinned: boolean };

function HeaderCell({
  cell,
  sort,
  filtered,
  isEdge,
  onSort,
  onResize,
  onMenu,
}: {
  cell: LayoutCell;
  sort: "asc" | "desc" | null;
  filtered: boolean;
  isEdge: boolean;
  onSort: (key: string) => void;
  onResize: (key: string, width: number) => void;
  onMenu: (column: DataColumn, anchor: DOMRect) => void;
}) {
  const { column, width, left, pinned } = cell;
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"}
      className={`group relative flex shrink-0 items-center border-r border-[#eef0f4] dark:border-white/5 ${pinned ? "sticky z-10 bg-[#f8f9fb] dark:bg-[#171b22]" : ""} ${isEdge ? "shadow-[6px_0_8px_-6px_rgba(20,32,58,0.18)]" : ""}`}
      role="columnheader"
      style={{ width, minWidth: width, left: pinned ? left : undefined }}
    >
      <button
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#687187] outline-none hover:text-[#171b25] focus-visible:bg-brand-blue-50 dark:text-white/45 dark:hover:text-white"
        onClick={() => {
          onSort(column.key);
        }}
        title={`${column.label} · sort`}
        type="button"
      >
        {column.group === "extra" ? (
          <span className="rounded bg-brand-yellow-50 px-1 text-[9px] text-[#8a6412] dark:bg-brand-yellow/15 dark:text-brand-yellow">
            fx
          </span>
        ) : null}
        <span className="truncate normal-case tracking-normal text-[12px]">{column.label}</span>
        {sort === "asc" ? (
          <ArrowUp aria-hidden className="shrink-0 text-brand-blue" size={12} weight="bold" />
        ) : null}
        {sort === "desc" ? (
          <ArrowDown aria-hidden className="shrink-0 text-brand-blue" size={12} weight="bold" />
        ) : null}
      </button>
      <button
        aria-label={`${column.label} options${filtered ? " (filtered)" : ""}`}
        className={`mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-brand-blue dark:hover:bg-white/10 ${filtered ? "bg-brand-blue text-white hover:bg-brand-blue" : "text-[#8a93a6] opacity-60 group-hover:opacity-100"}`}
        onClick={(event) => {
          onMenu(column, event.currentTarget.getBoundingClientRect());
        }}
        type="button"
      >
        <CaretDown size={12} weight="bold" />
      </button>
      <span
        aria-hidden
        className="absolute top-0 right-[-3px] z-10 h-full w-[6px] cursor-col-resize touch-none hover:bg-brand-blue/40"
        onDoubleClick={() => {
          onResize(column.key, column.width);
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          resizeStart.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!resizeStart.current) return;
          onResize(
            column.key,
            Math.max(
              70,
              Math.min(640, resizeStart.current.width + event.clientX - resizeStart.current.x),
            ),
          );
        }}
        onPointerUp={() => {
          resizeStart.current = null;
        }}
      />
    </div>
  );
}

const Row = memo(function Row({
  row,
  index,
  cells,
  total,
  rowHeight,
  density,
  selected,
  activeCol,
  isActiveRow,
  isEdgeKey,
  editingKey,
  formId,
  canWrite,
  onToggle,
  onCommitEdit,
  onCancelEdit,
  onOpenFile,
}: {
  row: WorkingRow;
  index: number;
  cells: LayoutCell[];
  total: number;
  rowHeight: number;
  density: Density;
  selected: boolean;
  activeCol: number | null;
  isActiveRow: boolean;
  isEdgeKey: string | null;
  editingKey: string | null;
  formId: string;
  canWrite: boolean;
  onToggle: (shift: boolean) => void;
  onCommitEdit: (column: DataColumn, value: FormAnswerValue | undefined) => void;
  onCancelEdit: () => void;
  onOpenFile: OpenFile;
}) {
  const record = row.record;
  const base = selected
    ? "bg-brand-blue-50 dark:bg-[#1b2538]"
    : isActiveRow
      ? "bg-[#f4f6fa] dark:bg-[#191d25]"
      : index % 2
        ? "bg-[#fcfcfd] dark:bg-[#13161c]"
        : "bg-white dark:bg-[#12151b]";
  return (
    <div
      aria-rowindex={index + 2}
      aria-selected={selected}
      className={`group/row absolute left-0 flex border-b border-[#f0f2f6] dark:border-white/[0.04] ${base} hover:bg-[#f6f8fc] dark:hover:bg-[#181c24]`}
      data-grid-row={index}
      data-response-id={row.id}
      role="row"
      style={{ top: index * rowHeight, height: rowHeight, width: total }}
    >
      <div
        className={`sticky left-0 z-10 flex items-center gap-1.5 border-r border-[#f0f2f6] px-3 dark:border-white/[0.04] ${base} group-hover/row:bg-[#f6f8fc] dark:group-hover/row:bg-[#181c24] ${activeCol === -1 ? "ring-2 ring-inset ring-brand-blue" : ""}`}
        id={`cell-${row.id}--1`}
        role="gridcell"
        style={{ width: LEAD_WIDTH, minWidth: LEAD_WIDTH }}
      >
        <input
          aria-label={`Select response ${index + 1}`}
          checked={selected}
          className="size-4 shrink-0 accent-brand-blue"
          onChange={() => undefined}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(event.shiftKey);
          }}
          tabIndex={-1}
          type="checkbox"
        />
        <span className="flex flex-col items-center gap-0.5">
          {record.admin.starred ? (
            <Star aria-label="Starred" className="text-[#e0a82a]" size={11} weight="fill" />
          ) : null}
          {record.admin.flagged ? (
            <Flag aria-label="Flagged" className="text-brand-red" size={11} weight="fill" />
          ) : null}
          {record.admin.editedAt ? (
            <span title={`Edited ${new Date(record.admin.editedAt).toLocaleString()}`}>
              <PencilSimpleLine aria-label="Edited" className="text-[#8a93a6]" size={11} />
            </span>
          ) : null}
        </span>
        {record.spam ? (
          <span title="Marked as spam">
            <Prohibit aria-label="Spam" className="text-brand-red" size={12} weight="bold" />
          </span>
        ) : null}
      </div>
      {cells.map((cell, col) => {
        const isEditing = editingKey === cell.column.key;
        const editable = canWrite && answerIsEditable(cell.column);
        return (
          <div
            className={`relative flex shrink-0 items-center overflow-hidden border-r border-[#f0f2f6] px-3 text-[#252a36] dark:border-white/[0.04] dark:text-white/80 ${cell.pinned ? `sticky z-[5] ${base} group-hover/row:bg-[#f6f8fc] dark:group-hover/row:bg-[#181c24]` : ""} ${isEdgeKey === cell.column.key ? "shadow-[6px_0_8px_-6px_rgba(20,32,58,0.18)]" : ""} ${activeCol === col ? "ring-2 ring-inset ring-brand-blue" : ""} ${isEditing ? "overflow-visible z-30" : ""} ${editable ? "cursor-text" : "cursor-pointer"}`}
            data-grid-col={col}
            id={`cell-${row.id}-${col}`}
            key={cell.column.key}
            role="gridcell"
            style={{
              width: cell.width,
              minWidth: cell.width,
              left: cell.pinned ? cell.left : undefined,
            }}
          >
            {isEditing ? (
              <div
                className="absolute top-1 left-1 z-30"
                data-cell-editor=""
                style={{ minWidth: Math.max(cell.width - 8, 220) }}
              >
                <AnswerEditor
                  answers={row.answers}
                  column={cell.column}
                  onCancel={onCancelEdit}
                  onCommit={(value) => {
                    onCommitEdit(cell.column, value);
                  }}
                />
              </div>
            ) : (
              <div className={`min-w-0 flex-1 ${density === "roomy" ? "" : "truncate"}`}>
                <CellView column={cell.column} formId={formId} onOpenFile={onOpenFile} row={row} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
