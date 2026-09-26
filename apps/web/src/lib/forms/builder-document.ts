/**
 * Document helpers for the form builder: the blank form, the problems list
 * (schema issues plus the cross-references the schema cannot check), and
 * small conversions the editors share.
 */

import {
  SCORE_SUBJECT,
  formDocumentSchema,
  isChoiceType,
  isInputType,
  type FormConditionGroup,
  type FormDocument,
  type FormDocumentInput,
  type FormField,
} from "@repo/shared";

import { FIELD_TYPE_INFO } from "./builder-fields";

/** A new, empty form: one welcome screen, one default ending. */
export function blankDocument(title = "Untitled form"): FormDocument {
  return formDocumentSchema.parse({
    title,
    welcome: {
      enabled: true,
      title,
      buttonLabel: "Start",
      showDuration: true,
      showQuestionCount: true,
    },
    endings: [
      {
        id: "default",
        title: "Thank you",
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Your answers are safely in. Thank you, truly, for the time and care you put into them: every reply is read, and it shapes what we do next.",
                },
              ],
            },
          ],
        },
        showScore: false,
        allowAnother: false,
        showShare: true,
      },
    ],
  } satisfies FormDocumentInput);
}

export type Problem = {
  /** Stable key for React lists. */
  key: string;
  message: string;
  /** Where it points: a field id, `welcome`, `ending:<id>`, `settings`, `design`, `form`. */
  target: string;
  /** The schema path (`fields.3.options`) when the problem came from zod. */
  path?: string;
  severity: "error" | "warning";
};

function fieldName(field: FormField, index: number) {
  const label = field.label.trim() || field.pageTitle?.trim() || FIELD_TYPE_INFO[field.type].label;
  return `${index + 1}. ${label.length > 40 ? `${label.slice(0, 40)}…` : label}`;
}

function targetOfPath(document: FormDocument, path: PropertyKey[]): string {
  if (path[0] === "fields" && typeof path[1] === "number") {
    return document.fields[path[1]]?.id ?? "form";
  }
  if (path[0] === "endings" && typeof path[1] === "number") {
    const ending = document.endings.at(path[1]);
    return ending ? `ending:${ending.id}` : "form";
  }
  if (path[0] === "welcome") return "welcome";
  if (path[0] === "settings") return "settings";
  if (path[0] === "design") return "design";
  return "form";
}

function describePath(document: FormDocument, path: PropertyKey[]) {
  if (path[0] === "fields" && typeof path[1] === "number") {
    const field = document.fields.at(path[1]);
    const rest = path.slice(2).join(".");
    return `${field ? fieldName(field, path[1]) : `Block ${path[1] + 1}`}${rest ? ` · ${rest}` : ""}`;
  }
  if (path[0] === "endings" && typeof path[1] === "number") {
    return `Ending ${path[1] + 1}${path.length > 2 ? ` · ${path.slice(2).join(".")}` : ""}`;
  }
  return path.join(".") || "Form";
}

/**
 * Cross-reference checks the schema cannot make: rules naming deleted or
 * later questions, options that no longer exist, jumps to pages that are
 * gone or behind, the receipt email question, and answer pipes.
 */
export function referenceProblems(document: FormDocument): Problem[] {
  const problems: Problem[] = [];
  const index = new Map(document.fields.map((field, position) => [field.id, position]));
  const byId = new Map(document.fields.map((field) => [field.id, field]));
  const endingIds = new Set(document.endings.map((ending) => ending.id));

  const checkGroup = (
    group: FormConditionGroup | undefined,
    owner: string,
    ownerLabel: string,
    beforeIndex: number,
  ) => {
    group?.rules.forEach((rule, ruleIndex) => {
      const key = `${owner}:rule:${ruleIndex}`;
      if (rule.subject === SCORE_SUBJECT) return;
      const subject = byId.get(rule.subject);
      if (!subject) {
        problems.push({
          key,
          target: owner,
          severity: "warning",
          message: `${ownerLabel}: a rule refers to a question that was deleted.`,
        });
        return;
      }
      if (!isInputType(subject.type)) {
        problems.push({
          key,
          target: owner,
          severity: "warning",
          message: `${ownerLabel}: a rule refers to a content block, not a question.`,
        });
        return;
      }
      if ((index.get(rule.subject) ?? 0) >= beforeIndex) {
        problems.push({
          key,
          target: owner,
          severity: "warning",
          message: `${ownerLabel}: a rule looks at a question that comes later, so it can't be answered yet.`,
        });
      }
      if (isChoiceType(subject.type) && rule.value !== undefined) {
        const values = Array.isArray(rule.value) ? rule.value : [String(rule.value)];
        const ids = new Set((subject.options ?? []).map((option) => option.id));
        ids.add("__other__");
        if (values.some((value) => !ids.has(String(value)))) {
          problems.push({
            key: `${key}:option`,
            target: owner,
            severity: "warning",
            message: `${ownerLabel}: a rule names an option that no longer exists.`,
          });
        }
      }
    });
  };

  document.fields.forEach((field, position) => {
    const label = fieldName(field, position);
    checkGroup(field.visibleIf, field.id, label, position);
    if (field.type === "page_break") {
      field.jumps?.forEach((jump, jumpIndex) => {
        checkGroup(jump.when, field.id, `${label} jump ${jumpIndex + 1}`, position);
        if (jump.to === "end") return;
        if (jump.to.startsWith("ending:")) {
          if (!endingIds.has(jump.to.slice(7))) {
            problems.push({
              key: `${field.id}:jump:${jumpIndex}`,
              target: field.id,
              severity: "warning",
              message: `${label}: a jump goes to an ending that was deleted.`,
            });
          }
          return;
        }
        const target = index.get(jump.to);
        const targetField = target === undefined ? undefined : document.fields.at(target);
        if (!targetField || targetField.type !== "page_break") {
          problems.push({
            key: `${field.id}:jump:${jumpIndex}`,
            target: field.id,
            severity: "warning",
            message: `${label}: a jump goes to a page that was deleted.`,
          });
        } else if (target !== undefined && target <= position) {
          problems.push({
            key: `${field.id}:jump:${jumpIndex}`,
            target: field.id,
            severity: "warning",
            message: `${label}: a jump points back to an earlier page; jumps only go forward, so it is skipped.`,
          });
        }
      });
    }
    const pipes = [...field.label.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)].map(
      (match) => match[1],
    );
    for (const pipe of pipes) {
      const target = index.get(pipe);
      if (target === undefined || target >= position) {
        problems.push({
          key: `${field.id}:pipe:${pipe}`,
          target: field.id,
          severity: "warning",
          message: `${label}: {{${pipe}}} isn't an earlier question, so it will show empty.`,
        });
      }
    }
    if (field.type === "hidden" && !field.prefillParam) {
      problems.push({
        key: `${field.id}:param`,
        target: field.id,
        severity: "warning",
        message: `${label}: a hidden field needs a URL parameter name to be filled.`,
      });
    }
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max &&
      field.type !== "rating"
    ) {
      problems.push({
        key: `${field.id}:range`,
        target: field.id,
        severity: "error",
        message: `${label}: the minimum is larger than the maximum.`,
      });
    }
  });

  document.endings.forEach((ending, position) => {
    checkGroup(
      ending.when,
      `ending:${ending.id}`,
      `Ending ${position + 1}`,
      document.fields.length,
    );
  });

  const receipt = document.settings.receipt;
  if (receipt.enabled) {
    const field = receipt.emailFieldId ? byId.get(receipt.emailFieldId) : undefined;
    if (!field || field.type !== "email") {
      problems.push({
        key: "settings:receipt",
        target: "settings",
        severity: "warning",
        message: "Receipt email: choose the email question it is sent to.",
      });
    }
  }
  return problems;
}

export type CheckResult = {
  /** The parsed document (trimmed, defaults filled, rich text sanitized), when valid. */
  parsed?: FormDocument;
  problems: Problem[];
};

/** Schema validation plus reference checks; errors block saving, warnings don't. */
export function checkDocument(document: FormDocument): CheckResult {
  const result = formDocumentSchema.safeParse(document);
  const problems: Problem[] = [];
  if (!result.success) {
    result.error.issues.forEach((issue, issueIndex) => {
      problems.push({
        key: `schema:${issueIndex}:${issue.path.join(".")}`,
        target: targetOfPath(document, issue.path),
        path: issue.path.join("."),
        severity: "error",
        message: `${describePath(document, issue.path)}: ${issue.message}`,
      });
    });
  }
  problems.push(...referenceProblems(result.success ? result.data : document));
  const blocking = problems.some((problem) => problem.severity === "error");
  return { parsed: result.success && !blocking ? result.data : undefined, problems };
}

// ---------------------------------------------------------------------------
// Small conversions
// ---------------------------------------------------------------------------

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** ISO instant → `YYYY-MM-DDTHH:mm` in the browser's local time (for datetime-local inputs). */
export function isoToLocalInput(iso: string | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` local → ISO instant (UTC). */
export function localInputToIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const SLUG_WORDS = [
  "amber",
  "brisk",
  "cedar",
  "delta",
  "ember",
  "fable",
  "glint",
  "harbor",
  "indigo",
  "juniper",
  "kite",
  "lumen",
  "maple",
  "nova",
  "orbit",
  "prism",
  "quartz",
  "river",
  "sable",
  "tidal",
  "umber",
  "vivid",
  "willow",
  "zephyr",
];

/** A readable random slug: `orbit-maple-7k2m`. */
export function randomSlug() {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  const word = (byte: number) => SLUG_WORDS[byte % SLUG_WORDS.length];
  return `${word(bytes[0])}-${word(bytes[1])}-${(bytes[2] * 256 + bytes[3]).toString(36).padStart(3, "0")}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** "3 minutes ago", "yesterday", "12 Sep". Call after mount only (it reads the clock). */
export function relativeTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
