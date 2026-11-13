/**
 * `member-<slug>-<uuid>.<ext>`, the shape that the portrait upload of the members controller writes. The slug part is
 * what the editor typed, with every character other than letters, digits, underscores and hyphens replaced by a hyphen when the key is made. It may hold repeated or edge hyphens, and an older slug may hold capitals or underscores.
 */
export const MEMBER_MEDIA_KEY_PATTERN =
  /^member-[A-Za-z0-9_-]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;
