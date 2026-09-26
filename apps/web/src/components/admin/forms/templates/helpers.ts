import type { FormConditionGroup, FormOption } from "@repo/shared";

/**
 * Shorthands for writing templates: options with readable ids
 * (`<prefix>_<key>`) and one-rule condition groups.
 */

export function choices(prefix: string, entries: [key: string, label: string][]): FormOption[] {
  return entries.map(([key, label]) => ({ id: `${prefix}_${key}`, label }));
}

export function scored(
  prefix: string,
  entries: [key: string, label: string, points: number][],
): FormOption[] {
  return entries.map(([key, label, points]) => ({ id: `${prefix}_${key}`, label, points }));
}

export function when(
  subject: string,
  operator: FormConditionGroup["rules"][number]["operator"],
  value?: FormConditionGroup["rules"][number]["value"],
): FormConditionGroup {
  return {
    match: "all",
    rules: [{ subject, operator, ...(value === undefined ? {} : { value }) }],
  };
}
