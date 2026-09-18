"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { COUNTRY_CODES, countryFlag } from "@/lib/country-codes";

function findIndex(dial: string) {
  return Math.max(
    0,
    COUNTRY_CODES.findIndex((country) => country.dial === dial),
  );
}

/**
 * A select-only combobox (WAI-ARIA APG pattern) rather than a native
 * <select> or a <button>-triggered listbox: macOS Safari's default
 * keyboard-navigation mode excludes <select>, <button>, checkboxes, and
 * radios from the Tab order — only text fields (and links) are included —
 * so a <button> trigger is just as unreachable by Tab as the native
 * <select> it replaced. A read-only text input stays a real text field for
 * Tab purposes everywhere, and it lets us draw and position our own
 * chevron instead of relying on the OS-drawn arrow a native <select> can't
 * reposition.
 *
 * Selection is tracked by list index, not by dial string: several
 * countries share a calling code (US/Canada both use +1), so resolving
 * "the selected country" from the dial value alone can't tell them apart
 * and would silently re-resolve a Canada selection back to the first +1
 * match (the United States).
 */
export function PhoneCountrySelect({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (dial: string) => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(() => findIndex(value));
  const [highlight, setHighlight] = useState(selectedIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = COUNTRY_CODES[selectedIndex];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function openList() {
    setHighlight(selectedIndex);
    setOpen(true);
  }

  function select(index: number) {
    setSelectedIndex(index);
    onChange(COUNTRY_CODES[index].dial);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="relative w-[128px] shrink-0" ref={containerRef}>
      <input
        aria-activedescendant={open ? `${listboxId}-${highlight}` : undefined}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Country code"
        className={`h-12 w-full cursor-pointer rounded-xl border bg-white pl-3 pr-8 text-[15px] text-[var(--ink)] caret-transparent outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-[#15181e] dark:text-white ${
          hasError
            ? "border-brand-red/60 dark:border-brand-red/50"
            : "border-[var(--line-strong)] dark:border-white/10"
        }`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) openList();
            else setHighlight((current) => Math.min(current + 1, COUNTRY_CODES.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) openList();
            else setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) select(highlight);
            else openList();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        readOnly
        ref={inputRef}
        role="combobox"
        type="text"
        value={`${countryFlag(selected.code)} ${selected.dial}`}
      />
      <ChevronDown
        aria-hidden="true"
        className={`pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)] transition-transform ${open ? "rotate-180" : ""}`}
      />
      {open ? (
        <ul
          aria-label="Country code options"
          className="absolute z-20 mt-1.5 max-h-64 w-56 overflow-y-auto rounded-xl border border-[var(--line-strong)] bg-white p-1 shadow-[var(--shadow-2)] dark:border-white/10 dark:bg-[#15181e]"
          id={listboxId}
          ref={listRef}
          role="listbox"
        >
          {COUNTRY_CODES.map((country, index) => (
            <li
              aria-selected={index === selectedIndex}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                index === highlight
                  ? "bg-brand-blue/10 text-brand-blue"
                  : "text-[var(--ink)] dark:text-white"
              }`}
              id={`${listboxId}-${index}`}
              key={country.code}
              onMouseDown={(event) => {
                event.preventDefault();
                select(index);
              }}
              onMouseEnter={() => setHighlight(index)}
              role="option"
            >
              <span className="truncate">
                {countryFlag(country.code)} {country.name}
              </span>
              <span className="text-[var(--ink-3)]">{country.dial}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
