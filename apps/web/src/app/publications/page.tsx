import type { Metadata } from "next";

import { PublicationList } from "@/components/publications/publication-list";
import { CtaFooter } from "@/components/sections/cta-footer";
import { publishedPublications, type CmsPublicationRecord } from "@/lib/publication-cms";
import { ensurePublicationFeed } from "@/lib/publication-cms-seed";

export const metadata: Metadata = {
  title: "Publications — MGM Laboratory",
  description:
    "Peer-reviewed papers and scholarly writing from MGM Laboratory — journal articles, conference papers, and preprints.",
};

export const revalidate = 0;

async function readRecords() {
  try {
    return publishedPublications(await ensurePublicationFeed());
  } catch {
    return [] as CmsPublicationRecord[];
  }
}

export default async function PublicationsPage() {
  const publications = await readRecords();

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1200px] px-[55px] pt-24 pb-16">
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-green uppercase">
            Our Work — Publications
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
            Publications
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-7 text-[var(--ink-2)] dark:text-[#c3c7d1]">
            Peer-reviewed papers and scholarly writing from the lab — journal articles, conference
            papers, and preprints, each with its full text, citation formats, and supporting data.
          </p>
        </section>

        <section className="mx-auto w-full max-w-[1200px] px-[55px] pb-40">
          {publications.length ? (
            <PublicationList records={publications} />
          ) : (
            <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center dark:border-white/10">
              <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                No publications yet
              </p>
              <p className="mt-2 text-[var(--ink-3)]">
                The first papers from the lab are on their way.
              </p>
            </div>
          )}
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
