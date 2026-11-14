import type { CmsMemberProfile } from "@/lib/member-cms";

/**
 * The text of a CMS member profile that the directory search reads. It holds the
 * words a visitor may look for (bio, skills, roles, companies, schools,
 * achievements, certificate titles, languages and projects). It leaves out links
 * and credential ids, which are not meant to be searched.
 */
export function memberSearchText(profile: CmsMemberProfile | undefined): string {
  if (!profile) return "";
  return [
    profile.bio,
    ...(profile.skills ?? []),
    ...(profile.experience ?? []).flatMap((item) => [
      item.title,
      item.company,
      item.location,
      item.description,
    ]),
    ...(profile.education ?? []).flatMap((item) => [item.institution, item.degree, item.detail]),
    ...(profile.achievements ?? []).flatMap((item) => [item.title, item.issuer, item.description]),
    ...(profile.certificates ?? []).flatMap((item) => [item.title, item.issuer]),
    ...(profile.languages ?? []).map((item) => item.name),
    ...(profile.projects ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}
