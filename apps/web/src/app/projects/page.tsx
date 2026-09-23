import type { Metadata } from "next";
import Link from "next/link";

import { ProjectCard } from "@/components/projects/project-card";
import {
  DEFAULT_PROJECT_PAGE_SIZE,
  ProjectPagination,
  PROJECT_PAGE_SIZES,
} from "@/components/projects/project-pagination";
import { ProjectSearchBox } from "@/components/projects/project-search-box";
import { CtaFooter } from "@/components/sections/cta-footer";
import { fetchProjectFeed } from "@/lib/project-cms-server";
import {
  publishedProjects,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABELS,
  type CmsProjectRecord,
  type ProjectCategory,
} from "@/lib/project-cms";

export const metadata: Metadata = {
  title: "Projects — MGM Laboratory",
  description: "A selection of research-driven products the lab has built end to end.",
};

// Projects resolves entirely at request time: the CMS is the source of
// truth and admin publishes must reach the public page immediately.
export const revalidate = 0;

async function readRecords() {
  try {
    return publishedProjects(await fetchProjectFeed());
  } catch {
    return [] as CmsProjectRecord[];
  }
}

type ProjectsSearchParams = Promise<{
  category?: string | string[];
  page?: string | string[];
  per?: string | string[];
  q?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function matchesQuery(record: CmsProjectRecord, query: string) {
  const needle = query.toLocaleLowerCase();
  return [record.project.title, record.project.summary, ...record.project.techStack]
    .join(" ")
    .toLocaleLowerCase()
    .includes(needle);
}

/** Keeps `?per=` on the published options and `?page=` inside the real range. */
function readWindow(
  total: number,
  searchParams: { page?: string | string[]; per?: string | string[] },
) {
  const requestedPer = Number(firstValue(searchParams.per));
  const perPage = (PROJECT_PAGE_SIZES as readonly number[]).includes(requestedPer)
    ? requestedPer
    : DEFAULT_PROJECT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const requestedPage = Number(firstValue(searchParams.page));
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;

  return { page, perPage, totalPages };
}

function pillClass(active: boolean) {
  return `rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
    active
      ? "bg-[#0e1116] text-white dark:bg-white dark:text-[#0e1116]"
      : "bg-[var(--surface-muted)] text-[var(--ink-2)] hover:text-[var(--ink)] dark:bg-white/[0.06] dark:text-white/60 dark:hover:text-white"
  }`;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: ProjectsSearchParams;
}) {
  const resolvedParams = await searchParams;
  const query = firstValue(resolvedParams.q)?.trim() ?? "";
  const requestedCategory = firstValue(resolvedParams.category);
  const category = (PROJECT_CATEGORIES as readonly string[]).includes(requestedCategory ?? "")
    ? (requestedCategory as ProjectCategory)
    : undefined;

  const allRecords = await readRecords();
  const filtered = allRecords.filter((record) => {
    if (category && !record.project.categories.includes(category)) return false;
    if (query && !matchesQuery(record, query)) return false;
    return true;
  });

  const { page, perPage } = readWindow(filtered.length, resolvedParams);
  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);
  if (category) baseParams.set("category", category);

  const categoryHref = (next?: ProjectCategory) => {
    const params = new URLSearchParams(baseParams);
    params.delete("category");
    if (next) params.set("category", next);
    const qs = params.toString();
    return qs ? `/projects?${qs}#projects` : "/projects#projects";
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1200px] px-6 pt-24 pb-14 sm:px-10 lg:px-14">
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
            Our Work
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
            Projects
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-7 text-[var(--ink-2)] dark:text-[#c3c7d1]">
            A selection of research-driven products the lab has built end to end — from the first
            prototype to a shipped, working product.
          </p>
          <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <ProjectSearchBox initialQuery={query} />
            <div className="flex flex-wrap gap-2">
              <Link className={pillClass(!category)} href={categoryHref(undefined)}>
                All · {allRecords.length}
              </Link>
              {PROJECT_CATEGORIES.map((cat) => (
                <Link className={pillClass(category === cat)} href={categoryHref(cat)} key={cat}>
                  {PROJECT_CATEGORY_LABELS[cat]} ·{" "}
                  {allRecords.filter((record) => record.project.categories.includes(cat)).length}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-6 pb-32 sm:px-10 lg:px-14"
          id="projects"
        >
          {filtered.length ? (
            <div className="grid grid-cols-1 gap-x-10 gap-y-16 lg:grid-cols-2">
              {visible.map((record) => (
                <ProjectCard key={record.slug} record={record} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center">
              <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                {query || category ? "No projects match" : "No projects yet"}
              </p>
              <p className="mt-2 text-[var(--ink-3)]">
                {query || category
                  ? "Try a different keyword or category."
                  : "The lab's first case studies are on their way."}
              </p>
            </div>
          )}

          {filtered.length ? (
            <ProjectPagination
              baseParams={baseParams}
              page={page}
              perPage={perPage}
              total={filtered.length}
            />
          ) : null}
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
