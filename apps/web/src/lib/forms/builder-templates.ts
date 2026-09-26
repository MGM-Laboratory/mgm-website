"use client";

/**
 * Template helpers: parsing a template into a fresh document (new ids are
 * not needed, templates are copied per form), and the admin's own
 * "My templates" kept in this browser's local storage.
 */

import {
  estimateMinutes,
  formDocumentSchema,
  isInputType,
  type FormDocument,
  type FormDocumentInput,
} from "@repo/shared";

const STORE_KEY = "mgm-forms-my-templates";
const STORE_LIMIT = 40;

export type SavedTemplate = {
  id: string;
  name: string;
  description: string;
  savedAt: string;
  document: FormDocumentInput;
};

const parsedCache = new WeakMap<object, FormDocument | null>();

/** The template's document, parsed with the shared schema (null when it doesn't parse). */
export function parseTemplateDocument(document: FormDocumentInput): FormDocument | null {
  const cached = parsedCache.get(document);
  if (cached !== undefined) return cached;
  const result = formDocumentSchema.safeParse(structuredClone(document));
  const parsed = result.success ? result.data : null;
  parsedCache.set(document, parsed);
  return parsed;
}

export function documentStats(document: FormDocument) {
  const questions = document.fields.filter(
    (field) => isInputType(field.type) && field.type !== "hidden",
  );
  return {
    questions: questions.length,
    pages: document.fields.filter((field) => field.type === "page_break").length + 1,
    minutes: estimateMinutes(document.fields),
  };
}

export function readSavedTemplates(): SavedTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is SavedTemplate =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SavedTemplate).id === "string" &&
        typeof (item as SavedTemplate).name === "string" &&
        typeof (item as SavedTemplate).document === "object",
    );
  } catch {
    return [];
  }
}

function writeSavedTemplates(list: SavedTemplate[]) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, STORE_LIMIT)));
}

/** Saves a copy of `document` as a personal template; throws when storage refuses it. */
export function saveTemplate(name: string, description: string, document: FormDocument) {
  const list = readSavedTemplates();
  const entry: SavedTemplate = {
    id: `mine_${Date.now().toString(36)}`,
    name: name.trim() || document.title,
    description: description.trim(),
    savedAt: new Date().toISOString(),
    document: structuredClone(document),
  };
  writeSavedTemplates([entry, ...list]);
  return entry;
}

export function removeSavedTemplate(id: string) {
  try {
    writeSavedTemplates(readSavedTemplates().filter((item) => item.id !== id));
  } catch {
    // Nothing to clean when storage is unavailable.
  }
}

/** Parses pasted or uploaded JSON: a bare document, or `{ document }` as exported. */
export function parseImportedJson(
  text: string,
): { ok: true; document: FormDocument } | { ok: false; errors: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`That isn't valid JSON: ${(error as Error).message}`] };
  }
  const candidate =
    typeof value === "object" && value !== null && "document" in value
      ? (value as { document: unknown }).document
      : value;
  const result = formDocumentSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues
        .slice(0, 12)
        .map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`),
    };
  }
  return { ok: true, document: result.data };
}

/** The JSON a form exports: versioned, pretty-printed. */
export function exportJson(document: FormDocument) {
  return JSON.stringify({ kind: "mgm-form", version: 1, document }, null, 2);
}
