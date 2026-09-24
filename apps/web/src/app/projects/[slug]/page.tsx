import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { projectDetailData } from "@/components/projects/detail/detail-data";
import { ProjectDetail } from "@/components/projects/detail/project-detail";
import { projectMediaUrl, projectThemeId } from "@/lib/project-cms";
import { readProjectDetail } from "@/lib/project-cms-server";
import { PROJECT_THEMES, projectThemeCss } from "@/lib/project-themes";

// Projects resolve entirely at request time: the CMS is the source of
// truth and admin publishes must reach the public page immediately.
export const revalidate = 0;

type ProjectPageProps = PageProps<"/projects/[slug]">;

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { record } = await readProjectDetail(slug);
  if (!record) return { title: "Project not found | MGM Laboratory" };
  const { project } = record;
  const title = `${project.seoTitle || project.title} | MGM Laboratory`;
  const description = project.seoDescription || project.description || project.summary;
  // The cover is served from this site's own media route, and Open Graph
  // needs an absolute URL: resolve it against the host this request reached.
  const cover = projectMediaUrl(project.coverKey);
  const requestHeaders = await headers();
  // Forwarded headers may carry a list ("https, http") or anything a client
  // sent: take the first entry, and drop the base (only the Open Graph image
  // goes) rather than fail the page on a value that isn't a URL.
  const first = (name: string) => requestHeaders.get(name)?.split(",")[0]?.trim() || undefined;
  const host = first("x-forwarded-host") ?? first("host");
  const protocol =
    first("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  let metadataBase: URL | undefined;
  try {
    metadataBase = host && /^https?$/.test(protocol) ? new URL(`${protocol}://${host}`) : undefined;
  } catch {
    metadataBase = undefined;
  }
  return {
    title,
    description,
    metadataBase,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "MGM Laboratory",
      images:
        cover && metadataBase
          ? [{ url: cover, alt: project.coverAlt || project.title }]
          : undefined,
    },
  };
}

export async function generateViewport({ params }: ProjectPageProps): Promise<Viewport> {
  const { slug } = await params;
  const { record } = await readProjectDetail(slug);
  if (!record) return {};
  // The browser chrome wears the project's background, following the
  // system scheme (the site's own toggle can't reach a meta tag).
  const theme = PROJECT_THEMES[projectThemeId(record.project)];
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: theme.light.bg },
      { media: "(prefers-color-scheme: dark)", color: theme.dark.bg },
    ],
  };
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const { record, feed } = await readProjectDetail(slug);
  if (!record) notFound();

  const data = projectDetailData(record, feed);

  return (
    <>
      {/* The project's palette exists only while this page is mounted: the
          variables sit on :root (the site header reads them too) and the
          page background follows them, light or dark with the site. A
          plain <style> (not a hoisted one) leaves with the page. */}
      <style>{`${projectThemeCss(data.themeId)}html,body{background:var(--project-bg)}`}</style>
      <ProjectDetail data={data} key={data.slug} />
    </>
  );
}
