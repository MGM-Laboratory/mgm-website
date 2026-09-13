import Link from "next/link";

import type { PublicationAuthor } from "@/lib/publication-cms";

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

/**
 * Journal-style author block: each author's name carries a superscript for
 * their affiliation, the affiliations are listed as numbered footnotes
 * underneath, and lab members show their portrait and link to their profile.
 */
export function PublicationAuthors({
  authors,
  memberPhotos,
}: {
  authors: readonly PublicationAuthor[];
  memberPhotos?: ReadonlyMap<string, string>;
}) {
  const affiliations: string[] = [];
  const affiliationIndex = (affiliation?: string) => {
    if (!affiliation) return undefined;
    const existing = affiliations.indexOf(affiliation);
    if (existing >= 0) return existing + 1;
    affiliations.push(affiliation);
    return affiliations.length;
  };

  return (
    <div>
      <ul className="flex flex-wrap items-center gap-x-7 gap-y-5">
        {authors.map((author) => {
          const number = affiliationIndex(author.affiliation);
          const photoKey = author.memberSlug ? memberPhotos?.get(author.memberSlug) : undefined;
          const name = (
            <>
              {author.name}
              {number ? (
                <sup className="ml-0.5 font-mono text-[0.65em] text-brand-blue">{number}</sup>
              ) : null}
            </>
          );
          return (
            <li className="flex items-center gap-2.5" key={author.id}>
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--ink-2)] dark:bg-white/10 dark:text-white/70">
                {photoKey ? (
                  // Portraits resolve through a short-lived signed storage URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="size-full object-cover"
                    src={`/api/member-cms/media/${photoKey}`}
                  />
                ) : (
                  initialsOf(author.name)
                )}
              </span>
              {author.memberSlug ? (
                <Link
                  className="text-[15px] font-medium text-[#313131] underline decoration-transparent underline-offset-4 transition hover:text-brand-blue hover:decoration-brand-blue/50 dark:text-[#e8e8e4]"
                  href={`/member/${author.memberSlug}`}
                >
                  {name}
                </Link>
              ) : (
                <span className="text-[15px] font-medium text-[#313131] dark:text-[#e8e8e4]">
                  {name}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {affiliations.length ? (
        <ol className="mt-5 space-y-0.5 border-l-2 border-[var(--line-strong)] pl-4">
          {affiliations.map((affiliation, index) => (
            <li className="text-[13px] leading-6 text-[var(--ink-3)]" key={affiliation}>
              <span className="mr-1.5 font-mono text-[11px] text-brand-blue">{index + 1}</span>
              {affiliation}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
