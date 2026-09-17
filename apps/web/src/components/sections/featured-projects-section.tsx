"use client";

import { useLayoutEffect, useRef } from "react";
import { ImageIcon } from "lucide-react";
import Link from "next/link";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PROJECT_CATEGORY_LABELS, projectMediaUrl, type CmsProjectRecord } from "@/lib/project-cms";
import { Card, CardSwap } from "@/components/projects/card-swap";

// CardSwap clones its direct children to inject the ref/size it positions
// each card with, so the content below must be the <Card>'s children, not a
// wrapping component — a wrapping component here would absorb that ref/size
// itself and never forward it to the actual .card element underneath.
function FeaturedProjectCardContent({ record }: Readonly<{ record: CmsProjectRecord }>) {
  const { project } = record;
  const cover = projectMediaUrl(project.coverKey);

  return (
    <Link className="group absolute inset-0 block" href={`/projects/${record.slug}`}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-105"
          src={cover}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-muted)]">
          <ImageIcon className="size-10 text-foreground/25" strokeWidth={1.5} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        {project.categories[0] ? (
          <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">
            {PROJECT_CATEGORY_LABELS[project.categories[0]]}
          </p>
        ) : null}
        <h3 className="mt-1 font-display text-lg font-semibold text-white">{project.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-white/75">{project.summary}</p>
      </div>
    </Link>
  );
}

/**
 * The homepage's Projects preview: a React Bits CardSwap stack showing only
 * the projects an admin has flagged "Featured" (see project-cms-editor.tsx),
 * each card a real link to its project page. Renders nothing if no project
 * is currently featured, same empty-state convention as the other homepage
 * preview rows.
 */
export function FeaturedProjectsSection({
  records,
}: Readonly<{ records: readonly CmsProjectRecord[] }>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section
      id="projects"
      ref={rootRef}
      className="bg-background px-6 py-10 sm:px-10 sm:py-14 lg:px-16"
    >
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
              Projects
            </h2>
            <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
              A selection of research-driven products the lab has built end to end.
            </p>
          </div>
          <Link
            href="/projects"
            className="reveal-card shrink-0 text-sm font-medium whitespace-nowrap text-foreground/60 opacity-0 transition-colors hover:text-brand-blue"
          >
            See more →
          </Link>
        </div>

        {records.length ? (
          <div className="reveal-card mt-14 flex h-[26rem] items-center justify-center opacity-0 sm:h-[28rem]">
            <CardSwap cardDistance={50} height={340} pauseOnHover verticalDistance={44} width={280}>
              {records.map((record) => (
                <Card key={record.slug}>
                  <FeaturedProjectCardContent record={record} />
                </Card>
              ))}
            </CardSwap>
          </div>
        ) : (
          <div className="reveal-card mt-10 rounded-2xl border border-[var(--line)] px-8 py-16 text-center opacity-0">
            <p className="text-foreground/60">
              No featured projects yet — check back once the lab spotlights one.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
