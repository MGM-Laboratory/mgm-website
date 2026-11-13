/**
 * `member-<slug>-<uuid>.<ext>`, the shape that the portrait upload of the members controller writes. The slug part is
 * whatever the editor typed, mapped to lowercase letters, digits and hyphens, so it may hold repeated or edge hyphens.
 */
export const MEMBER_MEDIA_KEY_PATTERN =
  /^member-[a-z0-9-]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;
