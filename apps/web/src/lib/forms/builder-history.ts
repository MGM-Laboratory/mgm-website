"use client";

import { useCallback, useMemo, useReducer } from "react";

import type { FormDocument } from "@repo/shared";

/**
 * The builder's document with an undo history of snapshots. Each change
 * pushes the previous document; quick successive edits of the same control
 * (typing into one label) share a `coalesce` key and fold into a single
 * step, so one Undo takes back a whole word run instead of one keystroke.
 */

const HISTORY_LIMIT = 150;
const COALESCE_MS = 900;

type State = {
  present: FormDocument;
  past: FormDocument[];
  future: FormDocument[];
  lastKey?: string;
  lastAt: number;
};

type Action =
  | {
      type: "change";
      update: (document: FormDocument) => FormDocument;
      coalesce?: string;
      at: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; document: FormDocument };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "change": {
      const next = action.update(state.present);
      if (next === state.present) return state;
      const fold =
        action.coalesce !== undefined &&
        action.coalesce === state.lastKey &&
        action.at - state.lastAt < COALESCE_MS;
      return {
        present: next,
        past: fold ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: action.coalesce,
        lastAt: action.at,
      };
    }
    case "undo": {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
        lastKey: undefined,
        lastAt: 0,
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return {
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: rest,
        lastKey: undefined,
        lastAt: 0,
      };
    }
    case "reset":
      return { present: action.document, past: [], future: [], lastAt: 0 };
    default:
      return state;
  }
}

export type DocumentChange = (
  update: (document: FormDocument) => FormDocument,
  coalesce?: string,
) => void;

export function useDocumentHistory(initial: FormDocument) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    present: initial,
    past: [],
    future: [],
    lastAt: 0,
  }));
  const change = useCallback<DocumentChange>(
    (update, coalesce) => dispatch({ type: "change", update, coalesce, at: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((document: FormDocument) => dispatch({ type: "reset", document }), []);
  return useMemo(
    () => ({
      document: state.present,
      change,
      undo,
      redo,
      reset,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      historySize: state.past.length,
    }),
    [change, redo, reset, state.future.length, state.past.length, state.present, undo],
  );
}
