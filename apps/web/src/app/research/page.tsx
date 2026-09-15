import type { Metadata } from "next";
import Link from "next/link";

import { FlairShape, PatternTile } from "@/components/process/pattern-tile";
import { ResearchExplorer } from "@/components/research/research-explorer";
import { CtaFooter } from "@/components/sections/cta-footer";
import { MEMBERS } from "@/data/members";
import { mergeMemberRecords } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import {
  featuredResearch,
  latestMilestone,
  publishedResearch,
  researchCoverUrl,
  researchMembers,
  safeResearchHref,
  RESEARCH_AREA_DESCRIPTIONS,
  RESEARCH_AREA_LABELS,
  RESEARCH_AREAS,
  RESEARCH_STATUS_LABELS,
  formatResearchDateShort,
  type CmsResearchRecord,
  type ResearchArea,
} from "@/lib/research-cms";
import { fetchResearchFeed } from "@/lib/research-cms-server";

export const metadata: Metadata = {
  title: "Research | MGM Laboratory",
  description:
    "Research at MGM Laboratory: how people use websites, mobile tools, and immersive media in real situations, turned into better digital products.",
};

// Research resolves entirely at request time: the CMS is the source of
// truth and admin publishes must reach the public page immediately.
export const revalidate = 0;

async function readRecords() {
  try {
    return publishedResearch(await fetchResearchFeed());
  } catch {
    return [] as CmsResearchRecord[];
  }
}

async function readMembers() {
  try {
    return mergeMemberRecords(MEMBERS, await ensureMemberCmsSeeded());
  } catch {
    return [...MEMBERS];
  }
}

const AREA_TONES = {
  website: "blue",
  mobile: "red",
  "hci-ux": "yellow",
  "game-xr": "green",
} as const satisfies Record<ResearchArea, "blue" | "red" | "yellow" | "green">;

const AREA_PATTERNS = {
  website: "circle",
  mobile: "arcs",
  "hci-ux": "fans",
  "game-xr": "leaves",
} as const satisfies Record<ResearchArea, "circle" | "arcs" | "fans" | "leaves">;

/** The real outputs every published initiative links, deduplicated per type. */
function collectOutcomes(records: readonly CmsResearchRecord[]) {
  const outcomes: Record<"project" | "publication" | "article", { label: string; href: string }[]> =
    { project: [], publication: [], article: [] };
  const seen = new Set<string>();
  for (const record of records) {
    for (const output of record.research.outputs) {
      if (seen.has(`${output.type}:${output.href}`)) continue;
      seen.add(`${output.type}:${output.href}`);
      outcomes[output.type].push({ label: output.label, href: output.href });
    }
  }
  return outcomes;
}

export default async function ResearchPage() {
  const [records, members] = await Promise.all([readRecords(), readMembers()]);
  const featured = featuredResearch(records);
  const featuredMembers = featured ? researchMembers(featured, members) : [];
  const featuredMilestone = featured ? latestMilestone(featured.research) : undefined;
  const outcomes = collectOutcomes(records);
  const hasOutcomes =
    outcomes.project.length + outcomes.publication.length + outcomes.article.length > 0;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        {/* Hero — fits the first viewport on desktop. */}
        <section className="relative overflow-hidden">
          <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1200px] flex-col justify-center px-6 py-24 sm:px-10 lg:px-14">
            <FlairShape
              className="pointer-events-none absolute -right-8 -top-6 size-56 opacity-20 sm:size-80 sm:opacity-25 dark:opacity-35"
              kind="arcs"
              tone="red"
            />
            <FlairShape
              className="pointer-events-none absolute right-24 bottom-10 size-16 opacity-15 dark:opacity-30 sm:size-24"
              kind="circle"
              tone="red"
            />
            <div className="relative max-w-2xl">
              <p className="text-sm font-bold tracking-[0.12em] text-brand-red uppercase">
                Our Work / Research
              </p>
              <h1 className="mt-5 font-display text-[clamp(2.5rem,6vw+1rem,4.5rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-[#0e1116] dark:text-white">
                Research turns questions into evidence.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--ink-2)] dark:text-[#c3c7d1]">
                We investigate how people use websites, mobile tools, and immersive media in real
                situations, then turn what we learn into better digital products.
              </p>
              <a
                className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-brand-red px-6 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-red/25"
                href="#research-areas"
              >
                Explore research areas
              </a>
            </div>
          </div>
        </section>

        {/* Research areas — an even 2-by-2 grid on desktop, one column on mobile. */}
        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-6 pb-20 sm:px-10 sm:pb-24 lg:px-14"
          id="research-areas"
        >
          <p className="text-sm font-bold tracking-[0.12em] text-brand-red uppercase">
            Research areas
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
            Four focus areas, one shared habit of testing ideas with real people.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {RESEARCH_AREAS.map((area) => {
              const tone = AREA_TONES[area];
              const pattern = AREA_PATTERNS[area];
              const toneText: Record<string, string> = {
                blue: "text-brand-blue",
                red: "text-brand-red",
                yellow: "text-[#a97b1c] dark:text-[#e3c36a]",
                green: "text-brand-green",
              };
              const toneHover: Record<string, string> = {
                blue: "hover:border-brand-blue/60",
                red: "hover:border-brand-red/60",
                yellow: "hover:border-[#a97b1c]/50 dark:hover:border-[#e3c36a]/50",
                green: "hover:border-brand-green/60",
              };
              const count = records.filter((record) => record.research.areas.includes(area)).length;
              return (
                <Link
                  className={`group relative flex min-h-56 flex-col justify-between overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7 transition ${toneHover[tone]}`}
                  href="#explorer"
                  key={area}
                >
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
                        {RESEARCH_AREA_LABELS[area]}
                      </h3>
                      <PatternTile
                        bg="canvas"
                        className="size-12 rounded-lg"
                        fg={tone}
                        kind={pattern}
                      />
                    </div>
                    <p className="mt-4 max-w-md text-[15px] leading-7 text-[var(--ink-2)] dark:text-white/65">
                      {RESEARCH_AREA_DESCRIPTIONS[area]}
                    </p>
                  </div>
                  <span
                    className={`mt-6 inline-flex items-center gap-1.5 text-sm font-semibold ${toneText[tone]}`}
                  >
                    {count} {count === 1 ? "initiative" : "initiatives"}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Featured initiative — the newest published spotlight, or a polite empty state. */}
        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-6 pb-20 sm:px-10 sm:pb-24 lg:px-14"
          id="featured"
        >
          <p className="text-sm font-bold tracking-[0.12em] text-brand-red uppercase">
            Featured initiative
          </p>
          {featured ? (
            <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] dark:border-white/10 dark:bg-white/[0.02]">
              {featured.research.coverKey ? (
                // The cover is CMS media or bundled seed art, outside the image loader.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={featured.research.coverAlt || `${featured.research.title} cover image`}
                  className="block w-full aspect-[1200/482] object-cover"
                  src={researchCoverUrl(featured.research.coverKey)}
                />
              ) : null}
              <div className="p-7 sm:p-10">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="rounded-full bg-brand-red-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-brand-red uppercase dark:bg-brand-red/15 dark:text-[#ef9a9a]">
                    {RESEARCH_STATUS_LABELS[featured.research.status]}
                  </span>
                  {featured.research.areas.map((area) => (
                    <span
                      className="text-[11px] font-medium tracking-[0.12em] text-[var(--ink-3)] uppercase"
                      key={area}
                    >
                      {RESEARCH_AREA_LABELS[area]}
                    </span>
                  ))}
                </div>
                <h2 className="mt-4 font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
                  {featured.research.title}
                </h2>
                <p className="mt-4 border-l-2 border-brand-red pl-4 text-lg leading-8 text-[var(--ink-2)] dark:text-white/75">
                  {featured.research.question}
                </p>
                <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[var(--ink-2)] dark:text-white/65">
                  {featured.research.summary}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[var(--line)] pt-6 dark:border-white/10">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-[var(--ink-3)] uppercase">
                      Members
                    </p>
                    <p className="mt-1.5 max-w-md text-sm leading-6 text-[var(--ink-2)] dark:text-white/70">
                      {featuredMembers.length
                        ? featuredMembers.map((member) => member.name).join(", ")
                        : "Members will be listed as the team forms."}
                    </p>
                  </div>
                  {featuredMilestone ? (
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold tracking-[0.08em] text-[var(--ink-3)] uppercase">
                        Latest milestone
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-[var(--ink-2)] dark:text-white/70">
                        <span className="font-mono text-[11px] tracking-[0.08em] uppercase">
                          {formatResearchDateShort(featuredMilestone.date)} ·{" "}
                        </span>
                        {featuredMilestone.title}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-red px-5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-red/25"
                    href={`/research/${featured.slug}`}
                  >
                    Read the initiative
                  </Link>
                  {featured.research.methods.slice(0, 5).map((method) => (
                    <span
                      className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-3)] dark:bg-white/[0.06] dark:text-white/50"
                      key={method}
                    >
                      {method}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid gap-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-10 dark:border-white/10 dark:bg-white/[0.02]">
              <PatternTile bg="canvas" className="size-24 rounded-xl" fg="red" kind="circle" />
              <div>
                <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                  No featured initiative yet
                </p>
                <p className="mt-2 max-w-xl text-[15px] leading-7 text-[var(--ink-2)] dark:text-white/65">
                  The spotlight goes to the newest published initiative the lab marks as featured.
                  It will appear here as soon as a study is ready.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Research explorer — every published initiative, newest activity first. */}
        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-6 pb-20 sm:px-10 sm:pb-24 lg:px-14"
          id="explorer"
        >
          <p className="text-sm font-bold tracking-[0.12em] text-brand-red uppercase">
            Research explorer
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
            Every published initiative the lab has run.
          </h2>
          <div className="mt-10">
            <ResearchExplorer members={members} records={records} />
          </div>
        </section>

        {/* Connected outcomes — the bridge to the lab's other outputs. */}
        <section
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-6 pb-32 sm:px-10 lg:px-14"
          id="outcomes"
        >
          <p className="text-sm font-bold tracking-[0.12em] text-brand-red uppercase">
            Connected outcomes
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
            Research is the bridge between the lab&apos;s interests and its outputs.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[var(--ink-2)] dark:text-white/65">
            A research initiative starts with a question. Over time it feeds the lab&apos;s other
            collections: projects the lab builds, publications it writes, and articles it publishes.
            The links below come from real initiatives only.
          </p>
          <div className="mt-10 space-y-12">
            {(["project", "publication", "article"] as const).map((type) => {
              const labels = {
                project: "Projects",
                publication: "Publications",
                article: "Articles",
              } as const;
              const collectionHrefs = {
                project: "/projects",
                publication: "/publications",
                article: "/articles",
              } as const;
              const tones = { project: "blue", publication: "green", article: "red" } as const;
              const patterns = {
                project: "fans",
                publication: "leaves",
                article: "circle",
              } as const;
              const links = outcomes[type];
              return (
                <div key={type}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                      {labels[type]}
                    </h3>
                    <Link
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue transition hover:underline"
                      href={collectionHrefs[type]}
                    >
                      See all {labels[type].toLowerCase()}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                  {links.length ? (
                    <div
                      aria-label={`${labels[type]} connected to research`}
                      className="mt-5 flex snap-x gap-4 overflow-x-auto pb-3"
                    >
                      {links.map((link) => {
                        const safe = safeResearchHref(link.href);
                        const tile = (
                          <div className="flex h-full w-56 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] transition hover:border-brand-red/50 dark:border-white/10 dark:bg-white/[0.02]">
                            <PatternTile
                              bg="canvas"
                              className="block w-full aspect-[16/7]"
                              fg={tones[type]}
                              kind={patterns[type]}
                            />
                            <span className="block px-4 py-3 text-[13px] leading-6 font-medium text-[var(--ink-2)] dark:text-white/70">
                              {link.label}
                            </span>
                          </div>
                        );
                        return safe ? (
                          <a
                            className="block w-56 shrink-0 snap-start"
                            href={safe}
                            key={`${type}:${link.href}`}
                            rel={safe.startsWith("http") ? "noopener noreferrer" : undefined}
                            target={safe.startsWith("http") ? "_blank" : undefined}
                          >
                            {tile}
                          </a>
                        ) : (
                          <div
                            className="block w-56 shrink-0 snap-start"
                            key={`${type}:${link.href}`}
                          >
                            {tile}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-[var(--ink-3)]">
                      No linked {labels[type].toLowerCase()} yet.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {!hasOutcomes ? (
            <p className="mt-6 text-sm leading-6 text-[var(--ink-3)]">
              Initiatives can start without outputs. The connections above fill in as studies reach
              their milestones.
            </p>
          ) : null}
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
