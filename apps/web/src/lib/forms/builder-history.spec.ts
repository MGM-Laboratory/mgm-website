// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import type { FormDocument } from "@repo/shared";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type Reducer = (state: unknown, action: unknown) => unknown;

const captured = vi.hoisted(() => ({
  reducer: null as null | Reducer,
  init: null as null | (() => unknown),
  dispatched: [] as unknown[],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useReducer: (reducer: Reducer, arg: unknown, init: (arg: unknown) => unknown) => {
      captured.reducer = reducer;
      captured.init = () => init(arg);
      return [init(arg), (action: unknown) => captured.dispatched.push(action)];
    },
  };
});

import { useDocumentHistory } from "./builder-history";

type History = ReturnType<typeof useDocumentHistory>;
type State = {
  present: FormDocument;
  past: FormDocument[];
  future: FormDocument[];
  lastKey?: string;
  lastAt: number;
};

const doc = (title: string) => ({ title }) as unknown as FormDocument;

function mount(initial: FormDocument): History {
  let result: History | null = null;
  function Probe() {
    result = useDocumentHistory(initial);
    return null;
  }
  renderToString(createElement(Probe));
  return result as unknown as History;
}

const reduce = (state: State, action: unknown) =>
  (captured.reducer as Reducer)(state, action) as State;
const change = (update: (d: FormDocument) => FormDocument, at: number, coalesce?: string) => ({
  type: "change",
  update,
  coalesce,
  at,
});
const rename = (title: string) => (d: FormDocument) => ({ ...d, title });

describe("useDocumentHistory", () => {
  it("starts with the initial document and no history", () => {
    const initial = doc("A");
    const history = mount(initial);
    expect(history.document).toBe(initial);
    expect(history).toMatchObject({ canUndo: false, canRedo: false, historySize: 0 });
    expect(captured.init?.()).toEqual({ present: initial, past: [], future: [], lastAt: 0 });
  });

  it("dispatches the actions of its callbacks", () => {
    const history = mount(doc("A"));
    captured.dispatched.length = 0;
    const update = rename("B");
    history.change(update, "title");
    history.undo();
    history.redo();
    history.reset(doc("C"));
    expect(captured.dispatched).toMatchObject([
      { type: "change", update, coalesce: "title" },
      { type: "undo" },
      { type: "redo" },
      { type: "reset" },
    ]);
    expect(typeof (captured.dispatched[0] as { at: number }).at).toBe("number");
  });
});

describe("reducer", () => {
  mount(doc("seed"));
  const start: State = { present: doc("A"), past: [], future: [], lastAt: 0 };

  it("pushes the previous document on a change and clears the future", () => {
    const withFuture: State = { ...start, future: [doc("F")] };
    const next = reduce(withFuture, change(rename("B"), 1000));
    expect(next.present.title).toBe("B");
    expect(next.past.map((d) => d.title)).toEqual(["A"]);
    expect(next.future).toEqual([]);
  });

  it("ignores a change that returns the same document", () => {
    expect(
      reduce(
        start,
        change((d) => d, 1),
      ),
    ).toBe(start);
  });

  it("folds quick edits with the same key into one step", () => {
    const first = reduce(start, change(rename("B"), 1000, "label"));
    const second = reduce(first, change(rename("BC"), 1500, "label"));
    expect(second.past.map((d) => d.title)).toEqual(["A"]);
    expect(second.present.title).toBe("BC");
    // A different key, a slow edit or no key each start a new step
    expect(reduce(second, change(rename("X"), 1600, "other")).past).toHaveLength(2);
    expect(reduce(second, change(rename("X"), 3000, "label")).past).toHaveLength(2);
    expect(reduce(second, change(rename("X"), 1600)).past).toHaveLength(2);
  });

  it("keeps at most 150 steps", () => {
    let state = start;
    for (let step = 0; step < 160; step += 1)
      state = reduce(state, change(rename(`t${step}`), step * 5000));
    expect(state.past).toHaveLength(150);
    expect(state.past[0].title).toBe("t9");
  });

  it("undoes and redoes", () => {
    const one = reduce(start, change(rename("B"), 1000));
    const two = reduce(one, change(rename("C"), 5000));
    const undone = reduce(two, { type: "undo" });
    expect(undone.present.title).toBe("B");
    expect(undone.future.map((d) => d.title)).toEqual(["C"]);
    expect(undone.lastKey).toBeUndefined();
    const redone = reduce(undone, { type: "redo" });
    expect(redone.present.title).toBe("C");
    expect(redone.past.map((d) => d.title)).toEqual(["A", "B"]);
    expect(redone.future).toEqual([]);
  });

  it("does nothing to undo or redo with an empty stack", () => {
    expect(reduce(start, { type: "undo" })).toBe(start);
    expect(reduce(start, { type: "redo" })).toBe(start);
  });

  it("resets and ignores unknown actions", () => {
    const one = reduce(start, change(rename("B"), 1000));
    const reset = reduce(one, { type: "reset", document: doc("Z") });
    expect(reset).toEqual({ present: doc("Z"), past: [], future: [], lastAt: 0 });
    expect(reduce(start, { type: "nope" })).toBe(start);
  });
});
