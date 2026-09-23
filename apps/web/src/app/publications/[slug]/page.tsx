import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CitationBox } from "@/components/publications/citation-box";
import { CopyButton } from "@/components/publications/copy-button";
import { PaperSection } from "@/components/publications/paper-section";
import { PublicationAuthors } from "@/components/publications/publication-authors";
import { CtaFooter } from "@/components/sections/cta-footer";
import {
  doiUrl,
  formatPaperSize,
  formatPublicationDate,
  paperIsPublic,
  publishedPublications,
  publicationPaperUrl,
  publicationTypeLabel,
  type CmsPublicationRecord,
} from "@/lib/publication-cms";
import { ensurePublicationFeed, fetchPublicationRecord } from "@/lib/publication-cms-seed";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

type PublicationPageProps = { params: Promise<{ slug: string }> };

// Publications resolve entirely at request time: the CMS is the source of
// truth and admin publishes must reach the public page immediately.
export const revalidate = 0;

async function readRecord(slug: string) {
  try {
    return await fetchPublicationRecord(slug);
  } catch {
    return undefined;
  }
}

async function readFeed() {
  try {
    return publishedPublications(await ensurePublicationFeed());
  } catch {
    return [] as CmsPublicationRecord[];
  }
}

/** Portrait keys for lab-member authors, resolved through the member CMS. */
async function readMemberPhotos() {
  try {
    const records = await ensureMemberCmsSeeded();
    return new Map(
      records.flatMap((record) =>
        record.profile.photoKey ? [[record.slug, record.profile.photoKey] as const] : [],
      ),
    );
  } catch {
    return new Map<string, string>();
  }
}

export async function generateMetadata({ params }: PublicationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await readRecord(slug);
  if (!record) return { title: "Publication not found | MGM Laboratory" };
  const { publication } = record;
  return {
    title: `${publication.title} | MGM Laboratory`,
    description: publication.abstract?.slice(0, 160) || undefined,
  };
}

function MetaRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--ink-3)] uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-6 text-[var(--ink)] dark:text-white/85">{value}</dd>
    </div>
  );
}

export default async function PublicationPage({ params }: PublicationPageProps) {
  const { slug } = await params;
  const [record, feed, memberPhotos] = await Promise.all([
    readRecord(slug),
    readFeed(),
    readMemberPhotos(),
  ]);
  if (!record) notFound();

  const { publication } = record;
  // Papers are hidden until an editor publishes them from the admin editor:
  // the preview, the viewer, and the manuscript row only appear once the
  // record opts in, and the DOI row stays the access path until then.
  const paperVisible = paperIsPublic(publication);
  const paperUrl = paperVisible ? publicationPaperUrl(publication.paperKey) : undefined;
  const doi = doiUrl(publication.doi);
  const others = feed
    .filter(
      (item) =>
        item.slug !== slug &&
        (item.publication.keywords.some((keyword) => publication.keywords.includes(keyword)) ||
          item.publication.authors.some((author) =>
            publication.authors.some(
              (own) => own.memberSlug && own.memberSlug === author.memberSlug,
            ),
          )),
    )
    .slice(0, 3);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <article className="mx-auto w-full max-w-[1200px] px-6 pt-[91px] pb-16 sm:px-10 lg:px-14">
          <header>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Link
                className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-green uppercase transition hover:underline"
                href="/publications"
              >
                Publications
              </Link>
              <span className="h-3 w-px bg-[var(--line-strong)]" aria-hidden="true" />
              <span className="text-[11px] font-bold tracking-[0.12em] text-[var(--ink-3)] uppercase">
                {publicationTypeLabel(publication.type)}
              </span>
              <span className="h-3 w-px bg-[var(--line-strong)]" aria-hidden="true" />
              <time
                className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-3)] uppercase"
                dateTime={publication.date}
              >
                {formatPublicationDate(publication.date)}
              </time>
            </div>
            <h1 className="mt-5 font-display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.12] font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
              {publication.title}
            </h1>
            <div className="mt-7">
              <PublicationAuthors authors={publication.authors} memberPhotos={memberPhotos} />
            </div>
          </header>

          {/* Bibliographic details. */}
          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-[var(--line)] py-7 sm:grid-cols-3 lg:grid-cols-4 dark:border-white/10">
            <MetaRow label="Journal / venue" value={publication.journal || undefined} />
            <MetaRow label="Volume" value={publication.volume} />
            <MetaRow label="Issue" value={publication.issue} />
            <MetaRow label="Pages" value={publication.pages} />
            <MetaRow label="Publisher" value={publication.publisher} />
            <MetaRow
              label="Published"
              value={formatPublicationDate(publication.date).replace(/^[^,]+, /, "")}
            />
            <MetaRow label="License" value={publication.license} />
            {paperVisible ? (
              <MetaRow
                label="Manuscript"
                value={
                  publication.paperName
                    ? `${publication.paperName}${formatPaperSize(publication.paperSize) ? ` · ${formatPaperSize(publication.paperSize)}` : ""}`
                    : undefined
                }
              />
            ) : null}
          </dl>

          {/* DOI + quick actions. */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {doi ? (
              <a
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-blue/30 bg-brand-blue-50 px-4 font-mono text-[13px] font-semibold text-brand-blue transition hover:bg-brand-blue hover:text-white dark:bg-brand-blue/15 dark:text-[#9db8e8]"
                href={doi}
                rel="noreferrer"
                target="_blank"
              >
                doi.org/{publication.doi}
              </a>
            ) : null}
            {publication.doi ? <CopyButton label="Copy DOI" value={doi ?? ""} /> : null}
            {publication.url ? (
              <a
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line-strong)] px-4 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:text-white/70 dark:hover:text-white"
                href={publication.url}
                rel="noreferrer"
                target="_blank"
              >
                Publisher&apos;s page
              </a>
            ) : null}
          </div>

          {publication.keywords.length ? (
            <div className="mt-7 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--ink-3)] uppercase">
                Keywords
              </span>
              {publication.keywords.map((keyword) => (
                <span
                  className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] dark:bg-white/[0.06] dark:text-white/60"
                  key={keyword}
                >
                  {keyword}
                </span>
              ))}
            </div>
          ) : null}

          {/* Abstract. */}
          {publication.abstract ? (
            <section aria-labelledby="abstract-heading" className="mt-14">
              <h2
                className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white"
                id="abstract-heading"
              >
                Abstract
              </h2>
              <p className="mt-4 max-w-[720px] text-[1.0625rem] leading-8 text-[var(--ink-2)] dark:text-[#c3c7d1]">
                {publication.abstract}
              </p>
            </section>
          ) : null}

          {/* The paper itself, once the editors have made it visible. */}
          {paperVisible ? (
            <div className="mt-14">
              <PaperSection
                fileName={publication.paperName}
                paperSize={publication.paperSize}
                title={publication.title}
                url={paperUrl}
              />
            </div>
          ) : null}

          {/* Citations. */}
          <div className="mt-16">
            <CitationBox publication={publication} />
          </div>
        </article>

        {others.length ? (
          <section className="mx-auto w-full max-w-[1200px] px-6 pb-32 sm:px-10 lg:px-14">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
                Related publications
              </h2>
              <Link
                className="text-base text-[#464646] transition hover:text-brand-blue dark:text-[#b9bcc6]"
                href="/publications"
              >
                View More
              </Link>
            </div>
            <div className="mt-[35px] grid grid-cols-1 gap-[25px] sm:grid-cols-3">
              {others.map((other) => (
                <Link
                  className="group block min-w-0 rounded-2xl border border-[var(--line)] p-5 transition hover:border-brand-blue/40 dark:border-white/10"
                  href={`/publications/${other.slug}`}
                  key={other.slug}
                >
                  <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--ink-3)] uppercase">
                    {publicationTypeLabel(other.publication.type)}
                  </p>
                  <h3 className="mt-2 font-display text-[1.125rem] leading-snug font-semibold text-[#0e1116] transition group-hover:text-brand-blue dark:text-white">
                    {other.publication.title}
                  </h3>
                  <p className="mt-2 text-[13px] text-[var(--ink-3)]">
                    {other.publication.authors.map((author) => author.name).join(", ")}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--ink-3)]">
                    {other.publication.date.slice(0, 4)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <CtaFooter />
    </div>
  );
}
