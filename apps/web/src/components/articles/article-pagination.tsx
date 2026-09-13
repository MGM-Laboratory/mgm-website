import Link from "next/link";

export const ARTICLE_PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_ARTICLE_PAGE_SIZE = ARTICLE_PAGE_SIZES[0];

type PageMarker = number | { gapAfter: number };

/** Lists the pages to expose: both edges, the current page, and one neighbour either side. */
function pageMarkers(current: number, total: number): PageMarker[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const wanted = new Set([1, current - 1, current, current + 1, total]);
  const pages = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const markers: PageMarker[] = [];

  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) {
      markers.push({ gapAfter: pages[index - 1] });
    }
    markers.push(page);
  });

  return markers;
}

function gridHref(page: number, perPage: number) {
  return `/articles?per=${perPage}&page=${page}#articles`;
}

const BUTTON_BASE =
  "grid h-10 min-w-10 place-items-center rounded-full border px-3.5 font-mono text-[11px] tracking-[0.08em] transition-colors focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none";
const BUTTON_IDLE =
  "border-[var(--line)] text-[var(--ink-2)] hover:border-brand-blue hover:text-brand-blue dark:text-[#c3c7d1]";
const BUTTON_ACTIVE =
  "border-transparent bg-[#0e1116] text-white dark:bg-white dark:text-[#0e1116]";
const BUTTON_OFF = "border-[var(--line)] text-[#c9ccd4] dark:text-white/25";

export function ArticlePagination({
  page,
  perPage,
  total,
}: {
  page: number;
  perPage: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const markers = pageMarkers(page, totalPages);
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div className="mt-16 flex flex-col gap-6 border-t border-[var(--line)] pt-8 lg:flex-row lg:items-center lg:justify-between">
      <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--ink-3)] uppercase dark:text-white/45">
        {first}
        {"-"}
        {last} of {total} articles
      </p>

      {totalPages > 1 ? (
        <nav aria-label="Article pages" className="flex flex-wrap items-center gap-2">
          {page > 1 ? (
            <Link
              aria-label="Previous page"
              className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
              href={gridHref(page - 1, perPage)}
            >
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={`${BUTTON_BASE} ${BUTTON_OFF}`}>
              Previous
            </span>
          )}

          {markers.map((marker) =>
            typeof marker === "number" ? (
              <Link
                aria-current={marker === page ? "page" : undefined}
                aria-label={`Page ${marker}`}
                className={`${BUTTON_BASE} ${marker === page ? BUTTON_ACTIVE : BUTTON_IDLE}`}
                href={gridHref(marker, perPage)}
                key={`page-${marker}`}
              >
                {marker}
              </Link>
            ) : (
              <span
                aria-hidden="true"
                className="px-1 font-mono text-[11px] text-[var(--ink-3)] dark:text-white/45"
                key={`gap-${marker.gapAfter}`}
              >
                ...
              </span>
            ),
          )}

          {page < totalPages ? (
            <Link
              aria-label="Next page"
              className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
              href={gridHref(page + 1, perPage)}
            >
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className={`${BUTTON_BASE} ${BUTTON_OFF}`}>
              Next
            </span>
          )}
        </nav>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] text-[var(--ink-3)] uppercase dark:text-white/45">
          Per page
        </span>
        <div className="flex items-center gap-2">
          {ARTICLE_PAGE_SIZES.map((size) =>
            size === perPage ? (
              <span
                aria-current="true"
                className={`${BUTTON_BASE} ${BUTTON_ACTIVE} h-9 min-w-9`}
                key={`size-${size}`}
              >
                {size}
              </span>
            ) : (
              <Link
                aria-label={`Show ${size} articles per page`}
                className={`${BUTTON_BASE} ${BUTTON_IDLE} h-9 min-w-9`}
                href={gridHref(1, size)}
                key={`size-${size}`}
              >
                {size}
              </Link>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
