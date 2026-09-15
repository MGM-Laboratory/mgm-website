import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/articles/article-body";
import { CtaFooter } from "@/components/sections/cta-footer";
import { MEMBERS } from "@/data/members";
import { mergeMemberRecords } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import {
  formatResearchDateShort,
  formatResearchPeriod,
  researchCoverUrl,
  researchMembers,
  safeResearchHref,
  RESEARCH_AREA_LABELS,
  RESEARCH_STATUS_LABELS,
  type ResearchMilestone,
  type ResearchOutputLink,
} from "@/lib/research-cms";
import { fetchResearchRecord } from "@/lib/research-cms-server";

type ResearchPageProps = { params: Promise<{ slug: string }> };

// Research resolves entirely at request time: the CMS is the source of
// truth and admin publishes must reach the public page immediately.
export const revalidate = 0;

async function readRecord(slug: string) {
  try {
    return await fetchResearchRecord(slug);
  } catch {
    return undefined;
  }
}

async function readMembers() {
  try {
    return mergeMemberRecords(MEMBERS, await ensureMemberCmsSeeded());
  } catch {
    return [...MEMBERS];
  }
}

export async function generateMetadata({ params }: ResearchPageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await readRecord(slug);
  if (!record) return { title: "Research initiative not found | MGM Laboratory" };
  const title = record.research.seoTitle || record.research.title;
  const description = record.research.seoDescription || record.research.summary;
  return {
    title: `${title} | MGM Laboratory`,
    description,
    openGraph: {
      title: `${title} | MGM Laboratory`,
      description,
      type: "article",
      siteName: "MGM Laboratory",
    },
  };
}

const AREA_BADGES: Record<string, string> = {
  website: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  mobile: "bg-brand-yellow-50 text-[#a97b1c] dark:bg-brand-yellow/15 dark:text-[#e3c36a]",
  "hci-ux": "bg-brand-red-50 text-brand-red dark:bg-brand-red/15 dark:text-[#ef9a9a]",
  "game-xr": "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
};

const STATUS_BADGES: Record<string, string> = {
  exploring: "bg-[var(--surface-muted)] text-[var(--ink-2)] dark:bg-white/10 dark:text-white/75",
  active: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  completed: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
};

const OUTPUT_LABELS = {
  project: "Related projects",
  publication: "Related publications",
  article: "Related articles",
} as const;

const OUTPUT_EMPTY = {
  project: "No linked projects yet.",
  publication: "No linked publications yet.",
  article: "No linked articles yet.",
} as const;

function MilestoneEntry({ milestone }: { milestone: ResearchMilestone }) {
  return (
    <li className="relative pl-7">
      {/* The dot straddles the timeline: -left-[5px] centers the 10px dot
          on the 1px border line drawn at the list's left edge. */}
      <span
        aria-hidden="true"
        className="absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-brand-red bg-[var(--surface)]"
      />
      <time
        className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-3)] uppercase"
        dateTime={milestone.date}
      >
        {formatResearchDateShort(milestone.date)}
      </time>
      <h3 className="mt-1.5 font-display text-lg font-semibold tracking-[-0.01em] text-[#0e1116] dark:text-white">
        {milestone.title}
      </h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
        {milestone.summary}
      </p>
      {milestone.relatedUrl && safeResearchHref(milestone.relatedUrl) ? (
        <a
          className="mt-2 inline-block text-sm font-medium text-brand-blue underline decoration-brand-blue/40 underline-offset-2 transition hover:decoration-brand-blue"
          href={milestone.relatedUrl}
          rel={milestone.relatedUrl.startsWith("http") ? "noopener noreferrer" : undefined}
          target={milestone.relatedUrl.startsWith("http") ? "_blank" : undefined}
        >
          {milestone.relatedLabel || "Related link"}
        </a>
      ) : milestone.relatedUrl ? (
        <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
          {milestone.relatedLabel || "Related link"}
        </p>
      ) : null}
    </li>
  );
}

function OutputGroup({
  label,
  links,
  empty,
}: {
  label: string;
  links: ResearchOutputLink[];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 dark:border-white/10 dark:bg-white/[0.02]">
      <h2 className="font-display text-lg font-semibold text-[#0e1116] dark:text-white">{label}</h2>
      {links.length ? (
        <ul className="mt-4 space-y-2.5">
          {links.map((link) =>
            safeResearchHref(link.href) ? (
              <li key={link.id}>
                <a
                  className="text-sm leading-6 text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-4 transition hover:text-brand-red hover:decoration-brand-red/50 dark:text-white/70"
                  href={link.href}
                  rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  target={link.href.startsWith("http") ? "_blank" : undefined}
                >
                  {link.label}
                </a>
              </li>
            ) : (
              <li
                className="text-sm leading-6 text-[var(--ink-2)] dark:text-white/70"
                key={link.id}
              >
                {link.label}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-6 text-[var(--ink-3)]">{empty}</p>
      )}
    </div>
  );
}

export default async function ResearchDetailPage({ params }: ResearchPageProps) {
  const { slug } = await params;
  const [record, members] = await Promise.all([readRecord(slug), readMembers()]);
  if (!record) notFound();

  const research = record.research;
  const involved = researchMembers(record, members);
  const coverUrl = researchCoverUrl(research.coverKey);
  const period = formatResearchPeriod(research);
  const outputsByType = {
    project: research.outputs.filter((output) => output.type === "project"),
    publication: research.outputs.filter((output) => output.type === "publication"),
    article: research.outputs.filter((output) => output.type === "article"),
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <article className="mx-auto w-full max-w-[1200px] px-6 pt-20 pb-16 sm:px-10 sm:pt-24 lg:px-14">
          <header>
            <p className="text-sm font-bold tracking-[0.12em] text-brand-red uppercase">
              Our Work / Research
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${STATUS_BADGES[research.status]}`}
              >
                {RESEARCH_STATUS_LABELS[research.status]}
              </span>
              {research.areas.map((area) => (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${AREA_BADGES[area]}`}
                  key={area}
                >
                  {RESEARCH_AREA_LABELS[area]}
                </span>
              ))}
              {period ? (
                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-3)] uppercase">
                  {period}
                </span>
              ) : null}
            </div>
            <h1 className="mt-5 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
              {research.title}
            </h1>
            {involved.length ? (
              <p className="mt-5 flex flex-wrap gap-x-2 text-sm text-[var(--ink-2)] dark:text-white/65">
                <span className="font-semibold text-[var(--ink-3)] uppercase">
                  {involved.length === 1 ? "Member" : "Members"}:
                </span>
                {involved.map((member, index) => (
                  <span key={member.slug}>
                    <Link
                      className="underline decoration-[var(--line-strong)] underline-offset-4 transition hover:text-brand-red hover:decoration-brand-red/50"
                      href={`/member/${member.slug}`}
                    >
                      {member.name}
                    </Link>
                    {index < involved.length - 1 ? "," : ""}
                  </span>
                ))}
              </p>
            ) : null}
          </header>

          {coverUrl ? (
            <div className="mt-10 overflow-hidden rounded-[24px]">
              {/* CMS media stays a plain image: the cover is a signed CMS
                  asset or bundled seed art, outside the image loader. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={research.coverAlt || `${research.title} cover image`}
                className="block w-full aspect-[1200/482] object-cover"
                src={coverUrl}
              />
            </div>
          ) : null}

          <section className="mt-12">
            <div>
              <p className="max-w-2xl text-lg leading-8 text-[var(--ink-2)] dark:text-white/70">
                {research.summary}
              </p>

              <div className="mt-10 rounded-r-2xl border-l-2 border-brand-red bg-brand-red-50/40 px-6 py-5 dark:bg-brand-red/10">
                <p className="text-[11px] font-bold tracking-[0.08em] text-brand-red uppercase">
                  Research question
                </p>
                <p className="mt-2 font-display text-xl leading-8 font-medium text-[#0e1116] dark:text-white">
                  {research.question}
                </p>
              </div>

              {research.context || research.contribution ? (
                <div className="mt-10 grid gap-8 md:grid-cols-2">
                  {research.context ? (
                    <div>
                      <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                        Context
                      </h2>
                      <p className="mt-3 text-[15px] leading-7 text-[var(--ink-2)] dark:text-white/65">
                        {research.context}
                      </p>
                    </div>
                  ) : null}
                  {research.contribution ? (
                    <div>
                      <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                        Intended contribution
                      </h2>
                      <p className="mt-3 text-[15px] leading-7 text-[var(--ink-2)] dark:text-white/65">
                        {research.contribution}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-10">
                <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                  Methods
                </h2>
                {research.methods.length ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {research.methods.map((method) => (
                      <span
                        className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-[13px] font-medium text-[var(--ink-2)] dark:bg-white/[0.06] dark:text-white/60"
                        key={method}
                      >
                        {method}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-3)]">
                    Methods will be listed as the study takes shape.
                  </p>
                )}
              </div>

              {/* The timeline sits in the main column below the methods so the
                  page reads as one wide column instead of a narrow sidebar. */}
              <div className="mt-12 border-t border-[var(--line)] pt-10 dark:border-white/10">
                <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                  Timeline
                </h2>
                {research.milestones.length ? (
                  <ol className="mt-6 max-w-3xl space-y-8 border-l border-[var(--line)] dark:border-white/10">
                    {[...research.milestones]
                      .sort((left, right) => right.date.localeCompare(left.date))
                      .map((milestone) => (
                        <MilestoneEntry key={milestone.id} milestone={milestone} />
                      ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[var(--ink-3)]">
                    No milestones yet. Meaningful updates like prototype tests, evaluations,
                    accepted papers, and releases will appear here.
                  </p>
                )}
              </div>

              {record.body.length ? (
                <div className="mt-12 border-t border-[var(--line)] pt-10 dark:border-white/10">
                  <ArticleBody blocks={record.body} />
                </div>
              ) : null}
            </div>
          </section>

          <section className="mt-14 border-t border-[var(--line)] pt-10 dark:border-white/10">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {(["project", "publication", "article"] as const).map((type) => (
                <OutputGroup
                  empty={OUTPUT_EMPTY[type]}
                  key={type}
                  label={OUTPUT_LABELS[type]}
                  links={outputsByType[type]}
                />
              ))}
            </div>
          </section>

          {research.partners?.length ? (
            <section className="mt-14 border-t border-[var(--line)] pt-10 dark:border-white/10">
              <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                Partners and funders
              </h2>
              <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {research.partners.map((partner, index) => (
                  <li className="text-sm text-[var(--ink-2)] dark:text-white/70" key={index}>
                    {partner.url && safeResearchHref(partner.url) ? (
                      <a
                        className="underline decoration-[var(--line-strong)] underline-offset-4 transition hover:text-brand-red hover:decoration-brand-red/50"
                        href={partner.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {partner.name}
                      </a>
                    ) : (
                      partner.name
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </main>
      <CtaFooter />
    </div>
  );
}
