import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/articles/article-body";
import { ProjectContributors } from "@/components/projects/project-contributors";
import { ProjectThumbnailCarousel } from "@/components/projects/project-thumbnail-carousel";
import { ProjectVideoPlayer } from "@/components/projects/project-video-player";
import { CtaFooter } from "@/components/sections/cta-footer";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import {
  formatProjectPeriod,
  projectGalleryKeys,
  projectMediaUrl,
  safeProjectHref,
  PROJECT_CATEGORY_LABELS,
  PROJECT_STATUS_LABELS,
  type ProjectOutputLink,
} from "@/lib/project-cms";
import { fetchProjectRecord } from "@/lib/project-cms-server";

type ProjectPageProps = { params: Promise<{ slug: string }> };

// Projects resolve entirely at request time: the CMS is the source of
// truth and admin publishes must reach the public page immediately.
export const revalidate = 0;

async function readRecord(slug: string) {
  try {
    return await fetchProjectRecord(slug);
  } catch {
    return undefined;
  }
}

/** Portrait keys for lab-member contributors, resolved through the member CMS. */
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

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await readRecord(slug);
  if (!record) return { title: "Project not found | MGM Laboratory" };
  const title = record.project.seoTitle || record.project.title;
  const description = record.project.seoDescription || record.project.summary;
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

const CATEGORY_BADGES: Record<string, string> = {
  website: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  mobile: "bg-brand-yellow-50 text-[#a97b1c] dark:bg-brand-yellow/15 dark:text-[#e3c36a]",
  "hci-ux": "bg-brand-red-50 text-brand-red dark:bg-brand-red/15 dark:text-[#ef9a9a]",
  game: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
};

const STATUS_BADGES: Record<string, string> = {
  planned: "bg-[var(--surface-muted)] text-[var(--ink-2)] dark:bg-white/10 dark:text-white/75",
  "in-progress": "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  completed: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
  archived: "bg-[var(--surface-muted)] text-[var(--ink-3)] dark:bg-white/10 dark:text-white/50",
};

const OUTPUT_LABELS = {
  research: "Related research",
  publication: "Related publications",
  article: "Related articles",
} as const;

const OUTPUT_EMPTY = {
  research: "No linked research yet.",
  publication: "No linked publications yet.",
  article: "No linked articles yet.",
} as const;

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

function OutputGroup({
  empty,
  label,
  links,
}: {
  empty: string;
  label: string;
  links: ProjectOutputLink[];
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 dark:border-white/10 dark:bg-white/[0.02]">
      <h2 className="font-display text-lg font-semibold text-[#0e1116] dark:text-white">{label}</h2>
      {links.length ? (
        <ul className="mt-4 space-y-2.5">
          {links.map((link) =>
            safeProjectHref(link.href) ? (
              <li key={link.id}>
                <a
                  className="text-sm leading-6 text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-4 transition hover:text-brand-blue hover:decoration-brand-blue/50 dark:text-white/70"
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

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const [record, memberPhotos] = await Promise.all([readRecord(slug), readMemberPhotos()]);
  if (!record) notFound();

  const { project } = record;
  const coverUrl = projectMediaUrl(project.coverKey);
  const galleryUrls = projectGalleryKeys(project)
    .map((key) => projectMediaUrl(key))
    .filter((url): url is string => Boolean(url));
  const period = formatProjectPeriod(project);
  const outputsByType = {
    research: project.outputs.filter((output) => output.type === "research"),
    publication: project.outputs.filter((output) => output.type === "publication"),
    article: project.outputs.filter((output) => output.type === "article"),
  };
  const hasVideo = project.videoMode !== "none";

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <article className="mx-auto w-full max-w-[1200px] px-6 pt-20 pb-16 sm:px-10 sm:pt-24 lg:px-14">
          <header>
            <Link
              className="inline-flex items-center gap-2 py-2 text-sm font-bold tracking-[0.12em] text-brand-blue uppercase transition hover:opacity-85"
              href="/projects"
            >
              <ArrowLeft aria-hidden="true" size={15} strokeWidth={2.25} />
              Back to Projects
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${STATUS_BADGES[project.status]}`}
              >
                {PROJECT_STATUS_LABELS[project.status]}
              </span>
              {project.categories.map((category) => (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${CATEGORY_BADGES[category]}`}
                  key={category}
                >
                  {PROJECT_CATEGORY_LABELS[category]}
                </span>
              ))}
              {period ? (
                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-3)] uppercase">
                  {period}
                </span>
              ) : null}
            </div>
            <h1 className="mt-5 font-display text-[clamp(2rem,4.5vw+1rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-[#0e1116] dark:text-white">
              {project.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--ink-2)] dark:text-white/70">
              {project.summary}
            </p>
          </header>

          {coverUrl ? (
            <div className="mt-10 overflow-hidden rounded-[24px]">
              {/* CMS media stays a plain image: the cover is a signed CMS
                  asset, outside the image loader. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={project.coverAlt || `${project.title} cover image`}
                className="block w-full aspect-[1200/482] object-cover"
                src={coverUrl}
              />
            </div>
          ) : null}

          {hasVideo ? (
            <div className="mt-8">
              <ProjectVideoPlayer project={project} />
            </div>
          ) : null}

          <section className="mt-12">
            {record.body.length ? <ArticleBody blocks={record.body} /> : null}

            {/* Bibliographic-style details. */}
            <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-[var(--line)] py-7 sm:grid-cols-3 lg:grid-cols-4 dark:border-white/10">
              <MetaRow label="Status" value={PROJECT_STATUS_LABELS[project.status]} />
              <MetaRow label="Timeline" value={period} />
              <MetaRow label="The lab's role" value={project.role} />
              <MetaRow label="Platform" value={project.platform} />
            </dl>

            {project.techStack.length ? (
              <div className="mt-8">
                <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--ink-3)] uppercase">
                  Tech stack
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.techStack.map((tech) => (
                    <span
                      className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-[13px] font-medium text-[var(--ink-2)] dark:bg-white/[0.06] dark:text-white/60"
                      key={tech}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {project.links.length ? (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {project.links.map((link) => {
                  const href = safeProjectHref(link.url);
                  if (!href) return null;
                  return (
                    <a
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line-strong)] px-4 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:text-white/70 dark:hover:text-white"
                      href={href}
                      key={link.id}
                      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                      target={href.startsWith("http") ? "_blank" : undefined}
                    >
                      {link.label}
                    </a>
                  );
                })}
              </div>
            ) : null}

            {project.contributors.length ? (
              <div className="mt-12 border-t border-[var(--line)] pt-10 dark:border-white/10">
                <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                  Team
                </h2>
                <div className="mt-6">
                  <ProjectContributors
                    contributors={project.contributors}
                    memberPhotos={memberPhotos}
                  />
                </div>
              </div>
            ) : null}

            {project.organizations.length ? (
              <div className="mt-12 border-t border-[var(--line)] pt-10 dark:border-white/10">
                <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                  Organizations
                </h2>
                <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                  {project.organizations.map((organization, index) => (
                    <li className="text-sm text-[var(--ink-2)] dark:text-white/70" key={index}>
                      {organization.url && safeProjectHref(organization.url) ? (
                        <a
                          className="underline decoration-[var(--line-strong)] underline-offset-4 transition hover:text-brand-blue hover:decoration-brand-blue/50"
                          href={organization.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {organization.name}
                        </a>
                      ) : (
                        organization.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {galleryUrls.length > 1 ? (
              <div className="mt-12 border-t border-[var(--line)] pt-10 dark:border-white/10">
                <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white">
                  Gallery
                </h2>
                <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] dark:border-white/10">
                  <ProjectThumbnailCarousel
                    alt={project.title}
                    className="aspect-[16/9] w-full"
                    images={galleryUrls}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-14 border-t border-[var(--line)] pt-10 dark:border-white/10">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {(["research", "publication", "article"] as const).map((type) => (
                <OutputGroup
                  empty={OUTPUT_EMPTY[type]}
                  key={type}
                  label={OUTPUT_LABELS[type]}
                  links={outputsByType[type]}
                />
              ))}
            </div>
          </section>
        </article>
      </main>
      <CtaFooter />
    </div>
  );
}
