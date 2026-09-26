"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { memo, useMemo, useState } from "react";

import type { FormFieldType } from "@repo/shared";

import { FIELD_FAMILIES, FIELD_TYPES, type FieldTypeInfo } from "@/lib/forms/builder-fields";

import { FAMILY_TONES, FieldIcon } from "./field-icons";
import { eyebrowClass } from "./ui";

export const FIELD_DRAG_TYPE = "application/x-mgm-form-field";

function matches(info: FieldTypeInfo, needle: string) {
  if (!needle) return true;
  return `${info.label} ${info.description} ${info.keywords ?? ""} ${info.type}`
    .toLocaleLowerCase()
    .includes(needle);
}

/**
 * The add palette: every block type grouped by family, with a search box.
 * Click adds after the selected block; items can also be dragged onto the
 * canvas. `dense` is the popover variant used by "add below".
 */
export const Palette = memo(function Palette({
  autoFocus = false,
  dense = false,
  onAdd,
  disabled = false,
}: {
  autoFocus?: boolean;
  dense?: boolean;
  onAdd: (type: FormFieldType) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const groups = useMemo(
    () =>
      FIELD_FAMILIES.map((family) => ({
        ...family,
        items: FIELD_TYPES.filter((info) => info.family === family.id && matches(info, needle)),
      })).filter((group) => group.items.length),
    [needle],
  );
  const first = groups[0]?.items[0];

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative shrink-0">
        <MagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8490a5]"
          size={15}
        />
        <input
          aria-label="Search block types"
          autoFocus={autoFocus}
          className="h-9 w-full rounded-lg border border-[#d9dfeb] bg-white pr-3 pl-8 text-sm outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && first) {
              event.preventDefault();
              onAdd(first.type);
            }
          }}
          placeholder="Search blocks"
          type="search"
          value={query}
        />
      </div>
      <div
        className={`mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto ${dense ? "max-h-80 pr-1" : "pr-1"}`}
      >
        {groups.map((group) => (
          <div key={group.id}>
            <p className={`${eyebrowClass} mb-1.5 px-1`}>{group.label}</p>
            <ul className={dense ? "grid grid-cols-2 gap-1" : "space-y-0.5"}>
              {group.items.map((info) => (
                <li key={info.type}>
                  <button
                    className="group flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-white hover:shadow-[0_8px_20px_-16px_rgba(20,32,58,0.5)] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-brand-blue/30 focus-visible:outline-none disabled:opacity-40 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]"
                    disabled={disabled}
                    draggable={!disabled && !dense}
                    onClick={() => {
                      onAdd(info.type);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(FIELD_DRAG_TYPE, info.type);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    title={info.description}
                    type="button"
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-lg ${FAMILY_TONES[info.family]}`}
                    >
                      <FieldIcon size={15} type={info.type} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#2b3345] dark:text-white/85">
                        {info.label}
                      </span>
                      {dense ? null : (
                        <span className="block truncate text-[11px] text-[#8490a5] dark:text-white/40">
                          {info.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!groups.length ? (
          <p className="px-1 text-xs text-[#9ba4b5]">Nothing matches &ldquo;{query}&rdquo;.</p>
        ) : null}
      </div>
    </div>
  );
});
