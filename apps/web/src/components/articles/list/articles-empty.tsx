"use client";

import { RotateCcw, SearchX } from "lucide-react";

/**
 * The list with nothing to show, in three distinct moods:
 *
 * - the archive itself is empty ("No articles yet": a fresh install, or CI);
 * - a filter or a search matches nothing (with the way back to everything);
 * - the archive didn't answer (a failed request, with a retry).
 *
 * A few blank pages drift in the illustration (CSS only, still under
 * reduced motion).
 */
export function ArticlesEmpty({
  category,
  failed,
  filtered,
  onClear,
  onRetry,
  q,
}: {
  category?: string;
  failed: boolean;
  filtered: boolean;
  onClear: () => void;
  onRetry: () => void;
  q?: string;
}) {
  const kind = failed ? "failed" : filtered ? "no-match" : "empty";
  return (
    <div className="articles-empty" data-empty={kind}>
      <div aria-hidden="true" className="articles-empty-pages">
        <span />
        <span />
        <span />
      </div>
      {kind === "failed" ? (
        <>
          <p className="articles-empty-title">The archive didn&apos;t answer</p>
          <p className="articles-empty-body">
            Something between here and the shelves went quiet. Try again in a moment.
          </p>
          <button className="articles-empty-action" onClick={onRetry} type="button">
            <RotateCcw aria-hidden className="size-4" strokeWidth={2.25} />
            Try again
          </button>
        </>
      ) : kind === "no-match" ? (
        <>
          <p className="articles-empty-title">
            No articles match
            {q ? <span className="articles-empty-query"> “{q}”</span> : null}
            {category ? <span className="articles-empty-query"> in {category}</span> : null}
          </p>
          <p className="articles-empty-body">
            Try a shorter word, another spelling, or look through every category.
          </p>
          <button className="articles-empty-action" onClick={onClear} type="button">
            <SearchX aria-hidden className="size-4" strokeWidth={2.25} />
            Show every article
          </button>
        </>
      ) : (
        <>
          <p className="articles-empty-title">No articles yet</p>
          <p className="articles-empty-body">
            The first write-ups from the lab are on their way to these shelves.
          </p>
        </>
      )}
    </div>
  );
}
