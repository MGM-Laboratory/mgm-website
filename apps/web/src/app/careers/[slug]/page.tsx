import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, CalendarClock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CareerDescriptionPreview } from "@/components/careers/career-description-preview";
import { CtaFooter } from "@/components/sections/cta-footer";
import {
  COMMITMENT_LABELS,
  MODE_LABELS,
  formatJobDeadline,
  jobAcceptingApplications,
  type JobDraft,
} from "@/lib/career-cms";
import { fetchCareerRecord } from "@/lib/career-cms-server";

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const record = await fetchCareerRecord(slug);
  if (!record) return { title: "Role not found | MGM Laboratory" };
  return {
    title: `${record.job.title} | MGM Laboratory`,
    description: `${record.job.focus} role — apply by ${formatJobDeadline(record.job.deadline)}.`,
  };
}

const META_CELL = "bg-white p-5 dark:bg-[#0e1116]";

function ApplyButton({ slug, label = "Apply now" }: { slug: string; label?: string }) {
  return (
    <Link
      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0e1116] px-8 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] dark:bg-white dark:text-[#0e1116] dark:hover:bg-brand-yellow"
      href={`/careers/${slug}/apply`}
    >
      {label}
      <ArrowRight aria-hidden="true" size={16} strokeWidth={2.25} />
    </Link>
  );
}

function ClosedBanner() {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-brand-red/40 bg-brand-red-50 px-6 py-5 dark:border-brand-red/25 dark:bg-brand-red/10">
      <CalendarClock
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-brand-red"
        size={22}
        strokeWidth={2}
      />
      <div>
        <p className="font-semibold text-[var(--ink)] dark:text-white">
          This role is no longer accepting applications.
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-2)] dark:text-[#c3c7d1]">
          The deadline has passed or the lab closed the opening. Browse the other open roles.
        </p>
      </div>
    </div>
  );
}

function MetaPanel({ job }: { job: JobDraft }) {
  const cells = [
    { label: "Focus", value: job.focus },
    { label: "Commitment", value: COMMITMENT_LABELS[job.commitment] },
    { label: "Mode", value: MODE_LABELS[job.mode] },
    { label: "Deadline", value: formatJobDeadline(job.deadline) },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] shadow-[var(--shadow-1)]">
      <div className="grid grid-cols-2 gap-px bg-[var(--line)] lg:grid-cols-4">
        {cells.map((cell) => (
          <div className={META_CELL} key={cell.label}>
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[var(--ink-3)] uppercase dark:text-white/45">
              {cell.label}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold text-[#0e1116] dark:text-white">
              {cell.value}
            </p>
          </div>
        ))}
      </div>
      {job.perks.length ? (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--line)] bg-white p-5 dark:bg-[#0e1116]">
          {job.perks.map((perk) => (
            <span
              className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)] dark:bg-white/[0.07] dark:text-[#c3c7d1]"
              key={perk}
            >
              {perk}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function CareerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const record = await fetchCareerRecord(slug).catch(() => undefined);
  if (!record) notFound();

  const { job, content } = record;
  const accepting = jobAcceptingApplications(job);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[860px] px-6 pt-16 pb-24 sm:px-10">
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-3)] transition hover:text-brand-blue"
            href="/careers"
          >
            <ArrowLeft aria-hidden="true" size={15} strokeWidth={2.25} />
            All roles
          </Link>

          <p className="mt-10 font-mono text-[10px] font-bold tracking-[0.16em] text-brand-yellow uppercase">
            {job.focus}
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
            {job.title}
          </h1>

          <div className="mt-8">
            <MetaPanel job={job} />
          </div>

          {/* The Apply CTA sits above the fold of the description on purpose:
              applicants should see where to apply before reading everything. */}
          <div className="mt-8">{accepting ? <ApplyButton slug={slug} /> : <ClosedBanner />}</div>

          {content.length ? (
            <div className="mt-14">
              <h2 className="font-mono text-[10px] font-bold tracking-[0.16em] text-[var(--ink-3)] uppercase dark:text-white/45">
                About the role
              </h2>
              <div className="mt-6">
                <CareerDescriptionPreview blocks={content} />
              </div>
            </div>
          ) : null}

          <div className="mt-14 border-t border-[var(--line)] pt-10">
            {accepting ? (
              <div>
                <p className="text-sm text-[var(--ink-2)] dark:text-[#c3c7d1]">
                  Applications are open until{" "}
                  <span className="font-semibold text-[var(--ink)] dark:text-white">
                    {formatJobDeadline(job.deadline)}
                  </span>
                  .
                </p>
                <div className="mt-5">
                  <ApplyButton slug={slug} label="Apply for this role" />
                </div>
              </div>
            ) : (
              <ClosedBanner />
            )}
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
