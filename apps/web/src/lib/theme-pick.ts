import { PROJECT_THEME_IDS, type ProjectThemeId } from "@repo/shared";

/**
 * The palette a themed page wears: the one an editor picked, else a stable
 * pick from the slug, so records saved before the theme field existed still
 * get a considered theme of their own. Shared by project and article pages
 * (and the admin theme picker's "Automatic" preview), so the preview and the
 * public page always agree.
 *
 * Deliberately free of any CMS module: `project-cms` imports `article-cms`,
 * so neither can import the pick from the other without a cycle.
 */

/** FNV-1a (32-bit) over the slug's UTF-16 code units. */
export function hashSlug(slug: string) {
  let hash = 2166136261;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isThemeId(value: unknown): value is ProjectThemeId {
  return typeof value === "string" && (PROJECT_THEME_IDS as readonly string[]).includes(value);
}

/** The picked theme when it is a known id, else the slug's stable pick. */
export function themeIdFor(record: { slug: string; theme?: string }): ProjectThemeId {
  if (isThemeId(record.theme)) return record.theme;
  return PROJECT_THEME_IDS[hashSlug(record.slug) % PROJECT_THEME_IDS.length];
}
