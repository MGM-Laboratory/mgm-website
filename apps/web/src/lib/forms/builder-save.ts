"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FormDocument, FormRecord } from "@repo/shared";

import { FormsApiError, formsAdminApi } from "./admin-api";

/**
 * Autosave for the builder: about 1.2 s after the last edit, the parsed
 * document goes to the API. One request is in flight at a time; edits made
 * meanwhile queue behind it, and "Saved" shows only when what is on screen
 * is what the server has. A document that doesn't validate is never sent:
 * the header shows its problems instead.
 */

export type SaveStatus =
  | { kind: "saved" }
  | { kind: "saving" }
  | { kind: "dirty" }
  | { kind: "invalid"; count: number }
  | { kind: "error"; message: string; path?: string }
  | { kind: "readonly" };

const DEBOUNCE_MS = 1200;

/** Pulls a document path (`fields.3.options`) out of an API message, when it names one. */
export function pathFromMessage(message: string) {
  return /\b((?:fields|endings)\.\d+(?:\.[A-Za-z0-9_]+)*|(?:welcome|design|settings)(?:\.[A-Za-z0-9_]+)+)\b/.exec(
    message,
  )?.[1];
}

export function useAutosave({
  canWrite,
  document,
  errorCount,
  formId,
  initial,
  onSaved,
  parsed,
}: {
  canWrite: boolean;
  /** The raw document on screen (compared by reference). */
  document: FormDocument;
  errorCount: number;
  formId: string;
  /** The document as loaded; counts as saved. */
  initial: FormDocument;
  onSaved: (record: FormRecord) => void;
  /** The validated document to send, or undefined while it has errors. */
  parsed: FormDocument | undefined;
}) {
  const [savedRaw, setSavedRaw] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ message: string; path?: string; raw: FormDocument }>();
  const inflight = useRef(false);
  const pending = useRef<{ raw: FormDocument; parsed: FormDocument } | null>(null);
  const latest = useRef({ document, parsed, savedRaw });
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    latest.current = { document, parsed, savedRaw };
    onSavedRef.current = onSaved;
  });

  const send = useCallback(
    async (raw: FormDocument, body: FormDocument): Promise<boolean> => {
      if (inflight.current) {
        pending.current = { raw, parsed: body };
        return true;
      }
      inflight.current = true;
      setSaving(true);
      let ok = false;
      let job: { raw: FormDocument; parsed: FormDocument } | null = { raw, parsed: body };
      // Drain: the latest edit made while a request was out goes next.
      while (job) {
        try {
          const { form } = await formsAdminApi.update(formId, { document: job.parsed });
          setSavedRaw(job.raw);
          setFailure(undefined);
          onSavedRef.current(form);
          ok = true;
        } catch (error) {
          const message =
            error instanceof FormsApiError || error instanceof Error
              ? error.message
              : "The form could not be saved.";
          setFailure({ message, path: pathFromMessage(message), raw: job.raw });
          ok = false;
        }
        const next: { raw: FormDocument; parsed: FormDocument } | null = pending.current;
        pending.current = null;
        job = next && next.raw !== job.raw ? next : null;
      }
      inflight.current = false;
      setSaving(false);
      return ok;
    },
    [formId],
  );

  useEffect(() => {
    if (!canWrite || document === savedRaw || !parsed) return;
    if (failure && failure.raw === document) return;
    const timer = window.setTimeout(() => void send(document, parsed), DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [canWrite, document, failure, parsed, savedRaw, send]);

  /** Saves right away (Cmd/Ctrl+S, leaving the builder); resolves true when nothing is left unsaved. */
  const saveNow = useCallback(async () => {
    const current = latest.current;
    if (!canWrite) return true;
    if (current.document === current.savedRaw) return true;
    if (!current.parsed) return false;
    return send(current.document, current.parsed);
  }, [canWrite, send]);

  const dirty = canWrite && document !== savedRaw;

  // Leaving the page with unsaved edits: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  useEffect(
    () => () => {
      // Unmounting (switching workspace) with a valid unsaved document:
      // fire one last save. The request outlives the component because the
      // page itself stays open; a full page unload is covered by the
      // beforeunload warning above.
      const current = latest.current;
      if (!canWrite || current.document === current.savedRaw || !current.parsed) return;
      void formsAdminApi.update(formId, { document: current.parsed }).catch(() => undefined);
    },
    [canWrite, formId],
  );

  let status: SaveStatus;
  if (!canWrite) status = { kind: "readonly" };
  else if (saving) status = { kind: "saving" };
  else if (failure && failure.raw === document)
    status = { kind: "error", message: failure.message, path: failure.path };
  else if (document === savedRaw) status = { kind: "saved" };
  else if (!parsed) status = { kind: "invalid", count: errorCount };
  else status = { kind: "dirty" };

  return { status, saveNow, dirty, markSaved: setSavedRaw };
}
