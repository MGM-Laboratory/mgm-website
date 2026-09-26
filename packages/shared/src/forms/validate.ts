import {
  ADDRESS_PARTS,
  NAME_PARTS,
  OTHER_OPTION_ID,
  isAnswered,
  isFileAnswer,
  otherKey,
  type FormAnswers,
  type FormAnswerValue,
  type FormFileAnswer,
} from "./answers.js";
import type { FormErrorCode } from "./i18n.js";
import { visibleFields } from "./logic.js";
import {
  FORM_FILE_CATEGORY_TYPES,
  FORM_LIMITS,
  isInputType,
  type FormDocument,
  type FormField,
} from "./schema.js";

/**
 * Answer validation, run by the public page as the respondent types and by
 * the API on submit with the same rules. `validateSubmission` also drops
 * answers to questions the respondent never met (hidden by logic or on a
 * skipped page), so they can neither be required nor stored.
 */

export type FieldError = { code: FormErrorCode; min?: number | string; max?: number | string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

// The shared package targets plain ES2022 (no DOM or Node types), so links
// are checked by shape: an http(s) scheme, a dotted host, no whitespace.
const URL_PATTERN = /^https?:\/\/[^\s/?#@]+\.[^\s/?#@]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i;

function isValidUrl(value: string) {
  return URL_PATTERN.test(value);
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function maskCharMatches(token: string, char: string) {
  switch (token) {
    case "#":
      return char >= "0" && char <= "9";
    case "A":
      return char.toLowerCase() !== char.toUpperCase();
    case "*":
      return (char >= "0" && char <= "9") || char.toLowerCase() !== char.toUpperCase();
    case "?":
      return true;
    default:
      return token === char;
  }
}

/** Splits one mask alternative into tokens, `\\x` becoming the literal `x`. */
function maskTokens(mask: string): { token: string; literal: boolean }[] {
  const tokens: { token: string; literal: boolean }[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === "\\" && index + 1 < mask.length) {
      tokens.push({ token: mask[index + 1], literal: true });
      index += 1;
    } else {
      tokens.push({ token: mask[index], literal: false });
    }
  }
  return tokens;
}

/**
 * Whether a value fits a format mask (`field.pattern`): character by
 * character, linear in the value's length, no regular expressions.
 * Letters in the value compare case-insensitively with literal letters.
 */
export function matchesFormatMask(value: string, mask: string): boolean {
  const alternatives = mask
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!alternatives.length) return true;
  const chars = [...value];
  return alternatives.some((alternative) => {
    const tokens = maskTokens(alternative);
    if (tokens.length !== chars.length) return false;
    return tokens.every(({ token, literal }, index) =>
      literal
        ? token.toLowerCase() === chars[index].toLowerCase()
        : maskCharMatches(token, chars[index]) ||
          (!"#A*?".includes(token) && token.toLowerCase() === chars[index].toLowerCase()),
    );
  });
}

/** Whether a file's type or extension falls in one of the field's accepted categories. */
export function fileAccepted(
  field: Pick<FormField, "type" | "accept">,
  file: { name: string; type: string },
) {
  const categories =
    field.type === "image_upload" || field.type === "signature"
      ? (["image"] as const)
      : field.accept?.length
        ? field.accept
        : null;
  if (!categories) return true;
  const extension = fileExtension(file.name);
  return categories.some((category) => {
    const accepted = FORM_FILE_CATEGORY_TYPES[category];
    return accepted.mimes.includes(file.type) || accepted.extensions.includes(extension);
  });
}

/** Bytes one file of this field may have. */
export function fieldMaxFileBytes(field: Pick<FormField, "maxFileMb">) {
  const megabytes = Math.min(field.maxFileMb ?? 10, FORM_LIMITS.fileMbMax);
  return Math.round(megabytes * 1024 * 1024);
}

export function fieldMaxFiles(field: Pick<FormField, "type" | "maxFiles">) {
  if (field.type === "signature") return 1;
  return Math.min(field.maxFiles ?? 1, FORM_LIMITS.filesPerFieldMax);
}

function choiceCount(field: FormField, value: FormAnswerValue): FieldError | null {
  const ids = Array.isArray(value) ? value.map(String) : [String(value)];
  const known = new Set((field.options ?? []).map((option) => option.id));
  if (field.allowOther) known.add(OTHER_OPTION_ID);
  if (ids.some((id) => !known.has(id))) return { code: "unknownOption" };
  if (new Set(ids).size !== ids.length) return { code: "invalid" };
  const multi = Array.isArray(value);
  if (multi && field.type !== "ranking") {
    if (field.minSelections && ids.length < field.minSelections) {
      return { code: "minSelections", min: field.minSelections };
    }
    if (field.maxSelections && ids.length > field.maxSelections) {
      return { code: "maxSelections", max: field.maxSelections };
    }
  }
  return null;
}

function numberBounds(field: FormField): { min?: number; max?: number } {
  switch (field.type) {
    case "rating":
      return { min: 1, max: field.max ?? 5 };
    case "opinion_scale":
      return { min: field.min ?? 1, max: field.max ?? 10 };
    case "nps":
      return { min: 0, max: 10 };
    case "slider":
      return { min: field.min ?? 0, max: field.max ?? 100 };
    default:
      return { min: field.min, max: field.max };
  }
}

/** Validates one answer against its field; `null` when it's fine. */
export function validateFieldAnswer(
  field: FormField,
  value: FormAnswerValue | undefined,
  answers: FormAnswers = {},
): FieldError | null {
  if (!isInputType(field.type) || field.type === "hidden") return null;
  if (!isAnswered(value)) {
    if (field.type === "consent" && field.required) return { code: "consent" };
    return field.required ? { code: "required" } : null;
  }
  const answer = value as FormAnswerValue;

  switch (field.type) {
    case "short_text":
    case "long_text": {
      if (typeof answer !== "string") return { code: "invalid" };
      const length = answer.trim().length;
      const maxLength = Math.min(
        field.maxLength ?? FORM_LIMITS.textAnswerMax,
        FORM_LIMITS.textAnswerMax,
      );
      if (field.minLength && length < field.minLength)
        return { code: "minLength", min: field.minLength };
      if (length > maxLength) return { code: "maxLength", max: maxLength };
      if (
        field.pattern &&
        field.type === "short_text" &&
        !matchesFormatMask(answer.trim(), field.pattern)
      ) {
        return { code: "pattern" };
      }
      return null;
    }
    case "email":
      return typeof answer === "string" && EMAIL_PATTERN.test(answer.trim()) && answer.length <= 254
        ? null
        : { code: "email" };
    case "url":
      return typeof answer === "string" && isValidUrl(answer.trim()) && answer.length <= 2000
        ? null
        : { code: "url" };
    case "phone": {
      if (typeof answer !== "string" || answer.length > 40) return { code: "phone" };
      const digits = answer.replace(/\D/g, "");
      return digits.length >= 6 && digits.length <= 15 && /^[+\d\s().-]+$/.test(answer)
        ? null
        : { code: "phone" };
    }
    case "number":
    case "rating":
    case "opinion_scale":
    case "nps":
    case "slider": {
      if (typeof answer !== "number" || !Number.isFinite(answer)) return { code: "number" };
      const { min, max } = numberBounds(field);
      if (min !== undefined && answer < min) return { code: "min", min };
      if (max !== undefined && answer > max) return { code: "max", max };
      if (field.type !== "number" && field.type !== "slider" && !Number.isInteger(answer)) {
        return { code: "invalid" };
      }
      return null;
    }
    case "multiple_choice":
    case "dropdown":
      if (typeof answer !== "string") return { code: "unknownOption" };
      return choiceCount(field, answer);
    case "picture_choice":
      if ((field.maxSelections ?? 1) > 1) {
        if (!Array.isArray(answer)) return { code: "invalid" };
      } else if (typeof answer !== "string") {
        return { code: "unknownOption" };
      }
      return choiceCount(field, answer);
    case "checkboxes":
    case "multiselect":
    case "ranking":
      if (!Array.isArray(answer) || !answer.every((item) => typeof item === "string")) {
        return { code: "invalid" };
      }
      return choiceCount(field, answer);
    case "yes_no":
      return typeof answer === "boolean" ? null : { code: "invalid" };
    case "consent":
      return answer === true ? null : { code: "consent" };
    case "matrix": {
      if (typeof answer !== "object" || Array.isArray(answer)) return { code: "invalid" };
      const rows = new Set((field.rowsList ?? []).map((row) => row.id));
      const columns = new Set((field.columnsList ?? []).map((column) => column.id));
      const cells = answer as Record<string, string | string[]>;
      for (const [rowId, cell] of Object.entries(cells)) {
        if (!rows.has(rowId)) return { code: "invalid" };
        const picked = Array.isArray(cell) ? cell : [cell];
        if (!field.matrixMultiple && Array.isArray(cell)) return { code: "invalid" };
        if (picked.some((id) => !columns.has(String(id)))) return { code: "invalid" };
      }
      if (field.required && [...rows].some((rowId) => !isAnswered(cells[rowId]))) {
        return { code: "required" };
      }
      return null;
    }
    case "date": {
      if (typeof answer !== "string" || !isValidDate(answer)) return { code: "date" };
      if (field.minDate && isValidDate(field.minDate) && answer < field.minDate) {
        return { code: "minDate", min: field.minDate };
      }
      if (field.maxDate && isValidDate(field.maxDate) && answer > field.maxDate) {
        return { code: "maxDate", max: field.maxDate };
      }
      return null;
    }
    case "time":
      return typeof answer === "string" && TIME_PATTERN.test(answer) ? null : { code: "invalid" };
    case "datetime": {
      if (typeof answer !== "string" || !DATETIME_PATTERN.test(answer)) return { code: "date" };
      const day = answer.slice(0, 10);
      if (!isValidDate(day)) return { code: "date" };
      if (field.minDate && isValidDate(field.minDate) && day < field.minDate) {
        return { code: "minDate", min: field.minDate };
      }
      if (field.maxDate && isValidDate(field.maxDate) && day > field.maxDate) {
        return { code: "maxDate", max: field.maxDate };
      }
      return null;
    }
    case "country":
      return typeof answer === "string" && COUNTRY_PATTERN.test(answer)
        ? null
        : { code: "invalid" };
    case "color":
      return typeof answer === "string" && COLOR_PATTERN.test(answer) ? null : { code: "color" };
    case "name": {
      if (typeof answer !== "object" || Array.isArray(answer)) return { code: "invalid" };
      const parts = answer as Record<string, unknown>;
      if (Object.keys(parts).some((key) => !(NAME_PARTS as readonly string[]).includes(key))) {
        return { code: "invalid" };
      }
      if (Object.values(parts).some((part) => typeof part !== "string" || part.length > 200)) {
        return { code: "invalid" };
      }
      if (field.required && !isAnswered(parts.first)) return { code: "required" };
      return null;
    }
    case "address": {
      if (typeof answer !== "object" || Array.isArray(answer)) return { code: "invalid" };
      const parts = answer as Record<string, unknown>;
      if (Object.keys(parts).some((key) => !(ADDRESS_PARTS as readonly string[]).includes(key))) {
        return { code: "invalid" };
      }
      if (Object.values(parts).some((part) => typeof part !== "string" || part.length > 300)) {
        return { code: "invalid" };
      }
      if (field.required && !isAnswered(parts.line1)) return { code: "required" };
      return null;
    }
    case "file_upload":
    case "image_upload":
    case "signature": {
      if (!isFileAnswer(answer)) return { code: "files" };
      const max = fieldMaxFiles(field);
      if (answer.length > max) return { code: "tooManyFiles", max };
      const limit = fieldMaxFileBytes(field);
      const bad = answer.some(
        (file: FormFileAnswer) =>
          typeof file.size !== "number" || file.size > limit || !fileAccepted(field, file),
      );
      return bad ? { code: "files" } : null;
    }
    default:
      return null;
  }
}

export type SubmissionResult = {
  ok: boolean;
  errors: Record<string, FieldError>;
  /** Only the answers the respondent was meant to give (plus hidden prefills). */
  answers: FormAnswers;
};

function cleanText(value: FormAnswerValue): FormAnswerValue {
  return typeof value === "string" ? value.trim() : value;
}

/**
 * Validates a whole submission: visible questions are checked (required
 * ones included), everything the respondent didn't meet is dropped.
 */
export function validateSubmission(
  document: Pick<FormDocument, "fields" | "endings">,
  answers: FormAnswers,
): SubmissionResult {
  const shown = visibleFields(document, answers);
  const errors: Record<string, FieldError> = {};
  const kept: FormAnswers = {};

  for (const field of shown) {
    if (!isInputType(field.type)) continue;
    const value = answers[field.id];
    const error = validateFieldAnswer(field, value, answers);
    if (error) {
      errors[field.id] = error;
      continue;
    }
    if (isAnswered(value)) kept[field.id] = cleanText(value as FormAnswerValue);
    const other = answers[otherKey(field.id)];
    const pickedOther = Array.isArray(value)
      ? value.includes(OTHER_OPTION_ID as never)
      : value === OTHER_OPTION_ID;
    if (field.allowOther && pickedOther && typeof other === "string" && other.trim()) {
      kept[otherKey(field.id)] = other.trim().slice(0, 2000);
    }
  }
  // Hidden fields carry URL prefills (campaign, referral codes), never shown.
  for (const field of document.fields) {
    if (field.type !== "hidden") continue;
    const value = answers[field.id];
    if (typeof value === "string" && value.trim()) kept[field.id] = value.trim().slice(0, 2000);
  }
  return { ok: Object.keys(errors).length === 0, errors, answers: kept };
}
