/**
 * The one place an admin-written regular expression is compiled: the Clean
 * data panel's find & replace in regex mode. It only runs in the admin's own
 * browser, over their own data, and it is bounded: patterns are capped at
 * 200 characters and a cell is only tested up to its first 10,000
 * characters, so a pathological pattern stalls one preview at worst.
 */

export const USER_PATTERN_MAX = 200;
export const USER_PATTERN_CELL_MAX = 10_000;

export type UserPattern = { regex: RegExp };

export function compileUserPattern(
  source: string,
  options: { caseSensitive: boolean; wholeCell: boolean },
): UserPattern | string {
  if (source.length > USER_PATTERN_MAX) {
    return `Keep the pattern under ${USER_PATTERN_MAX} characters.`;
  }
  try {
    const body = options.wholeCell ? `^(?:${source})$` : source;
    return { regex: new RegExp(body, options.caseSensitive ? "gu" : "giu") };
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "That pattern is not a valid regular expression.";
  }
}

export function replaceWithUserPattern(pattern: UserPattern, text: string, replacement: string) {
  if (text.length > USER_PATTERN_CELL_MAX) {
    const head = text.slice(0, USER_PATTERN_CELL_MAX);
    pattern.regex.lastIndex = 0;
    return head.replace(pattern.regex, replacement) + text.slice(USER_PATTERN_CELL_MAX);
  }
  pattern.regex.lastIndex = 0;
  try {
    return text.replace(pattern.regex, replacement);
  } catch {
    return text;
  }
}
