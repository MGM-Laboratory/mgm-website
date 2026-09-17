import { ImageIcon } from "lucide-react";
import Link from "next/link";

import { PROJECT_CATEGORY_LABELS, projectMediaUrl, type CmsProjectRecord } from "@/lib/project-cms";

/** The compact card used for the homepage's "Projects" preview row. */
export function ProjectPreviewCard({ record }: { record: CmsProjectRecord }) {
  const { project } = record;
  const cover = projectMediaUrl(project.coverKey);

  return (
    <Link className="group block" href={`/projects/${record.slug}`} title={project.title}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="block aspect-[4/3] w-full rounded-xl object-cover transition group-hover:opacity-90"
          src={cover}
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[var(--surface-muted)]">
          <ImageIcon className="size-10 text-foreground/25" strokeWidth={1.5} />
        </div>
      )}
      {project.categories[0] ? (
        <p className="mt-3 text-xs font-medium tracking-wide text-foreground/45 uppercase">
          {PROJECT_CATEGORY_LABELS[project.categories[0]]}
        </p>
      ) : null}
      <h3 className="mt-1 font-display font-medium text-foreground transition group-hover:text-brand-blue">
        {project.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-foreground/60">{project.summary}</p>
    </Link>
  );
}
