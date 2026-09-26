import { OTHER_OPTION_ID, isAnswered, type FormAnswers, type FormAnswerValue } from "./answers.js";
import {
  SCORE_SUBJECT,
  isInputType,
  isNumericType,
  type FormCondition,
  type FormConditionGroup,
  type FormDocument,
  type FormEnding,
  type FormField,
  type FormFieldType,
  type FormOperator,
} from "./schema.js";

/**
 * The form's conditional logic, shared by the public page (which shows and
 * skips questions as the respondent answers), the admin preview, and the
 * API (which re-runs it on submit, so an answer to a question the
 * respondent never saw is dropped and a required question hidden by logic
 * never blocks a submission).
 */

type LogicDocument = Pick<FormDocument, "fields" | "endings"> & {
  settings?: { scoring?: { enabled?: boolean } };
};

export type LogicContext = {
  fields: Map<string, FormField>;
  answers: FormAnswers;
  score: number;
};

export function fieldMap(fields: readonly FormField[]) {
  return new Map(fields.map((field) => [field.id, field]));
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

/** The answer as comparable text: option ids stay ids, parts are joined. */
function asText(value: FormAnswerValue | null | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : ((item as { name?: string }).name ?? "")))
      .join(", ");
  }
  return Object.values(value)
    .map((part) => (Array.isArray(part) ? part.join(", ") : part))
    .filter(Boolean)
    .join(" ");
}

function compareDates(answer: string, target: string): number | null {
  const left = Date.parse(answer);
  const right = Date.parse(target);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return left - right;
}

export function evaluateCondition(condition: FormCondition, context: LogicContext): boolean {
  const subjectIsScore = condition.subject === SCORE_SUBJECT;
  const value: FormAnswerValue | undefined = subjectIsScore
    ? context.score
    : context.answers[condition.subject];
  const target = condition.value;
  const answered = isAnswered(value);

  switch (condition.operator) {
    case "is_answered":
      return answered;
    case "is_not_answered":
      return !answered;
    default:
      break;
  }
  if (!answered) {
    // An unanswered question matches only the negative comparisons.
    return (
      condition.operator === "not_equals" ||
      condition.operator === "not_contains" ||
      condition.operator === "includes_none"
    );
  }

  const text = asText(value).toLocaleLowerCase();
  const targetText = (Array.isArray(target) ? target.join(", ") : String(target ?? ""))
    .toLocaleLowerCase()
    .trim();
  const list = asList(value);
  const targetList = asList(target);

  switch (condition.operator) {
    case "equals": {
      if (typeof value === "boolean") return String(value) === targetText;
      const left = asNumber(value);
      const right = asNumber(target);
      if (left !== null && right !== null && !Array.isArray(value)) return left === right;
      if (Array.isArray(value)) {
        return list.length === targetList.length && targetList.every((item) => list.includes(item));
      }
      return text.trim() === targetText;
    }
    case "not_equals":
      return !evaluateCondition({ ...condition, operator: "equals" }, context);
    case "contains":
      return Array.isArray(value)
        ? targetList.some((item) => list.includes(item))
        : text.includes(targetText);
    case "not_contains":
      return !evaluateCondition({ ...condition, operator: "contains" }, context);
    case "starts_with":
      return text.startsWith(targetText);
    case "ends_with":
      return text.endsWith(targetText);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = asNumber(value);
      const right = asNumber(target);
      if (left === null || right === null) return false;
      if (condition.operator === "gt") return left > right;
      if (condition.operator === "gte") return left >= right;
      if (condition.operator === "lt") return left < right;
      return left <= right;
    }
    case "includes_any":
      return targetList.some((item) => list.includes(item));
    case "includes_all":
      return targetList.every((item) => list.includes(item));
    case "includes_none":
      return !targetList.some((item) => list.includes(item));
    case "before":
    case "after": {
      const difference = compareDates(asText(value), String(target ?? ""));
      if (difference === null) return false;
      return condition.operator === "before" ? difference < 0 : difference > 0;
    }
    default:
      return false;
  }
}

/** An empty rule list always matches. */
export function evaluateGroup(group: FormConditionGroup | undefined, context: LogicContext) {
  if (!group || !group.rules.length) return true;
  return group.match === "any"
    ? group.rules.some((rule) => evaluateCondition(rule, context))
    : group.rules.every((rule) => evaluateCondition(rule, context));
}

/** Operators the editor offers for a subject of this type (`$score` counts as a number). */
export function operatorsFor(type: FormFieldType | "score"): FormOperator[] {
  const presence: FormOperator[] = ["is_answered", "is_not_answered"];
  if (type === "score" || isNumericType(type as FormFieldType)) {
    return ["equals", "not_equals", "gt", "gte", "lt", "lte", ...presence];
  }
  switch (type) {
    case "multiple_choice":
    case "dropdown":
      return ["equals", "not_equals", "includes_any", "includes_none", ...presence];
    case "checkboxes":
    case "multiselect":
    case "picture_choice":
    case "ranking":
      return ["includes_any", "includes_all", "includes_none", ...presence];
    case "yes_no":
    case "consent":
      return ["equals", ...presence];
    case "date":
    case "datetime":
      return ["equals", "before", "after", ...presence];
    case "file_upload":
    case "image_upload":
    case "signature":
      return presence;
    default:
      return [
        "equals",
        "not_equals",
        "contains",
        "not_contains",
        "starts_with",
        "ends_with",
        ...presence,
      ];
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export type FormPage = {
  /** `start` for the first page, else the id of the page_break that opens it. */
  id: string;
  index: number;
  title?: string;
  /** The page_break that opens this page (none for the first page). */
  opener?: FormField;
  /** The page_break that closes this page; its jumps run on leaving it. */
  closer?: FormField;
  fields: FormField[];
};

/** Splits the fields into pages at every page_break. */
export function buildPages(fields: readonly FormField[]): FormPage[] {
  const pages: FormPage[] = [{ id: "start", index: 0, fields: [] }];
  for (const field of fields) {
    if (field.type === "page_break") {
      const current = pages[pages.length - 1];
      current.closer = field;
      pages.push({
        id: field.id,
        index: pages.length,
        title: field.pageTitle,
        opener: field,
        fields: [],
      });
      continue;
    }
    pages[pages.length - 1].fields.push(field);
  }
  // A trailing break with nothing after it doesn't make an empty last page.
  const last = pages[pages.length - 1];
  if (pages.length > 1 && !last.fields.length) {
    pages.pop();
    pages[pages.length - 1].closer = last.opener;
  }
  return pages;
}

/** Points earned so far: the sum of the chosen options' points. */
export function computeScore(document: LogicDocument, answers: FormAnswers): number {
  let score = 0;
  for (const field of document.fields) {
    if (!field.options?.length) continue;
    const chosen = asList(answers[field.id]);
    for (const option of field.options) {
      if (option.points && chosen.includes(option.id)) score += option.points;
    }
  }
  return score;
}

/** The largest score this form can give (for "score / max" when none is set). */
export function maxScore(document: LogicDocument): number {
  let total = 0;
  for (const field of document.fields) {
    if (!field.options?.length) continue;
    const positive = field.options
      .map((option) => option.points ?? 0)
      .filter((points) => points > 0);
    if (!positive.length) continue;
    const multi =
      field.type === "checkboxes" ||
      field.type === "multiselect" ||
      (field.type === "picture_choice" && (field.maxSelections ?? 1) > 1);
    total += multi ? positive.reduce((sum, points) => sum + points, 0) : Math.max(...positive);
  }
  return total;
}

export function logicContext(document: LogicDocument, answers: FormAnswers): LogicContext {
  return { fields: fieldMap(document.fields), answers, score: computeScore(document, answers) };
}

export type FormPath = {
  pages: FormPage[];
  /** Indexes into `pages` of the pages the respondent goes through, in order. */
  route: number[];
  /** Set when a jump sends the respondent straight to one ending. */
  forcedEndingId?: string;
};

/**
 * Walks the pages from the first, applying each closing break's jumps with
 * the current answers. Jumps only go forward, so a form can never loop.
 */
export function resolvePath(document: LogicDocument, answers: FormAnswers): FormPath {
  const pages = buildPages(document.fields);
  const context = logicContext(document, answers);
  const route: number[] = [];
  let index = 0;
  let forcedEndingId: string | undefined;
  while (index < pages.length) {
    route.push(index);
    const jumps = pages.at(index)?.closer?.jumps ?? [];
    const jump = jumps.find((candidate) => evaluateGroup(candidate.when, context));
    if (!jump) {
      index += 1;
      continue;
    }
    if (jump.to === "end") break;
    if (jump.to.startsWith("ending:")) {
      forcedEndingId = jump.to.slice("ending:".length);
      break;
    }
    const target = pages.findIndex((page) => page.id === jump.to);
    index = target > index ? target : index + 1;
  }
  return { pages, route, forcedEndingId };
}

/** Whether one field shows, given the answers (its own rules only, not the page route). */
export function isFieldVisible(field: FormField, context: LogicContext) {
  if (field.type === "hidden") return false;
  return evaluateGroup(field.visibleIf, context);
}

/**
 * The fields the respondent actually meets: on a routed page and passing
 * their own visibility rules. Hidden (prefill) fields are not included.
 */
export function visibleFields(document: LogicDocument, answers: FormAnswers): FormField[] {
  const path = resolvePath(document, answers);
  const context = logicContext(document, answers);
  return path.route.flatMap(
    (index) => path.pages.at(index)?.fields.filter((field) => isFieldVisible(field, context)) ?? [],
  );
}

/** Visible questions only (content blocks dropped). */
export function visibleQuestions(document: LogicDocument, answers: FormAnswers): FormField[] {
  return visibleFields(document, answers).filter((field) => isInputType(field.type));
}

/**
 * The ending to show: a jump's forced ending, else the first ending whose
 * rules match, else the first ending without rules, else the first one.
 */
export function pickEnding(
  document: LogicDocument,
  answers: FormAnswers,
  forcedEndingId?: string,
): FormEnding {
  const endings = document.endings;
  if (forcedEndingId) {
    const forced = endings.find((ending) => ending.id === forcedEndingId);
    if (forced) return forced;
  }
  const context = logicContext(document, answers);
  const matching = endings.find(
    (ending) => ending.when?.rules.length && evaluateGroup(ending.when, context),
  );
  return matching ?? endings.find((ending) => !ending.when?.rules.length) ?? endings[0];
}

/** Minutes a typical respondent needs, rounded up, at least 1. */
export function estimateMinutes(fields: readonly FormField[]): number {
  let seconds = 0;
  for (const field of fields) {
    switch (field.type) {
      case "long_text":
        seconds += 45;
        break;
      case "matrix":
        seconds += 8 * Math.max(1, field.rowsList?.length ?? 1);
        break;
      case "ranking":
        seconds += 25;
        break;
      case "file_upload":
      case "image_upload":
      case "signature":
      case "address":
        seconds += 30;
        break;
      case "paragraph":
      case "callout":
      case "quote":
      case "video":
        seconds += 10;
        break;
      case "hidden":
      case "divider":
      case "spacer":
      case "page_break":
      case "heading":
      case "image":
        break;
      default:
        seconds += 10;
    }
  }
  return Math.max(1, Math.ceil(seconds / 60));
}

/** Whether an answer names the "Other" option. */
export function choseOther(value: unknown) {
  return asList(value).includes(OTHER_OPTION_ID);
}
