import type { Metadata } from "next";
import { ArrowLeft, CalendarClock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JobApplicationForm } from "@/components/careers/job-application-form";
import { CtaFooter } from "@/components/sections/cta-footer";
import { jobAcceptingApplications } from "@/lib/career-cms";
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
    title: `Apply — ${record.job.title} | MGM Laboratory`,
    description: `Submit your application for ${record.job.title} at MGM Laboratory.`,
  };
}

export default async function CareerApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const record = await fetchCareerRecord(slug).catch(() => undefined);
  if (!record) notFound();

  const { job } = record;
  const accepting = jobAcceptingApplications(job);
  const maxCvBytes = Number(process.env.CMS_MAX_CV_BYTES ?? 104_857_600);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[680px] px-6 pt-16 pb-24 sm:px-10">
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-3)] transition hover:text-brand-blue"
            href={`/careers/${slug}`}
          >
            <ArrowLeft aria-hidden="true" size={15} strokeWidth={2.25} />
            Back to the role
          </Link>

          <p className="mt-10 font-mono text-[10px] font-bold tracking-[0.16em] text-brand-yellow uppercase">
            Application
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
            {job.title}
          </h1>
          <p className="mt-3 text-[var(--ink-2)] dark:text-[#c3c7d1]">
            Fill in the form below and attach your CV. The lab reviews every application and reaches
            out by email.
          </p>

          <div className="mt-10">
            {accepting ? (
              <JobApplicationForm
                job={{ slug: job.slug, title: job.title, deadline: job.deadline }}
                maxCvBytes={maxCvBytes}
              />
            ) : (
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
                    The deadline has passed or the lab closed the opening.{" "}
                    <Link className="text-brand-blue hover:underline" href="/careers">
                      Browse the other open roles
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
