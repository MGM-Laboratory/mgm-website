/**
 * Immutable document edits the builder dispatches: every function returns a
 * new document and leaves untouched fields as the same objects, so memoized
 * canvas cards only re-render for the block that changed.
 */

import type { FormDocument, FormEnding, FormField } from "@repo/shared";

import { cloneField, documentIds, mintId } from "./builder-fields";

export function patchField(
  document: FormDocument,
  id: string,
  patch: Partial<FormField> | ((field: FormField) => FormField),
): FormDocument {
  if (!document.fields.some((field) => field.id === id)) return document;
  const fields = document.fields.map((field) => {
    if (field.id !== id) return field;
    return typeof patch === "function" ? patch(field) : { ...field, ...patch };
  });
  return { ...document, fields };
}

/** Inserts after the block `afterId` (at the end when it is null or missing). */
export function insertFields(
  document: FormDocument,
  fields: FormField[],
  afterId: string | null,
): FormDocument {
  const index = afterId ? document.fields.findIndex((field) => field.id === afterId) : -1;
  const at = index === -1 ? document.fields.length : index + 1;
  return {
    ...document,
    fields: [...document.fields.slice(0, at), ...fields, ...document.fields.slice(at)],
  };
}

export function insertFieldsAt(
  document: FormDocument,
  fields: FormField[],
  at: number,
): FormDocument {
  const index = Math.max(0, Math.min(at, document.fields.length));
  return {
    ...document,
    fields: [...document.fields.slice(0, index), ...fields, ...document.fields.slice(index)],
  };
}

export function removeFields(document: FormDocument, ids: Iterable<string>): FormDocument {
  const drop = new Set(ids);
  return { ...document, fields: document.fields.filter((field) => !drop.has(field.id)) };
}

/** Moves one block up (-1) or down (+1). */
export function moveField(document: FormDocument, id: string, delta: number): FormDocument {
  const index = document.fields.findIndex((field) => field.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= document.fields.length) return document;
  const fields = [...document.fields];
  const [item] = fields.splice(index, 1);
  fields.splice(target, 0, item);
  return { ...document, fields };
}

/** Applies an order of ids (from a drag); ids not listed keep their relative order at the end. */
export function reorderFields(document: FormDocument, order: string[]): FormDocument {
  const byId = new Map(document.fields.map((field) => [field.id, field]));
  const fields = order
    .map((id) => byId.get(id))
    .filter((field): field is FormField => Boolean(field));
  const listed = new Set(order);
  for (const field of document.fields) if (!listed.has(field.id)) fields.push(field);
  const same = fields.every((field, index) => field === document.fields.at(index));
  return same ? document : { ...document, fields };
}

/** Copies of the given blocks, each placed right after the last of them. Returns the new ids too. */
export function duplicateFields(
  document: FormDocument,
  ids: string[],
): { document: FormDocument; newIds: string[] } {
  const taken = documentIds(document);
  const chosen = document.fields.filter((field) => ids.includes(field.id));
  if (!chosen.length) return { document, newIds: [] };
  const copies = chosen.map((field) => cloneField(field, taken));
  const last = chosen[chosen.length - 1].id;
  return {
    document: insertFields(document, copies, last),
    newIds: copies.map((field) => field.id),
  };
}

export function patchEnding(
  document: FormDocument,
  id: string,
  patch: Partial<FormEnding>,
): FormDocument {
  return {
    ...document,
    endings: document.endings.map((ending) =>
      ending.id === id ? { ...ending, ...patch } : ending,
    ),
  };
}

export function addEnding(document: FormDocument): { document: FormDocument; id: string } {
  const id = mintId("ending", documentIds(document));
  const ending: FormEnding = {
    id,
    title: "Thank you",
    showScore: false,
    allowAnother: false,
    showShare: true,
    when: { match: "all", rules: [] },
  };
  return { document: { ...document, endings: [...document.endings, ending] }, id };
}

export function removeEnding(document: FormDocument, id: string): FormDocument {
  if (document.endings.length <= 1) return document;
  return { ...document, endings: document.endings.filter((ending) => ending.id !== id) };
}

export function moveEnding(document: FormDocument, id: string, delta: number): FormDocument {
  const index = document.endings.findIndex((ending) => ending.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= document.endings.length) return document;
  const endings = [...document.endings];
  const [item] = endings.splice(index, 1);
  endings.splice(target, 0, item);
  return { ...document, endings };
}

/** Rules, jumps and pipes that mention `fieldId` (for "used by" hints before deleting). */
export function referencesTo(document: FormDocument, fieldId: string) {
  const users: string[] = [];
  for (const field of document.fields) {
    if (field.visibleIf?.rules.some((rule) => rule.subject === fieldId)) users.push(field.id);
    else if (
      field.jumps?.some(
        (jump) => jump.to === fieldId || jump.when.rules.some((rule) => rule.subject === fieldId),
      )
    )
      users.push(field.id);
    else if (field.label.includes(`{{${fieldId}}}`)) users.push(field.id);
  }
  for (const ending of document.endings) {
    if (ending.when?.rules.some((rule) => rule.subject === fieldId))
      users.push(`ending:${ending.id}`);
  }
  return users;
}
