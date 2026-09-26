"use client";

import {
  ArrowBendDownRight,
  ArrowDown,
  ArrowUp,
  Copy,
  DotsSixVertical,
  Eye,
  Plus,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import type { DragControls } from "framer-motion";
import { memo } from "react";

import type { FormField } from "@repo/shared";

import { FIELD_TYPE_INFO } from "@/lib/forms/builder-fields";

import { FAMILY_TONES, FieldIcon } from "./field-icons";
import { FieldRendition } from "./field-rendition";

export type BlockActions = {
  select: (
    id: string,
    event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  ) => void;
  setLabel: (id: string, label: string) => void;
  setPageTitle: (id: string, title: string) => void;
  toggleRequired: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, delta: number) => void;
  addBelow: (id: string, anchor: HTMLElement) => void;
};

const toolButton =
  "grid size-8 place-items-center rounded-lg text-[#667187] transition hover:bg-[#eef1f7] hover:text-[#171b25] focus-visible:ring-2 focus-visible:ring-brand-blue/30 focus-visible:outline-none disabled:opacity-30 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white";

function LabelInput({
  field,
  onChange,
  placeholder,
  className,
}: {
  field: FormField;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
}) {
  return (
    <textarea
      aria-label={`${FIELD_TYPE_INFO[field.type].label} label`}
      className={`block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-[#a8b0c0] placeholder:italic focus:placeholder:text-[#c4cbd8] dark:placeholder:text-white/25 [field-sizing:content] ${className}`}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
        event.stopPropagation();
      }}
      placeholder={placeholder}
      rows={1}
      value={field.label}
    />
  );
}

export const BlockCard = memo(function BlockCard({
  actions,
  dragControls,
  field,
  index,
  issue,
  multi,
  number,
  pageNumber,
  jumpSummary,
  selected,
  total,
  readOnly,
}: {
  actions: BlockActions;
  dragControls?: DragControls;
  field: FormField;
  index: number;
  /** A problem on this block (red dot and message). */
  issue?: string;
  multi: boolean;
  number?: number;
  pageNumber?: number;
  jumpSummary?: string;
  selected: boolean;
  total: number;
  readOnly: boolean;
}) {
  const info = FIELD_TYPE_INFO[field.type];
  const hasRules = Boolean(field.visibleIf?.rules.length);
  const isPageBreak = field.type === "page_break";

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      actions.move(field.id, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.select(field.id, event);
    } else if ((event.key === "Delete" || event.key === "Backspace") && !readOnly) {
      event.preventDefault();
      actions.remove(field.id);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && !readOnly) {
      event.preventDefault();
      actions.duplicate(field.id);
    }
  };

  const toolbar = readOnly ? null : (
    <div
      className={`absolute -top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[#dfe4ee] bg-white p-0.5 shadow-[0_10px_24px_-16px_rgba(20,32,58,0.55)] transition dark:border-white/10 dark:bg-[#1a1f2b] ${selected ? "opacity-100" : "pointer-events-none opacity-0 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 group-hover/card:pointer-events-auto group-hover/card:opacity-100"}`}
    >
      <button
        aria-label="Move up"
        className={toolButton}
        disabled={index === 0}
        onClick={(event) => {
          event.stopPropagation();
          actions.move(field.id, -1);
        }}
        title="Move up (Alt+↑)"
        type="button"
      >
        <ArrowUp size={15} />
      </button>
      <button
        aria-label="Move down"
        className={toolButton}
        disabled={index === total - 1}
        onClick={(event) => {
          event.stopPropagation();
          actions.move(field.id, 1);
        }}
        title="Move down (Alt+↓)"
        type="button"
      >
        <ArrowDown size={15} />
      </button>
      <button
        aria-label="Duplicate"
        className={toolButton}
        onClick={(event) => {
          event.stopPropagation();
          actions.duplicate(field.id);
        }}
        title="Duplicate (Cmd/Ctrl+D)"
        type="button"
      >
        <Copy size={15} />
      </button>
      <button
        aria-label="Add a block below"
        className={toolButton}
        onClick={(event) => {
          event.stopPropagation();
          actions.addBelow(field.id, event.currentTarget);
        }}
        title="Add below"
        type="button"
      >
        <Plus size={15} weight="bold" />
      </button>
      <button
        aria-label="Delete"
        className={`${toolButton} hover:!bg-brand-red-50 hover:!text-brand-red`}
        onClick={(event) => {
          event.stopPropagation();
          actions.remove(field.id);
        }}
        title="Delete"
        type="button"
      >
        <Trash size={15} />
      </button>
    </div>
  );

  const handle = readOnly ? null : (
    <button
      aria-label={`Drag to reorder ${info.label}`}
      className="absolute top-1/2 -left-1 z-10 grid h-10 w-6 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-md text-[#b3bccb] opacity-0 transition group-focus-within/card:opacity-100 group-hover/card:opacity-100 hover:text-[#5d687d] active:cursor-grabbing sm:-left-3 dark:text-white/25"
      onPointerDown={(event) => {
        event.preventDefault();
        dragControls?.start(event);
      }}
      tabIndex={-1}
      title="Drag to reorder"
      type="button"
    >
      <DotsSixVertical size={18} weight="bold" />
    </button>
  );

  const ring = selected
    ? "border-brand-blue ring-4 ring-brand-blue/12"
    : multi
      ? "border-brand-blue/60 bg-brand-blue-50/40 dark:bg-brand-blue/10"
      : "border-[#e1e6ef] hover:border-[#c8d0de] dark:border-white/10 dark:hover:border-white/20";

  if (isPageBreak) {
    return (
      <div
        aria-label={`Page ${pageNumber ?? ""} break${field.pageTitle ? `: ${field.pageTitle}` : ""}`}
        aria-selected={selected}
        className="group/card relative py-2 outline-none"
        data-block-id={field.id}
        onClick={(event) => {
          actions.select(field.id, event);
        }}
        onKeyDown={onKeyDown}
        role="option"
        tabIndex={0}
      >
        {handle}
        {toolbar}
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed px-4 py-2.5 transition group-focus-visible/card:ring-4 group-focus-visible/card:ring-brand-blue/20 ${selected ? "border-brand-blue bg-brand-blue-50/60 dark:bg-brand-blue/10" : multi ? "border-brand-blue/60" : "border-[#c8d0de] bg-[#f3f5f9] dark:border-white/15 dark:bg-white/[0.03]"}`}
        >
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.14em] text-[#5d687d] uppercase dark:text-white/50">
            <FieldIcon size={13} type="page_break" />
            Page {pageNumber}
          </span>
          <input
            aria-label="Page title"
            className="min-w-0 flex-1 basis-40 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-[#a8b0c0] dark:placeholder:text-white/25"
            onChange={(event) => {
              actions.setPageTitle(field.id, event.target.value);
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            placeholder="Page title (optional)"
            readOnly={readOnly}
            value={field.pageTitle ?? ""}
          />
          {jumpSummary ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-brand-yellow-50 px-2 py-0.5 text-[11px] font-semibold text-[#8a6412] dark:bg-brand-yellow/15 dark:text-brand-yellow">
              <ArrowBendDownRight size={12} weight="bold" />
              <span className="truncate">{jumpSummary}</span>
            </span>
          ) : null}
          {hasRules ? (
            <Eye aria-label="Has visibility rules" className="text-brand-blue" size={14} />
          ) : null}
          {issue ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-red"
              title={issue}
            >
              <Warning size={13} weight="fill" />
              Problem
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const content = !info || field.type === "divider" || field.type === "spacer";
  const isHeading = field.type === "heading";
  const labelEditable = !["paragraph", "callout", "divider", "spacer", "image", "video"].includes(
    field.type,
  );

  return (
    <div
      aria-label={`${number ? `Question ${number}, ` : ""}${info.label}${field.label ? `: ${field.label}` : ""}`}
      aria-selected={selected}
      className={`group/card relative rounded-2xl border bg-white px-4 pt-3.5 pb-4 shadow-[0_10px_30px_-28px_rgba(20,32,58,0.5)] outline-none transition focus-visible:ring-4 focus-visible:ring-brand-blue/20 dark:bg-white/[0.035] ${ring} ${field.width === "half" ? "sm:ml-0 sm:max-w-[calc(50%+2rem)]" : ""}`}
      data-block-id={field.id}
      onClick={(event) => {
        actions.select(field.id, event);
      }}
      onKeyDown={onKeyDown}
      role="option"
      tabIndex={0}
    >
      {handle}
      {toolbar}
      <div className="flex items-center gap-2">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-md ${FAMILY_TONES[info.family]}`}
        >
          <FieldIcon size={13} type={field.type} />
        </span>
        {number ? (
          <span className="font-mono text-[11px] font-bold text-[#7e899d] tabular-nums dark:text-white/40">
            {number}
          </span>
        ) : null}
        <span className="truncate text-[11px] font-semibold text-[#8490a5] dark:text-white/40">
          {info.label}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {issue ? (
            <span className="text-brand-red" title={issue}>
              <Warning aria-label={issue} size={14} weight="fill" />
            </span>
          ) : null}
          {hasRules ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-brand-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-blue dark:bg-brand-blue/15"
              title="Shown only when its rules match"
            >
              <Eye aria-hidden="true" size={11} weight="bold" />
              Logic
            </span>
          ) : null}
          {field.width === "half" ? (
            <span className="rounded-full bg-[#eef1f6] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#5d687d] dark:bg-white/10 dark:text-white/50">
              ½
            </span>
          ) : null}
          {info.family !== "layout" && field.type !== "hidden" && !readOnly ? (
            <button
              aria-label={
                field.required
                  ? "Required, click to make optional"
                  : "Optional, click to make required"
              }
              aria-pressed={field.required}
              className={`inline-flex h-6 items-center rounded-full px-2 text-[10px] font-bold tracking-[0.06em] uppercase transition ${field.required ? "bg-brand-red-50 text-brand-red dark:bg-brand-red/15" : "text-[#9ba4b5] hover:bg-[#eef1f6] dark:text-white/30 dark:hover:bg-white/10"}`}
              onClick={(event) => {
                event.stopPropagation();
                actions.toggleRequired(field.id);
              }}
              type="button"
            >
              {field.required ? "Required" : "Optional"}
            </button>
          ) : null}
        </span>
      </div>
      {labelEditable && !content ? (
        readOnly ? (
          <p
            className={`mt-2 ${isHeading ? "font-display text-xl font-semibold tracking-[-0.03em]" : "text-[15px] font-semibold"}`}
          >
            {field.label || <span className="text-[#a8b0c0] italic">Untitled</span>}
          </p>
        ) : (
          <div className="mt-1.5">
            <LabelInput
              className={
                isHeading
                  ? "font-display text-xl leading-tight font-semibold tracking-[-0.03em]"
                  : field.type === "quote"
                    ? "text-xs text-[#69748a] dark:text-white/50"
                    : "text-[15px] leading-6 font-semibold text-[#171b25] dark:text-white"
              }
              field={field}
              onChange={(value) => {
                actions.setLabel(field.id, value);
              }}
              placeholder={
                isHeading
                  ? "Heading"
                  : field.type === "quote"
                    ? "Attribution (optional)"
                    : "Type a question"
              }
            />
          </div>
        )
      ) : null}
      {field.type !== "heading" ? (
        <div className={labelEditable ? "mt-2.5" : "mt-2"}>
          <FieldRendition field={field} />
        </div>
      ) : null}
      {field.help ? (
        <p className="mt-2 text-xs text-[#8490a5] dark:text-white/40">{field.help}</p>
      ) : null}
    </div>
  );
});
