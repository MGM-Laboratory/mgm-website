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
import { openJobs, type CmsJobRecord } from "@/lib/career-cms";
import { fetchCareerFeed } from "@/lib/career-cms-server";
import { CONTACT_EMAIL } from "@/data/nav";

export const metadata: Metadata = {
  title: "Careers | MGM Laboratory",
  description:
    "Open roles at MGM Laboratory, a nonprofit student research lab. No salaries, but real resources, mentorship, and work that ships.",
};

export const revalidate = 0;

type CareersSearchParams = Promise<{
  page?: string | string[];
  per?: string | string[];
  q?: string | string[];
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

function listHref(q: string, page?: number, per?: number) {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (page && page > 1) search.set("page", String(page));
  if (per && per !== DEFAULT_JOB_PAGE_SIZE) search.set("per", String(per));
  const query = search.toString();
  return `${query ? `/careers?${query}` : "/careers"}#careers`;
}

export default async function CareersPage({ searchParams }: { searchParams: CareersSearchParams }) {
  const resolved = await searchParams;
  const query = firstValue(resolved.q)?.trim() ?? "";

  const records = (await fetchCareerFeed().catch(() => [] as CmsJobRecord[])) ?? [];
  const open = openJobs(records);

  const needle = query.toLowerCase();
  const filtered = needle
    ? open.filter((record) =>
        `${record.job.title} ${record.job.focus}`.toLowerCase().includes(needle),
      )
    : open;

  const { page, perPage } = readWindow(filtered.length, resolved);
  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  const hrefFor = (nextPage: number, nextPer: number) => listHref(query, nextPage, nextPer);

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
            opening here, and applications go straight to the lab&apos;s inbox.
          </p>

          <div className="mt-10 flex items-start gap-4 rounded-2xl border border-brand-yellow/40 bg-brand-yellow-50 px-6 py-5 dark:border-brand-yellow/25 dark:bg-brand-yellow/10">
            <HandHeart
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-brand-yellow"
              size={22}
              strokeWidth={2}
            />
            <div className="text-[15px] leading-7 text-[var(--ink-2)] dark:text-[#d6d6d1]">
              <strong className="font-semibold text-[var(--ink)] dark:text-white">
                We&apos;re a nonprofit lab, so we can&apos;t offer a salary or compensation.
              </strong>{" "}
              In return for your time, we offer a workspace in the lab, funds for your projects,
              snacks on deck, mentorship, and real experience shipping work that carries your name.
            </div>
          </div>

          <div className="mt-8">
            <CareerSearchBox initialQuery={query} />
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-[55px] pb-40"
          id="careers"
        >
          {filtered.length ? (
            <div>
              <p className="text-sm text-[var(--ink-2)] dark:text-[#c3c7d1]">
                {filtered.length} open role{filtered.length === 1 ? "" : "s"}
                {query ? (
                  <>
                    {" "}
                    matching{" "}
                    <span className="font-semibold text-[var(--ink)] dark:text-white">
                      “{query}”
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
                The lab isn&apos;t hiring at the moment. Check back soon, or reach out at{" "}
                <a className="text-brand-blue hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center">
              <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                No roles match “{query}”
              </p>
              <p className="mt-2 text-[var(--ink-3)]">
                Try a different keyword, or clear the search to see every open role.
              </p>
              <Link
                className="mt-5 inline-flex h-10 items-center rounded-full bg-[#0e1116] px-5 text-sm font-semibold text-white transition hover:bg-brand-blue dark:bg-white dark:text-[#0e1116]"
                href="/careers#careers"
              >
                Clear search
              </Link>
            </div>
          )}
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
