"use client";

import { Plus, SidebarSimple, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { FormFieldType } from "@repo/shared";

import type { Problem } from "@/lib/forms/builder-document";
import { FIELD_TYPE_INFO, createField, documentIds } from "@/lib/forms/builder-fields";
import {
  addEnding,
  duplicateFields,
  insertFields,
  insertFieldsAt,
  moveField,
  patchField,
  referencesTo,
  removeFields,
  reorderFields,
} from "@/lib/forms/builder-ops";

import type { BlockActions } from "./block-card";
import { Canvas } from "./canvas";
import { FieldInspector } from "./inspector/field-inspector";
import { EndingInspector, FormInspector, WelcomeInspector } from "./inspector/screen-inspector";
import { Palette } from "./palette";
import type { TabProps } from "./types";
import { eyebrowClass, useAnnouncer, useFocusTrap } from "./ui";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function Sheet({
  children,
  label,
  onClose,
  side,
}: {
  children: React.ReactNode;
  label: string;
  onClose: () => void;
  side: "left" | "bottom";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  return (
    <div className="fixed inset-0 z-[75]">
      <div
        aria-hidden="true"
        className="builder-fade-in absolute inset-0 bg-[#0b0f18]/40"
        onMouseDown={onClose}
      />
      <div
        aria-label={label}
        aria-modal="true"
        className={`builder-dialog-in absolute flex flex-col overflow-hidden border-[#dfe4ee] bg-[#f8f9fc] shadow-[0_30px_80px_-30px_rgba(10,20,40,0.6)] dark:border-white/10 dark:bg-[#131720] ${side === "left" ? "inset-y-0 left-0 w-[min(22rem,88vw)] border-r" : "inset-x-0 bottom-0 max-h-[82dvh] rounded-t-3xl border-t"}`}
        data-builder-dialog=""
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e3e7f0] px-4 py-2.5 dark:border-white/10">
          {side === "bottom" ? (
            <span
              aria-hidden="true"
              className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-[#cfd6e3] dark:bg-white/20"
            />
          ) : null}
          <p className="text-sm font-semibold">{label}</p>
          <button
            aria-label={`Close ${label.toLowerCase()}`}
            className="grid size-10 place-items-center rounded-lg text-[#667187] hover:bg-[#eef1f7] dark:hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/**
 * The Build tab: the add palette, the canvas and the inspector. Three
 * columns from 1280 px; the palette moves into a drawer below that, and on
 * phones and portrait tablets the inspector opens as a bottom sheet.
 */
export function BuildTab({
  change,
  document,
  multi,
  origin,
  problems,
  readOnly,
  record,
  select,
  selection,
  setMulti,
  undo,
}: TabProps & {
  multi: Set<string>;
  origin: string;
  problems: Problem[];
  setMulti: (next: Set<string>) => void;
  undo: () => void;
}) {
  const wide = useMediaQuery("(min-width: 1280px)");
  const medium = useMediaQuery("(min-width: 1024px)");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { announce, node: announcer } = useAnnouncer();

  const latest = useRef({ document, selection, multi });
  useEffect(() => {
    latest.current = { document, selection, multi };
  });

  const issues = useMemo(() => {
    const map = new Map<string, string>();
    for (const problem of problems)
      if (!map.has(problem.target)) map.set(problem.target, problem.message);
    return map;
  }, [problems]);

  const focusBlock = useCallback((id: string) => {
    window.requestAnimationFrame(() => {
      const element = window.document.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(id)}"]`,
      );
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      element?.classList.add("builder-flash");
      window.setTimeout(() => element?.classList.remove("builder-flash"), 900);
    });
  }, []);

  const addField = useCallback(
    (type: FormFieldType, place: { after?: string | null; at?: number } = {}) => {
      if (readOnly) return;
      const current = latest.current.document;
      if (current.fields.length >= 250) {
        toast.error("A form can hold up to 250 blocks.");
        return;
      }
      const field = createField(type, documentIds(current));
      change((doc) => {
        if (place.at !== undefined) return insertFieldsAt(doc, [field], place.at);
        const anchor = place.after !== undefined ? place.after : latest.current.selection;
        const valid = anchor && doc.fields.some((item) => item.id === anchor) ? anchor : null;
        return insertFields(doc, [field], valid);
      });
      select(field.id);
      setPaletteOpen(false);
      announce(`${FIELD_TYPE_INFO[type].label} added`);
      focusBlock(field.id);
    },
    [announce, change, focusBlock, readOnly, select],
  );

  const actions = useMemo<BlockActions & { addAfter: (id: string, type: FormFieldType) => void }>(
    () => ({
      select: (id, event) => {
        if (event && (event.shiftKey || event.metaKey || event.ctrlKey)) {
          const next = new Set(latest.current.multi);
          if (latest.current.selection && !next.size) next.add(latest.current.selection);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setMulti(next);
          return;
        }
        if (latest.current.multi.size) setMulti(new Set());
        select(id);
        setSheetOpen(true);
      },
      setLabel: (id, label) => {
        change((doc) => patchField(doc, id, { label }), `${id}:label`);
      },
      setPageTitle: (id, pageTitle) => {
        change(
          (doc) => patchField(doc, id, { pageTitle: pageTitle || undefined }),
          `${id}:pageTitle`,
        );
      },
      toggleRequired: (id) => {
        change((doc) => patchField(doc, id, (field) => ({ ...field, required: !field.required })));
      },
      duplicate: (id) => {
        const result = duplicateFields(latest.current.document, [id]);
        if (!result.newIds.length) return;
        change(() => result.document);
        select(result.newIds[0]);
        announce("Block duplicated");
        focusBlock(result.newIds[0]);
      },
      remove: (id) => {
        const current = latest.current.document;
        const index = current.fields.findIndex((field) => field.id === id);
        const field = current.fields[index];
        if (!field) return;
        const users = referencesTo(current, id).filter((user) => user !== id);
        change((doc) => removeFields(doc, [id]));
        const next = current.fields[index + 1] ?? current.fields[index - 1];
        select(next ? next.id : null);
        announce(`${FIELD_TYPE_INFO[field.type].label} deleted`);
        toast(`Deleted “${field.label || FIELD_TYPE_INFO[field.type].label}”`, {
          description: users.length
            ? `${users.length} rule${users.length === 1 ? "" : "s"} still point at it; see Problems.`
            : undefined,
          action: {
            label: "Undo",
            onClick: () => {
              undo();
            },
          },
        });
      },
      move: (id, delta) => {
        const current = latest.current.document;
        const index = current.fields.findIndex((field) => field.id === id);
        const target = index + delta;
        if (index === -1 || target < 0 || target >= current.fields.length) return;
        change((doc) => moveField(doc, id, delta));
        announce(`Moved to position ${target + 1} of ${current.fields.length}`);
        window.requestAnimationFrame(() =>
          window.document
            .querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
            ?.focus(),
        );
      },
      addBelow: () => undefined,
      addAfter: (id, type) => {
        addField(type, { after: id });
      },
    }),
    [addField, announce, change, focusBlock, select, setMulti, undo],
  );

  const onReorder = useCallback(
    (order: string[]) => {
      change((doc) => reorderFields(doc, order));
      announce("Blocks reordered");
    },
    [announce, change],
  );

  const onBulk = useCallback(
    (action: "delete" | "duplicate" | "require" | "optional") => {
      const ids = [...latest.current.multi];
      if (!ids.length) return;
      if (action === "delete") {
        change((doc) => removeFields(doc, ids));
        select(null);
        toast(`Deleted ${ids.length} blocks`, {
          action: {
            label: "Undo",
            onClick: () => {
              undo();
            },
          },
        });
      } else if (action === "duplicate") {
        const result = duplicateFields(latest.current.document, ids);
        change(() => result.document);
        setMulti(new Set(result.newIds));
        return;
      } else {
        const required = action === "require";
        change((doc) => ({
          ...doc,
          fields: doc.fields.map((field) =>
            ids.includes(field.id) &&
            FIELD_TYPE_INFO[field.type].family !== "layout" &&
            field.type !== "hidden"
              ? { ...field, required }
              : field,
          ),
        }));
        return;
      }
      setMulti(new Set());
    },
    [change, select, setMulti, undo],
  );

  const onAddEnding = useCallback(() => {
    const result = addEnding(latest.current.document);
    change(() => result.document);
    select(`ending:${result.id}`);
    setSheetOpen(true);
  }, [change, select]);

  const selectScreen = useCallback(
    (id: string) => {
      setMulti(new Set());
      select(id);
      setSheetOpen(true);
    },
    [select, setMulti],
  );

  const selectedIndex = selection
    ? document.fields.findIndex((field) => field.id === selection)
    : -1;
  const selectedField = selectedIndex >= 0 ? document.fields[selectedIndex] : undefined;
  const selectedEnding = selection?.startsWith("ending:")
    ? document.endings.find((ending) => `ending:${ending.id}` === selection)
    : undefined;

  const inspector = selectedField ? (
    <FieldInspector
      change={change}
      document={document}
      field={selectedField}
      formId={record.id}
      index={selectedIndex}
      issues={problems
        .filter((problem) => problem.target === selectedField.id)
        .map((problem) => problem.message)}
      key={selectedField.id}
      origin={origin}
      readOnly={readOnly}
      slug={record.slug}
    />
  ) : selection === "welcome" ? (
    <WelcomeInspector change={change} document={document} formId={record.id} readOnly={readOnly} />
  ) : selectedEnding ? (
    <EndingInspector
      change={change}
      document={document}
      ending={selectedEnding}
      formId={record.id}
      key={selectedEnding.id}
      onRemoved={() => {
        select(null);
      }}
      readOnly={readOnly}
    />
  ) : (
    <FormInspector change={change} document={document} readOnly={readOnly} />
  );

  const palette = (
    <Palette
      disabled={readOnly}
      onAdd={(type) => {
        addField(type);
      }}
    />
  );

  return (
    <div className="grid min-h-0 xl:grid-cols-[17rem_minmax(0,1fr)_23rem] lg:grid-cols-[minmax(0,1fr)_22rem]">
      {announcer}
      {wide ? (
        <aside
          aria-label="Add blocks"
          className="sticky top-[var(--builder-top)] h-[calc(100dvh-var(--builder-top))] overflow-hidden border-r border-[#dee4ef] p-4 dark:border-white/10"
        >
          <p className={`${eyebrowClass} mb-3`}>Add a block</p>
          <div className="flex h-[calc(100%-1.75rem)] min-h-0 flex-col">{palette}</div>
        </aside>
      ) : null}

      <section aria-label="Canvas" className="min-w-0 px-4 pt-6 sm:px-8">
        {!wide && !readOnly ? (
          <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-dashed border-brand-blue/45 bg-brand-blue/[0.04] px-4 text-sm font-semibold text-brand-blue transition hover:bg-brand-blue hover:text-white"
              onClick={() => {
                setPaletteOpen(true);
              }}
              type="button"
            >
              <Plus size={16} weight="bold" />
              Add block
            </button>
            {!medium ? (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#5d687d] hover:bg-white dark:text-white/55 dark:hover:bg-white/[0.06]"
                onClick={() => {
                  setSheetOpen(true);
                }}
                type="button"
              >
                <SidebarSimple size={16} />
                Inspector
              </button>
            ) : null}
          </div>
        ) : null}
        <Canvas
          actions={actions}
          document={document}
          issues={issues}
          multi={multi}
          onAddAt={(at, type) => {
            addField(type, { at });
          }}
          onAddEnding={onAddEnding}
          onBulk={onBulk}
          onClearMulti={() => {
            setMulti(new Set());
          }}
          onReorder={onReorder}
          onSelectScreen={selectScreen}
          readOnly={readOnly}
          selection={selection}
        />
      </section>

      {medium ? (
        <aside
          aria-label="Inspector"
          className="sticky top-[var(--builder-top)] h-[calc(100dvh-var(--builder-top))] overflow-y-auto border-l border-[#dee4ef] bg-white/50 dark:border-white/10 dark:bg-white/[0.015]"
        >
          {inspector}
        </aside>
      ) : sheetOpen && selection ? (
        <Sheet
          label="Inspector"
          onClose={() => {
            setSheetOpen(false);
          }}
          side="bottom"
        >
          {inspector}
        </Sheet>
      ) : null}

      {!wide && paletteOpen ? (
        <Sheet
          label="Add a block"
          onClose={() => {
            setPaletteOpen(false);
          }}
          side="left"
        >
          <div className="flex h-full min-h-0 flex-col p-4">{palette}</div>
        </Sheet>
      ) : null}
    </div>
  );
}
