import {
  ADDRESS_PARTS,
  NAME_PARTS,
  isAnswered,
  isFieldVisible,
  isInputType,
  logicContext,
  resolvePath,
  validateFieldAnswer,
  visibleQuestions,
  type FormAnswers,
  type FormAnswerValue,
  type FormField,
  type FormPage,
  type PublicFormDocument,
} from "@repo/shared";

/**
 * The public form's pure logic on top of the shared contract: prefills,
 * the classic pages and the conversational steps along the current route,
 * and the progress that drives the progress bar and the scene.
 */

type Doc = Pick<PublicFormDocument, "fields" | "endings" | "settings">;

function coercePrefill(field: FormField, raw: string): FormAnswerValue | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const options = field.options ?? [];
  const optionId = (text: string) =>
    options.find((option) => option.id === text)?.id ??
    options.find((option) => option.label.toLocaleLowerCase() === text.toLocaleLowerCase())?.id;
  switch (field.type) {
    case "number":
    case "rating":
    case "opinion_scale":
    case "nps":
    case "slider": {
      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    }
    case "yes_no":
    case "consent":
      if (/^(1|true|yes|ya|y)$/i.test(value)) return true;
      if (field.type === "yes_no" && /^(0|false|no|tidak|n)$/i.test(value)) return false;
      return undefined;
    case "multiple_choice":
    case "dropdown":
      return optionId(value);
    case "picture_choice":
      if ((field.maxSelections ?? 1) > 1) {
        const ids = value.split(",").map((part) => optionId(part.trim()));
        return ids.filter((id): id is string => Boolean(id));
      }
      return optionId(value);
    case "checkboxes":
    case "multiselect":
    case "ranking": {
      const ids = value.split(",").map((part) => optionId(part.trim()));
      const kept = ids.filter((id): id is string => Boolean(id));
      return kept.length ? kept : undefined;
    }
    case "country":
      return /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : undefined;
    case "color":
      return /^#?[0-9a-f]{6}$/i.test(value)
        ? `#${value.replace("#", "").toLowerCase()}`
        : undefined;
    case "name":
      return { first: value.slice(0, 200) };
    case "matrix":
    case "address":
    case "file_upload":
    case "image_upload":
    case "signature":
      return undefined;
    default:
      return value.slice(0, 2000);
  }
}

/** Default values, then URL prefills (a hidden field reads its parameter or its id). */
export function initialAnswers(document: Doc, params?: URLSearchParams | null): FormAnswers {
  const answers: FormAnswers = {};
  for (const field of document.fields) {
    if (!isInputType(field.type)) continue;
    if (field.defaultValue !== undefined) {
      const coerced =
        typeof field.defaultValue === "string"
          ? coercePrefill(field, field.defaultValue)
          : field.defaultValue;
      if (coerced !== undefined) answers[field.id] = coerced;
    }
    if (!params) continue;
    const param = field.prefillParam ?? (field.type === "hidden" ? field.id : undefined);
    const raw = param ? params.get(param) : null;
    if (raw === null) continue;
    const coerced = field.type === "hidden" ? raw.trim().slice(0, 2000) : coercePrefill(field, raw);
    if (coerced !== undefined && coerced !== "") answers[field.id] = coerced;
  }
  return answers;
}

/** Keeps the answer shapes the fields understand (a stale draft may not). */
export function sanitizeDraft(document: Doc, draft: FormAnswers): FormAnswers {
  const known = new Map(document.fields.map((field) => [field.id, field]));
  const answers: FormAnswers = {};
  for (const [key, value] of Object.entries(draft)) {
    const fieldId = key.endsWith(":other") ? key.slice(0, -6) : key;
    const field = known.get(fieldId);
    if (!field || !isInputType(field.type) || field.type === "hidden") continue;
    if (key !== fieldId) {
      if (typeof value === "string") answers[key] = value;
      continue;
    }
    if (field.type === "name" || field.type === "address") {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const parts: readonly string[] = field.type === "name" ? NAME_PARTS : ADDRESS_PARTS;
      const kept: Record<string, string> = {};
      for (const part of parts) {
        const partValue = (value as Record<string, unknown>)[part];
        if (typeof partValue === "string") kept[part] = partValue;
      }
      answers[key] = kept;
      continue;
    }
    answers[key] = value;
  }
  return answers;
}

export function isFieldShown(document: Doc, field: FormField, answers: FormAnswers) {
  return isFieldVisible(field, logicContext(document, answers));
}

/** The pages on the respondent's current route, in order. */
export function routePages(document: Doc, answers: FormAnswers): FormPage[] {
  const path = resolvePath(document, answers);
  return path.route.map((index) => path.pages[index]);
}

export function forcedEnding(document: Doc, answers: FormAnswers) {
  return resolvePath(document, answers).forcedEndingId;
}

/** A question with a valid answer (what fills the progress and the scene). */
export function isDone(field: FormField, answers: FormAnswers) {
  return isAnswered(answers[field.id]) && !validateFieldAnswer(field, answers[field.id], answers);
}

export type FormProgress = {
  done: number;
  total: number;
  /** 0..1 of the visible route. */
  fraction: number;
  questions: FormField[];
};

export function formProgress(document: Doc, answers: FormAnswers): FormProgress {
  const questions = visibleQuestions(document, answers);
  const done = questions.filter((field) => isDone(field, answers)).length;
  return {
    done,
    total: questions.length,
    fraction: questions.length ? done / questions.length : 0,
    questions,
  };
}

/** Question numbers along the visible route (content blocks aren't numbered). */
export function questionNumbers(document: Doc, answers: FormAnswers) {
  const numbers = new Map<string, number>();
  visibleQuestions(document, answers).forEach((field, index) => numbers.set(field.id, index + 1));
  return numbers;
}

// ---------------------------------------------------------------------------
// Conversational steps
// ---------------------------------------------------------------------------

export type FormStep =
  | { kind: "question"; id: string; field: FormField; page: FormPage }
  | { kind: "statement"; id: string; field?: FormField; page: FormPage };

const STATEMENT_TYPES = new Set(["heading", "paragraph", "image", "video", "callout", "quote"]);

/**
 * One screen per question along the route. Statement blocks (heading,
 * paragraph, media, callout, quote) get a screen of their own, a page
 * break with a title opens its page with one, and dividers and spacers
 * have no meaning one question at a time.
 */
export function conversationalSteps(document: Doc, answers: FormAnswers): FormStep[] {
  const context = logicContext(document, answers);
  const steps: FormStep[] = [];
  for (const page of routePages(document, answers)) {
    if (page.opener && (page.opener.pageTitle || page.opener.pageDescription)) {
      steps.push({ kind: "statement", id: `page:${page.id}`, page });
    }
    for (const field of page.fields) {
      if (!isFieldVisible(field, context)) continue;
      if (isInputType(field.type)) {
        steps.push({ kind: "question", id: field.id, field, page });
      } else if (STATEMENT_TYPES.has(field.type)) {
        steps.push({ kind: "statement", id: field.id, field, page });
      }
    }
  }
  return steps;
}

/** The fields a classic page shows right now (visible, not hidden inputs). */
export function pageFields(document: Doc, page: FormPage, answers: FormAnswers) {
  const context = logicContext(document, answers);
  return page.fields.filter((field) => field.type !== "hidden" && isFieldVisible(field, context));
}
