"use client";

import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Drives the server-side job search through the URL: typing debounces into
 * `/careers?q=...` so results stay server-rendered and shareable.
 */
export function CareerSearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the box in step with the URL when navigation comes from outside
  // the input (back/forward, clear links) without an effect round-trip.
  if (initialQuery !== lastQuery) {
    setLastQuery(initialQuery);
    setValue(initialQuery);
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const navigate = (next: string) => {
    const trimmed = next.trim();
    router.replace(
      trimmed ? `/careers?q=${encodeURIComponent(trimmed)}#careers` : "/careers#careers",
    );
  };

  const change = (next: string) => {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(next), 300);
  };

  return (
    <div className="relative w-full max-w-md">
      <MagnifyingGlass
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
        size={18}
      />
      <input
        aria-label="Search open roles"
        className="h-12 w-full rounded-full border border-[var(--line)] bg-white pl-11 pr-11 text-[15px] text-[var(--ink)] shadow-[var(--shadow-1)] outline-none transition placeholder:text-[var(--ink-4)] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30"
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setValue("");
            navigate("");
            event.currentTarget.blur();
          }
        }}
        placeholder="Search roles by title or focus..."
        type="search"
        value={value}
      />
      {value ? (
        <button
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[var(--ink-3)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
          onClick={() => {
            setValue("");
            navigate("");
          }}
          type="button"
        >
          <X size={15} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
