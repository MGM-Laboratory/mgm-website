"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import type { ArticleCategory } from "@/lib/article-index";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

const LOCK_OWNER = "articles-filter";

/**
 * The list's category filter, beside the search at every width: a
 * "Filter" button that opens an animated sheet of categories, like
 * unseen.co's filter (a panel centred under the search on wide screens,
 * a sheet across the screen on phones). The sheet grows out of the toggle (its
 * clip starts on the toggle's box), a fog veil dims the list, the pills
 * arrive one after another, and picking one closes it. Escape, the veil
 * and the toggle close it too; focus moves into the sheet and back.
 *
 * All motion is CSS keyed on `data-state`, so reduced motion simply gets
 * the end states (articles.css).
 */
export function FilterSheet({
  active,
  all,
  categories,
  onPick,
}: {
  active?: string;
  all: number;
  categories: ArticleCategory[];
  onPick: (slug: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = categories.find((category) => category.slug === active);

  // While open: the page holds still behind the sheet, Escape closes it and
  // Tab stays inside it.
  useEffect(() => {
    if (!open) return;
    acquireScrollLock(LOCK_OWNER);
    const sheet = sheetRef.current;
    const toggle = toggleRef.current;
    if (sheet && toggle) {
      // The clip grows out of the toggle: it starts as a sliver as wide as
      // the toggle, right under it, and opens down and across.
      const from = toggle.getBoundingClientRect();
      const box = sheet.getBoundingClientRect();
      sheet.style.setProperty("--from-top", "0px");
      sheet.style.setProperty("--from-right", `${Math.max(0, box.right - from.right)}px`);
      sheet.style.setProperty("--from-bottom", `${Math.max(0, box.height - 10)}px`);
      sheet.style.setProperty("--from-left", `${Math.max(0, from.left - box.left)}px`);
      void sheet.offsetWidth;
      sheet.dataset.state = "open";
      const focusTarget =
        sheet.querySelector<HTMLElement>('[aria-pressed="true"]') ??
        sheet.querySelector<HTMLElement>("button");
      focusTarget?.focus({ preventScroll: true });
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = [...sheet.querySelectorAll<HTMLElement>("button")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      releaseScrollLock(LOCK_OWNER);
      if (sheet) sheet.dataset.state = "closed";
    };
  }, [open]);

  useEffect(() => () => releaseScrollLock(LOCK_OWNER), []);

  const pick = (slug: string | null) => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
    onPick(slug);
  };

  const pills = [
    { slug: null as string | null, name: "All", count: all },
    ...categories.map((category) => ({
      slug: category.slug as string | null,
      name: category.name,
      count: category.count,
    })),
  ];

  return (
    <div className="articles-filter" data-open={open ? "" : undefined}>
      <button
        aria-controls={`${id}-sheet`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={current ? `Filter by category: ${current.name}` : "Filter by category"}
        className="articles-filter-toggle"
        data-filtered={current ? "" : undefined}
        onClick={() => setOpen((value) => !value)}
        ref={toggleRef}
        type="button"
      >
        {/* The active category takes the label's place, so the search keeps its room. */}
        <span className="articles-filter-label">{current ? current.name : "Filter"}</span>
        <ChevronDown aria-hidden className="articles-filter-chevron" strokeWidth={2.25} />
      </button>
      <div aria-hidden="true" className="articles-filter-veil" onClick={() => setOpen(false)} />
      <div
        aria-label="Filter articles by category"
        aria-modal={open ? "true" : undefined}
        className="articles-filter-sheet"
        data-state="closed"
        id={`${id}-sheet`}
        inert={!open}
        ref={sheetRef}
        role="dialog"
      >
        <p className="articles-filter-heading">Categories</p>
        <div className="articles-filter-pills">
          {pills.map((pill, index) => {
            const selected = (pill.slug ?? undefined) === active || (!pill.slug && !current);
            return (
              <button
                aria-pressed={selected}
                className="articles-filter-pill"
                key={pill.slug ?? "all"}
                onClick={() => pick(selected && pill.slug ? null : pill.slug)}
                style={{ "--pill-i": index } as CSSProperties}
                type="button"
              >
                {pill.name}
                <span className="articles-pill-count">{pill.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
