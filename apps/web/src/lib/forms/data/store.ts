"use client";

/**
 * One small store per form, shared by the Responses and Analytics tabs: the
 * loaded responses, the cleaning pipeline (kept in localStorage per form)
 * and the table's view (segment, search, filters, sort). The tabs may mount
 * one at a time, so it lives at module level and is read through
 * `useSyncExternalStore`; the derived rows are computed once per change of
 * their inputs, whichever tab asks first.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { FormRecord, FormResponseRecord } from "@repo/shared";

import { formsAdminApi } from "@/lib/forms/admin-api";

import { META_COLUMNS, formAnswerDataColumns, type DataColumn, type WorkingRow } from "./columns";
import { DEFAULT_VIEW, applyView, filterRows, type ViewState } from "./filters";
import { runPipeline, type CleanStep, type PipelineResult } from "./pipeline";

export type FormDataState = {
  responses: FormResponseRecord[] | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  loadedAt: number;
  pipeline: CleanStep[];
  view: ViewState;
};

const EMPTY_STATE: FormDataState = {
  responses: null,
  status: "idle",
  error: null,
  loadedAt: 0,
  pipeline: [],
  view: DEFAULT_VIEW,
};

const states = new Map<string, FormDataState>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<FormResponseRecord[]>>();

const pipelineKey = (formId: string) => `mgm.forms.pipeline.${formId}`;

function readPipeline(formId: string): CleanStep[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(pipelineKey(formId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as CleanStep[]) : [];
  } catch {
    return [];
  }
}

function writePipeline(formId: string, pipeline: CleanStep[]) {
  try {
    if (pipeline.length) window.localStorage.setItem(pipelineKey(formId), JSON.stringify(pipeline));
    else window.localStorage.removeItem(pipelineKey(formId));
  } catch {
    // Private windows and full storage: the pipeline just won't persist.
  }
}

function getState(formId: string): FormDataState {
  let state = states.get(formId);
  if (!state) {
    state = { ...EMPTY_STATE, pipeline: readPipeline(formId) };
    states.set(formId, state);
  }
  return state;
}

function setState(formId: string, update: (state: FormDataState) => FormDataState) {
  const previous = getState(formId);
  const next = update(previous);
  if (next === previous) return;
  states.set(formId, next);
  if (next.pipeline !== previous.pipeline) writePipeline(formId, next.pipeline);
  listeners.get(formId)?.forEach((listener) => listener());
}

function subscribe(formId: string, listener: () => void) {
  let set = listeners.get(formId);
  if (!set) {
    set = new Set();
    listeners.set(formId, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

/** Loads (or reloads) a form's responses; concurrent calls share one request. */
export function loadResponses(formId: string, options: { force?: boolean; quiet?: boolean } = {}) {
  const state = getState(formId);
  if (!options.force && state.responses && state.status === "ready")
    return Promise.resolve(state.responses);
  const running = inflight.get(formId);
  if (running) return running;
  if (!options.quiet)
    setState(formId, (current) => ({
      ...current,
      status: current.responses ? current.status : "loading",
      error: null,
    }));
  const request = formsAdminApi
    .responses(formId)
    .then(({ responses }) => {
      setState(formId, (current) => ({
        ...current,
        responses,
        status: "ready",
        error: null,
        loadedAt: Date.now(),
      }));
      return responses;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Could not load the responses.";
      setState(formId, (current) => ({
        ...current,
        status: current.responses ? "ready" : "error",
        error: message,
      }));
      throw error;
    })
    .finally(() => inflight.delete(formId));
  inflight.set(formId, request);
  return request;
}

/** Local edits after a successful API call (patch, bulk, apply). */
export function updateResponses(
  formId: string,
  update: (responses: FormResponseRecord[]) => FormResponseRecord[],
) {
  setState(formId, (state) =>
    state.responses ? { ...state, responses: update(state.responses) } : state,
  );
}

export function replaceResponse(formId: string, response: FormResponseRecord) {
  updateResponses(formId, (responses) =>
    responses.map((item) => (item.id === response.id ? response : item)),
  );
}

export function setPipeline(
  formId: string,
  update: CleanStep[] | ((pipeline: CleanStep[]) => CleanStep[]),
) {
  setState(formId, (state) => ({
    ...state,
    pipeline: typeof update === "function" ? update(state.pipeline) : update,
  }));
}

export function setView(
  formId: string,
  update: Partial<ViewState> | ((view: ViewState) => ViewState),
) {
  setState(formId, (state) => ({
    ...state,
    view: typeof update === "function" ? update(state.view) : { ...state.view, ...update },
  }));
}

export function useFormDataState(formId: string): FormDataState {
  const sub = useCallback((listener: () => void) => subscribe(formId, listener), [formId]);
  return useSyncExternalStore(
    sub,
    () => getState(formId),
    () => EMPTY_STATE,
  );
}

export type FormDataset = {
  state: FormDataState;
  /** Answer columns, metadata, then the pipeline's virtual columns. */
  columns: DataColumn[];
  answerColumns: DataColumn[];
  metaColumns: DataColumn[];
  pipeline: PipelineResult;
  /** Cleaned rows, before the view. */
  rows: WorkingRow[];
  /** Cleaned and filtered (segment, search, column filters), not sorted. */
  filtered: WorkingRow[];
  /** Filtered and sorted, what the table shows. */
  viewRows: WorkingRow[];
};

type DerivedCache = {
  responses: FormResponseRecord[] | null;
  pipelineSteps: CleanStep[];
  document: FormRecord["document"];
  view: ViewState;
  base: DataColumn[];
  pipeline: PipelineResult;
  filtered: WorkingRow[];
  viewRows: WorkingRow[];
};

const derivedCache = new Map<string, DerivedCache>();
const NO_RESPONSES: FormResponseRecord[] = [];

function derive(form: FormRecord, state: FormDataState): DerivedCache {
  const cached = derivedCache.get(form.id);
  const responses = state.responses ?? NO_RESPONSES;
  if (
    cached &&
    cached.responses === responses &&
    cached.pipelineSteps === state.pipeline &&
    cached.document === form.document &&
    cached.view === state.view
  ) {
    return cached;
  }
  let base = cached?.base;
  let pipeline = cached?.pipeline;
  if (!cached || cached.document !== form.document) {
    base = [...formAnswerDataColumns(form.document), ...META_COLUMNS];
  }
  if (
    !cached ||
    !pipeline ||
    cached.responses !== responses ||
    cached.pipelineSteps !== state.pipeline ||
    cached.document !== form.document
  ) {
    pipeline = runPipeline(form.document, responses, base as DataColumn[], state.pipeline);
  }
  const columns = [...(base as DataColumn[]), ...(pipeline as PipelineResult).extraColumns];
  const filtered = filterRows((pipeline as PipelineResult).rows, columns, state.view);
  const viewRows = state.view.sort
    ? applyView(filtered, columns, { ...state.view, search: "", filters: [], segment: "all" })
    : filtered;
  const next: DerivedCache = {
    responses,
    pipelineSteps: state.pipeline,
    document: form.document,
    view: state.view,
    base: base as DataColumn[],
    pipeline: pipeline as PipelineResult,
    filtered,
    viewRows,
  };
  derivedCache.set(form.id, next);
  return next;
}

/** Everything a panel needs about a form's responses, cleaned and filtered. */
export function useFormDataset(form: FormRecord): FormDataset {
  const state = useFormDataState(form.id);
  return useMemo(() => {
    const derived = derive(form, state);
    const answerColumns = derived.base.filter((column) => column.group === "answer");
    const metaColumns = derived.base.filter((column) => column.group === "meta");
    return {
      state,
      columns: [...derived.base, ...derived.pipeline.extraColumns],
      answerColumns,
      metaColumns,
      pipeline: derived.pipeline,
      rows: derived.pipeline.rows,
      filtered: derived.filtered,
      viewRows: derived.viewRows,
    };
  }, [form, state]);
}
