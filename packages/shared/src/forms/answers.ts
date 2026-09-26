/**
 * Answer shapes, keyed by field id in a response's `answers` object:
 *
 * - text-like fields (short/long text, email, phone, url, date, time,
 *   datetime, country, color, hidden): `string` (dates `YYYY-MM-DD`, times
 *   `HH:mm`, datetimes `YYYY-MM-DDTHH:mm` in the respondent's local time,
 *   countries ISO 3166 alpha-2, colors `#rrggbb`)
 * - number, rating, opinion scale, NPS, slider: `number`
 * - yes/no and consent: `boolean`
 * - single choice (multiple choice, dropdown, single picture choice): the
 *   chosen option id (`string`), or `OTHER_OPTION_ID`
 * - multi choice (checkboxes, multiselect, multi picture choice) and
 *   ranking: option ids (`string[]`, ranking in the respondent's order)
 * - matrix: `{ [rowId]: columnId }`, or `{ [rowId]: columnId[] }` when the
 *   matrix allows several columns per row
 * - name: `{ first, last }`; address: `{ line1, line2, city, region, postal, country }`
 * - file upload, image upload, signature: `FormFileAnswer[]`
 *
 * The free text typed next to an "Other" option lives beside the answer, at
 * `otherKey(fieldId)`, so it gets its own column in tables and exports.
 */

export type FormFileAnswer = {
  /** The storage key minted by the public upload endpoint. */
  key: string;
  name: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
};

export type FormAnswerValue =
  string | number | boolean | string[] | FormFileAnswer[] | Record<string, string | string[]>;

export type FormAnswers = Record<string, FormAnswerValue>;

export const OTHER_OPTION_ID = "__other__";

export function otherKey(fieldId: string) {
  return `${fieldId}:other`;
}

export const ADDRESS_PARTS = ["line1", "line2", "city", "region", "postal", "country"] as const;
export type AddressPart = (typeof ADDRESS_PARTS)[number];

export const NAME_PARTS = ["first", "last"] as const;

export function isFileAnswer(value: unknown): value is FormFileAnswer[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as FormFileAnswer).key === "string" &&
        typeof (item as FormFileAnswer).name === "string",
    )
  );
}

/** True when the value carries an actual answer (not empty, blank or all-empty parts). */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((part) => isAnswered(part));
  }
  return false;
}
