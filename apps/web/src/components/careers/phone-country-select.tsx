"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { COUNTRY_CODES, countryFlag, DEFAULT_COUNTRY } from "@/lib/country-codes";

/**
 * A custom listbox rather than a native <select>: macOS Safari's default
 * keyboard-navigation mode excludes <select> (and <button>) from the Tab
 * order, only including text fields — which made this control unreachable
 * by Tab for anyone on default settings. This trigger reads and behaves
 * like a text control, so it stays in the Tab sequence everywhere, and it
 * also lets us draw and position our own chevron instead of relying on the
 * OS-drawn arrow a native <select> can't reposition.
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
  const [highlight, setHighlight] = useState(() =>
    Math.max(
      0,
      COUNTRY_CODES.findIndex((country) => country.dial === value),
    ),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = COUNTRY_CODES.find((country) => country.dial === value) ?? DEFAULT_COUNTRY;

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

  function select(index: number) {
    const country = COUNTRY_CODES[index];
    onChange(country.dial);
    setHighlight(index);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="relative w-[128px] shrink-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Country code"
        className={`flex h-12 w-full items-center justify-between gap-1 rounded-xl border bg-white pl-3 pr-2.5 text-[15px] text-[var(--ink)] outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-[#15181e] dark:text-white ${
          hasError
            ? "border-brand-red/60 dark:border-brand-red/50"
            : "border-[var(--line-strong)] dark:border-white/10"
        }`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) setOpen(true);
            else setHighlight((current) => Math.min(current + 1, COUNTRY_CODES.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            else setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) select(highlight);
            else setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="truncate">
          {countryFlag(selected.code)} {selected.dial}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-[var(--ink-3)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ul
          aria-label="Country code options"
          className="absolute z-20 mt-1.5 max-h-64 w-56 overflow-y-auto rounded-xl border border-[var(--line-strong)] bg-white p-1 shadow-[var(--shadow-2)] dark:border-white/10 dark:bg-[#15181e]"
          ref={listRef}
          role="listbox"
        >
          {COUNTRY_CODES.map((country, index) => (
            <li
              aria-selected={country.dial === value}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                index === highlight
                  ? "bg-brand-blue/10 text-brand-blue"
                  : "text-[var(--ink)] dark:text-white"
              }`}
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
