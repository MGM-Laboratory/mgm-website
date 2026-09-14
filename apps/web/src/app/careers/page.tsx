import type { Metadata } from "next";
import { HandHeart } from "lucide-react";
import Link from "next/link";

import {
  CareerPagination,
  DEFAULT_JOB_PAGE_SIZE,
  JOB_PAGE_SIZES,
} from "@/components/careers/career-pagination";
import { CareerSearchBox } from "@/components/careers/career-search-box";
import { JobCard } from "@/components/careers/job-card";
import { CtaFooter } from "@/components/sections/cta-footer";
import {
  COMMITMENT_LABELS,
  JOB_COMMITMENTS,
  JOB_MODES,
  MODE_LABELS,
  openJobs,
  type CmsJobRecord,
} from "@/lib/career-cms";
import { fetchCareerFeed } from "@/lib/career-cms-server";
import { CONTACT_EMAIL } from "@/data/nav";

export const metadata: Metadata = {
  title: "Careers | MGM Laboratory",
  description:
    "Open roles at MGM Laboratory — a nonprofit student research lab. No salaries, but real resources, mentorship, and work that ships.",
};

export const revalidate = 0;

type CareersSearchParams = Promise<{
  page?: string | string[];
  per?: string | string[];
  q?: string | string[];
  focus?: string | string[];
  commitment?: string | string[];
  mode?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Keeps `?per=` on the published options and `?page=` inside the real range. */
function readWindow(
  total: number,
  searchParams: { page?: string | string[]; per?: string | string[] },
) {
  const requestedPer = Number(firstValue(searchParams.per));
  const perPage = (JOB_PAGE_SIZES as readonly number[]).includes(requestedPer)
    ? requestedPer
    : DEFAULT_JOB_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const requestedPage = Number(firstValue(searchParams.page));
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;

  return { page, perPage, totalPages };
}

type FilterState = { q: string; focus: string; commitment: string; mode: string };

function listHref(next: FilterState & { page?: number; per?: number }) {
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.focus) search.set("focus", next.focus);
  if (next.commitment) search.set("commitment", next.commitment);
  if (next.mode) search.set("mode", next.mode);
  if (next.page && next.page > 1) search.set("page", String(next.page));
  if (next.per && next.per !== DEFAULT_JOB_PAGE_SIZE) search.set("per", String(next.per));
  const query = search.toString();
  return `${query ? `/careers?${query}` : "/careers"}#careers`;
}

const PILL_BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors";
const PILL_IDLE =
  "border-[var(--line)] text-[var(--ink-2)] hover:border-brand-yellow hover:text-[var(--ink)] dark:text-[#c3c7d1] dark:hover:text-white";
const PILL_ACTIVE = "border-transparent bg-[#0e1116] text-white dark:bg-white dark:text-[#0e1116]";

export default async function CareersPage({ searchParams }: { searchParams: CareersSearchParams }) {
  const resolved = await searchParams;
  const filters: FilterState = {
    q: firstValue(resolved.q)?.trim() ?? "",
    focus: firstValue(resolved.focus)?.trim() ?? "",
    commitment: firstValue(resolved.commitment)?.trim() ?? "",
    mode: firstValue(resolved.mode)?.trim() ?? "",
  };

  const records = (await fetchCareerFeed().catch(() => [] as CmsJobRecord[])) ?? [];
  const open = openJobs(records);

  const query = filters.q.toLowerCase();
  const filtered = open.filter((record) => {
    if (filters.focus && record.job.focus !== filters.focus) return false;
    if (filters.commitment && record.job.commitment !== filters.commitment) return false;
    if (filters.mode && record.job.mode !== filters.mode) return false;
    if (query) {
      const haystack = `${record.job.title} ${record.job.focus}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const { page, perPage } = readWindow(filtered.length, resolved);
  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  const focuses = [...new Set(open.map((record) => record.job.focus))];
  const hasFilters = Boolean(filters.q || filters.focus || filters.commitment || filters.mode);

  const preservedParams = new URLSearchParams();
  if (filters.focus) preservedParams.set("focus", filters.focus);
  if (filters.commitment) preservedParams.set("commitment", filters.commitment);
  if (filters.mode) preservedParams.set("mode", filters.mode);

  const hrefFor = (nextPage: number, nextPer: number) =>
    listHref({ ...filters, page: nextPage, per: nextPer });

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1200px] px-[55px] pt-24 pb-20">
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-yellow uppercase">
            Join the lab
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
            Careers
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-7 text-[var(--ink-2)] dark:text-[#c3c7d1]">
            Open roles across game development, web, mobile, UX, and research. We publish every
            opening here — applications go straight to the lab&apos;s inbox.
          </p>
          <div className="mt-8">
            <CareerSearchBox
              initialQuery={filters.q}
              preservedParams={preservedParams.toString()}
            />
          </div>

          <div className="mt-10 flex items-start gap-4 rounded-2xl border border-brand-yellow/40 bg-brand-yellow-50 px-6 py-5 dark:border-brand-yellow/25 dark:bg-brand-yellow/10">
            <HandHeart
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-brand-yellow"
              size={22}
              strokeWidth={2}
            />
            <div className="text-[15px] leading-7 text-[var(--ink-2)] dark:text-[#d6d6d1]">
              <strong className="font-semibold text-[var(--ink)] dark:text-white">
                We&apos;re a nonprofit lab — we can&apos;t offer a salary or compensation.
              </strong>{" "}
              In return for your time, we offer a workspace in the lab, funds for your projects,
              snacks on deck, mentorship, and real experience shipping work that carries your name.
            </div>
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-[55px] pb-40"
          id="careers"
        >
          {open.length > 0 ? (
            <div className="space-y-4 border-b border-[var(--line)] pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-[10px] font-bold tracking-[0.16em] text-[var(--ink-3)] uppercase dark:text-white/45">
                  Focus
                </span>
                {focuses.map((focus) => (
                  <Link
                    aria-current={filters.focus === focus ? "true" : undefined}
                    className={`${PILL_BASE} ${filters.focus === focus ? PILL_ACTIVE : PILL_IDLE}`}
                    href={listHref({ ...filters, focus: filters.focus === focus ? "" : focus })}
                    key={focus}
                  >
                    {focus}
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-[10px] font-bold tracking-[0.16em] text-[var(--ink-3)] uppercase dark:text-white/45">
                  Commitment
                </span>
                {JOB_COMMITMENTS.map((commitment) => (
                  <Link
                    aria-current={filters.commitment === commitment ? "true" : undefined}
                    className={`${PILL_BASE} ${filters.commitment === commitment ? PILL_ACTIVE : PILL_IDLE}`}
                    href={listHref({
                      ...filters,
                      commitment: filters.commitment === commitment ? "" : commitment,
                    })}
                    key={commitment}
                  >
                    {COMMITMENT_LABELS[commitment]}
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-[10px] font-bold tracking-[0.16em] text-[var(--ink-3)] uppercase dark:text-white/45">
                  Mode
                </span>
                {JOB_MODES.map((mode) => (
                  <Link
                    aria-current={filters.mode === mode ? "true" : undefined}
                    className={`${PILL_BASE} ${filters.mode === mode ? PILL_ACTIVE : PILL_IDLE}`}
                    href={listHref({ ...filters, mode: filters.mode === mode ? "" : mode })}
                    key={mode}
                  >
                    {MODE_LABELS[mode]}
                  </Link>
                ))}
              </div>
              {hasFilters ? (
                <div className="pt-1">
                  <Link
                    className="text-sm font-medium text-[var(--ink-3)] transition hover:text-brand-blue"
                    href="/careers#careers"
                  >
                    Clear all filters
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {filtered.length ? (
            <div className="mt-8">
              <p className="text-sm text-[var(--ink-2)] dark:text-[#c3c7d1]">
                {filtered.length} open role{filtered.length === 1 ? "" : "s"}
                {filters.q ? (
                  <>
                    {" "}
                    matching{" "}
                    <span className="font-semibold text-[var(--ink)] dark:text-white">
                      “{filters.q}”
                    </span>
                  </>
                ) : null}
              </p>
              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {visible.map((record) => (
                  <JobCard key={record.slug} record={record} />
                ))}
              </div>
              <CareerPagination
                hrefFor={hrefFor}
                page={page}
                perPage={perPage}
                total={filtered.length}
              />
            </div>
          ) : open.length === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center">
              <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                No open roles right now
              </p>
              <p className="mt-2 text-[var(--ink-3)]">
                The lab isn&apos;t hiring at the moment. Check back soon — or reach out at{" "}
                <a className="text-brand-blue hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-[var(--line)] px-8 py-16 text-center">
              <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                No roles match those filters
              </p>
              <p className="mt-2 text-[var(--ink-3)]">
                Try different filters, or clear them to see every open role.
              </p>
              <Link
                className="mt-5 inline-flex h-10 items-center rounded-full bg-[#0e1116] px-5 text-sm font-semibold text-white transition hover:bg-brand-blue dark:bg-white dark:text-[#0e1116]"
                href="/careers#careers"
              >
                Clear all filters
              </Link>
            </div>
          )}
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
