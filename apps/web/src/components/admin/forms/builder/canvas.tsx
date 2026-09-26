"use client";

import { Asterisk, Copy, Flag, HandWaving, Plus, Trash, X } from "@phosphor-icons/react";
import { Reorder, useDragControls } from "framer-motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildPages,
  estimateMinutes,
  richTextToPlain,
  type FormDocument,
  type FormField,
  type FormFieldType,
} from "@repo/shared";

import { isQuestion } from "@/lib/forms/builder-fields";

import { BlockCard, type BlockActions } from "./block-card";
import { FIELD_DRAG_TYPE, Palette } from "./palette";
import { useFocusTrap } from "./ui";

export type Selection = string | null;

function jumpSummary(document: FormDocument, field: FormField, pageTitles: Map<string, string>) {
  if (!field.jumps?.length) return undefined;
  const first = field.jumps[0];
  const target =
    first.to === "end"
      ? "submit"
      : first.to.startsWith("ending:")
        ? `ending "${document.endings.find((ending) => `ending:${ending.id}` === first.to)?.title ?? "?"}"`
        : (pageTitles.get(first.to) ?? "a later page");
  return field.jumps.length > 1
    ? `${field.jumps.length} jumps · first to ${target}`
    : `Jumps to ${target} when its rule matches`;
}

const SortableBlock = memo(function SortableBlock({
  onDragEnd,
  value,
  children,
}: {
  onDragEnd: () => void;
  value: string;
  children: (controls: ReturnType<typeof useDragControls>) => React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      className="relative"
      dragControls={controls}
      dragListener={false}
      layout="position"
      onDragEnd={onDragEnd}
      value={value}
      whileDrag={{ scale: 1.01, zIndex: 30, boxShadow: "0 30px 60px -30px rgba(20,32,58,0.45)" }}
    >
      {children(controls)}
    </Reorder.Item>
  );
});

function ScreenCard({
  active,
  children,
  icon,
  label,
  onSelect,
  tone,
}: {
  active: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  tone: string;
}) {
  return (
    <div
      aria-label={label}
      aria-selected={active}
      className={`group/card relative cursor-pointer rounded-2xl border px-4 py-3.5 outline-none transition focus-visible:ring-4 focus-visible:ring-brand-blue/20 ${active ? "border-brand-blue ring-4 ring-brand-blue/12" : "border-[#e1e6ef] hover:border-[#c8d0de] dark:border-white/10 dark:hover:border-white/20"} ${tone}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="option"
      tabIndex={0}
    >
      <p className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#5d687d] uppercase dark:text-white/50">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

function QuickAdd({
  anchor,
  onAdd,
  onClose,
}: {
  anchor: HTMLElement;
  onAdd: (type: FormFieldType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  const [position] = useState(() => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    return {
      top: Math.min(rect.bottom + 8, window.innerHeight - 440),
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      width,
    };
  });
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);
  return (
    <div
      aria-label="Add a block below"
      aria-modal="true"
      className="builder-pop-in fixed z-[70] rounded-2xl border border-[#dfe4ee] bg-[#f8f9fc] p-3 shadow-[0_30px_70px_-30px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-[#171b25]"
      data-builder-dialog=""
      ref={ref}
      role="dialog"
      style={{ top: Math.max(12, position.top), left: position.left, width: position.width }}
    >
      <Palette
        autoFocus
        dense
        onAdd={(type) => {
          onAdd(type);
          onClose();
        }}
      />
    </div>
  );
}

/**
 * The center column: the welcome screen, every block in order (sortable by
 * drag handle and by keyboard), then the ending screens. Palette items can
 * be dropped between blocks.
 */
export function Canvas({
  actions,
  document,
  issues,
  multi,
  onAddAt,
  onAddEnding,
  onBulk,
  onClearMulti,
  onReorder,
  readOnly,
  selection,
  onSelectScreen,
}: {
  actions: BlockActions & { addAfter: (id: string, type: FormFieldType) => void };
  document: FormDocument;
  issues: Map<string, string>;
  multi: Set<string>;
  onAddAt: (index: number, type: FormFieldType) => void;
  onAddEnding: () => void;
  onBulk: (action: "delete" | "duplicate" | "require" | "optional") => void;
  onClearMulti: () => void;
  onReorder: (order: string[]) => void;
  readOnly: boolean;
  selection: Selection;
  onSelectScreen: (id: string) => void;
}) {
  const ids = useMemo(() => document.fields.map((field) => field.id), [document.fields]);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const order = dragOrder ?? ids;
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  });
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(
    () => new Map(document.fields.map((field) => [field.id, field])),
    [document.fields],
  );
  const { numbers, pageNumbers, pageTitles } = useMemo(() => {
    const numbers = new Map<string, number>();
    const pageNumbers = new Map<string, number>();
    const pageTitles = new Map<string, string>();
    let count = 0;
    let page = 1;
    for (const field of document.fields) {
      if (isQuestion(field)) numbers.set(field.id, ++count);
      if (field.type === "page_break") {
        page += 1;
        pageNumbers.set(field.id, page);
        pageTitles.set(
          field.id,
          field.pageTitle?.trim() ? `"${field.pageTitle.trim()}"` : `page ${page}`,
        );
      }
    }
    return { numbers, pageNumbers, pageTitles };
  }, [document.fields]);

  const commitDrag = useCallback(() => {
    const next = orderRef.current;
    setDragOrder(null);
    onReorder(next);
  }, [onReorder]);

  const cardActions = useMemo<BlockActions>(
    () => ({
      ...actions,
      addBelow: (id, anchor) => {
        setQuickAdd({ id, anchor });
      },
    }),
    [actions],
  );

  const indexFromPointer = (clientY: number) => {
    const cards = listRef.current?.querySelectorAll<HTMLElement>(":scope > div > [data-block-id]");
    if (!cards?.length) return 0;
    let index = cards.length;
    for (let position = 0; position < cards.length; position += 1) {
      const rect = cards.item(position).getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = position;
        break;
      }
    }
    return index;
  };

  const pages = useMemo(() => buildPages(document.fields).length, [document.fields]);
  const welcome = document.welcome;
  const questionCount = numbers.size;

  return (
    <div className="mx-auto w-full max-w-3xl pb-24">
      <div aria-label="Form blocks" aria-multiselectable="true" role="listbox">
        <ScreenCard
          active={selection === "welcome"}
          icon={<HandWaving size={13} weight="bold" />}
          label={welcome.enabled ? "Welcome screen" : "Welcome screen (off)"}
          onSelect={() => {
            onSelectScreen("welcome");
          }}
          tone={
            welcome.enabled
              ? "bg-white dark:bg-white/[0.035]"
              : "bg-[#f3f5f9] opacity-70 dark:bg-white/[0.02]"
          }
        >
          <p className="mt-2 font-display text-lg font-semibold tracking-[-0.03em]">
            {welcome.title || document.title}
          </p>
          {welcome.body ? (
            <p className="mt-1 line-clamp-2 text-sm text-[#69748a] dark:text-white/50">
              {richTextToPlain(welcome.body)}
            </p>
          ) : null}
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#8490a5] dark:text-white/40">
            <span className="inline-flex h-7 items-center rounded-full bg-[#171b25] px-3 font-semibold text-white dark:bg-white dark:text-[#0e1116]">
              {welcome.buttonLabel || "Start"}
            </span>
            {welcome.showQuestionCount ? <span>{questionCount} questions</span> : null}
            {welcome.showDuration ? (
              <span>· about {estimateMinutes(document.fields)} min</span>
            ) : null}
            {pages > 1 ? <span>· {pages} pages</span> : null}
          </p>
        </ScreenCard>

        <div
          className="relative mt-4"
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropIndex(null);
          }}
          onDragOver={(event) => {
            if (readOnly || !event.dataTransfer.types.includes(FIELD_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            const index = indexFromPointer(event.clientY);
            if (index !== dropIndex) setDropIndex(index);
          }}
          onDrop={(event) => {
            const type = event.dataTransfer.getData(FIELD_DRAG_TYPE);
            if (!type) return;
            event.preventDefault();
            onAddAt(indexFromPointer(event.clientY), type as FormFieldType);
            setDropIndex(null);
          }}
        >
          {order.length ? (
            <Reorder.Group
              as="div"
              axis="y"
              className="space-y-3"
              onReorder={(next: string[]) => {
                setDragOrder(next);
              }}
              ref={listRef}
              values={order}
            >
              {order.map((id, index) => {
                const field = byId.get(id);
                if (!field) return null;
                return (
                  <SortableBlock key={id} onDragEnd={commitDrag} value={id}>
                    {(controls) => (
                      <>
                        {dropIndex === index ? <DropLine /> : null}
                        <BlockCard
                          actions={cardActions}
                          dragControls={controls}
                          field={field}
                          index={index}
                          issue={issues.get(id)}
                          jumpSummary={
                            field.type === "page_break"
                              ? jumpSummary(document, field, pageTitles)
                              : undefined
                          }
                          multi={multi.has(id)}
                          number={numbers.get(id)}
                          pageNumber={pageNumbers.get(id)}
                          readOnly={readOnly}
                          selected={selection === id}
                          total={order.length}
                        />
                      </>
                    )}
                  </SortableBlock>
                );
              })}
            </Reorder.Group>
          ) : (
            <div
              className={`grid min-h-44 place-items-center rounded-2xl border-2 border-dashed px-6 text-center transition ${dropIndex !== null ? "border-brand-blue bg-brand-blue/[0.04]" : "border-[#d3dae6] dark:border-white/10"}`}
            >
              <div>
                <p className="font-display text-lg font-semibold tracking-[-0.03em]">
                  Add your first question
                </p>
                <p className="mt-1 max-w-sm text-sm leading-6 text-[#778299] dark:text-white/45">
                  Pick a block from the palette, or drag one here. Page breaks split the form into
                  steps.
                </p>
              </div>
            </div>
          )}
          {dropIndex !== null && dropIndex >= order.length && order.length ? <DropLine /> : null}
        </div>

        <div className="mt-6 space-y-3">
          {document.endings.map((ending, index) => {
            const isDefault =
              !ending.when?.rules.length &&
              document.endings.findIndex((item) => !item.when?.rules.length) === index;
            return (
              <ScreenCard
                active={selection === `ending:${ending.id}`}
                icon={<Flag size={13} weight="bold" />}
                key={ending.id}
                label={`Ending ${index + 1}${isDefault ? " · default" : ending.when?.rules.length ? " · by rule" : ""}`}
                onSelect={() => {
                  onSelectScreen(`ending:${ending.id}`);
                }}
                tone="bg-white dark:bg-white/[0.035]"
              >
                <p className="mt-2 font-display text-lg font-semibold tracking-[-0.03em]">
                  {ending.title || "Untitled ending"}
                </p>
                {ending.body ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[#69748a] dark:text-white/50">
                    {richTextToPlain(ending.body)}
                  </p>
                ) : null}
                <p className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#8490a5]">
                  {ending.showScore ? <span>Shows the score</span> : null}
                  {ending.redirectUrl ? <span>Redirects to {ending.redirectUrl}</span> : null}
                  {ending.when?.rules.length ? <span>{ending.when.rules.length} rules</span> : null}
                </p>
              </ScreenCard>
            );
          })}
          {!readOnly ? (
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c6cedd] text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue disabled:opacity-40 dark:border-white/15 dark:text-white/55"
              disabled={document.endings.length >= 12}
              onClick={onAddEnding}
              type="button"
            >
              <Plus size={15} weight="bold" />
              Add an ending
            </button>
          ) : null}
        </div>
      </div>

      {multi.size > 1 && !readOnly ? (
        <div className="builder-rise-in fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div
            aria-label="Bulk actions"
            className="flex flex-wrap items-center gap-1 rounded-2xl border border-[#dfe4ee] bg-white p-1.5 shadow-[0_24px_55px_-24px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-[#1a1f2b]"
            role="toolbar"
          >
            <span className="px-2.5 text-sm font-semibold">{multi.size} selected</span>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-[#f2f5fa] dark:hover:bg-white/[0.07]"
              onClick={() => {
                onBulk("require");
              }}
              type="button"
            >
              <Asterisk size={15} weight="bold" /> Require
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-[#f2f5fa] dark:hover:bg-white/[0.07]"
              onClick={() => {
                onBulk("optional");
              }}
              type="button"
            >
              Optional
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-[#f2f5fa] dark:hover:bg-white/[0.07]"
              onClick={() => {
                onBulk("duplicate");
              }}
              type="button"
            >
              <Copy size={15} /> Duplicate
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand-red hover:bg-brand-red-50 dark:hover:bg-brand-red/15"
              onClick={() => {
                onBulk("delete");
              }}
              type="button"
            >
              <Trash size={15} /> Delete
            </button>
            <button
              aria-label="Clear selection"
              className="grid size-9 place-items-center rounded-xl text-[#667187] hover:bg-[#f2f5fa] dark:hover:bg-white/[0.07]"
              onClick={onClearMulti}
              type="button"
            >
              <X size={15} weight="bold" />
            </button>
          </div>
        </div>
      ) : null}

      {quickAdd ? (
        <QuickAdd
          anchor={quickAdd.anchor}
          onAdd={(type) => {
            actions.addAfter(quickAdd.id, type);
          }}
          onClose={() => {
            setQuickAdd(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DropLine() {
  return (
    <div aria-hidden="true" className="pointer-events-none relative -my-1.5 h-3">
      <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-brand-blue" />
      <span className="absolute top-1/2 left-0 size-2.5 -translate-y-1/2 rounded-full bg-brand-blue" />
    </div>
  );
}
