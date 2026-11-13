/**
 * The origins of `CORS_ORIGIN`. The setting is a comma separated list, and a
 * space after a comma or an empty entry must not become an origin that no
 * browser sends, which would refuse the real origin without a word.
 */
export function corsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
