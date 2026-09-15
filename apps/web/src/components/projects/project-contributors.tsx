import Link from "next/link";

import { contributorKind, projectMediaUrl, type ProjectContributor } from "@/lib/project-cms";

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

/**
 * Team roster: each contributor's avatar and name link to their lab profile
 * (residence) or their own site (non-residence, when supplied); the role
 * they played on this project renders underneath.
 */
export function ProjectContributors({
  contributors,
  memberPhotos,
}: {
  contributors: readonly ProjectContributor[];
  memberPhotos?: ReadonlyMap<string, string>;
}) {
  return (
    <ul className="flex flex-wrap items-start gap-x-7 gap-y-5">
      {contributors.map((contributor) => {
        const kind = contributorKind(contributor);
        const memberPhotoKey =
          kind === "residence" && contributor.memberSlug
            ? memberPhotos?.get(contributor.memberSlug)
            : undefined;
        const photoSrc =
          kind === "residence"
            ? memberPhotoKey && `/api/member-cms/media/${memberPhotoKey}`
            : projectMediaUrl(contributor.photoKey);
        const position = contributor.photoPosition;
        const nameLink =
          kind === "residence" ? `/member/${contributor.memberSlug}` : contributor.url;

        const avatar = (
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)] text-[12px] font-semibold text-[var(--ink-2)] dark:bg-white/10 dark:text-white/70">
            {photoSrc ? (
              // Portraits resolve through a short-lived signed storage URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="size-full object-cover"
                src={photoSrc}
                style={
                  position
                    ? {
                        objectPosition: `${position.x}% ${position.y}%`,
                        transform: `scale(${position.zoom})`,
                      }
                    : undefined
                }
              />
            ) : (
              initialsOf(contributor.name)
            )}
          </span>
        );

        const meta = [contributor.role, contributor.affiliation].filter(Boolean).join(" · ");

        return (
          <li className="flex items-center gap-3" key={contributor.id}>
            {nameLink ? (
              <Link
                className="transition hover:opacity-85"
                href={nameLink}
                rel={kind === "non-residence" ? "noreferrer" : undefined}
                target={kind === "non-residence" ? "_blank" : undefined}
              >
                {avatar}
              </Link>
            ) : (
              avatar
            )}
            <span className="min-w-0">
              {nameLink ? (
                <Link
                  className="block text-[15px] font-medium text-[#313131] underline decoration-transparent underline-offset-4 transition hover:text-brand-blue hover:decoration-brand-blue/50 dark:text-[#e8e8e4]"
                  href={nameLink}
                  rel={kind === "non-residence" ? "noreferrer" : undefined}
                  target={kind === "non-residence" ? "_blank" : undefined}
                >
                  {contributor.name}
                </Link>
              ) : (
                <span className="block text-[15px] font-medium text-[#313131] dark:text-[#e8e8e4]">
                  {contributor.name}
                </span>
              )}
              {meta ? (
                <span className="block text-[13px] leading-5 text-[var(--ink-3)]">{meta}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
