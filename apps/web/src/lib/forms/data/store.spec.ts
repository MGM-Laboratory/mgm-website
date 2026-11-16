import type { FormRecord, FormResponseRecord } from "@repo/shared";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  subscribe: null as null | ((listener: () => void) => () => void),
  snapshot: null as null | (() => unknown),
  serverSnapshot: null as null | (() => unknown),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: (
      subscribe: (listener: () => void) => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot: () => unknown,
    ) => {
      hooks.subscribe = subscribe;
      hooks.snapshot = getSnapshot;
      hooks.serverSnapshot = getServerSnapshot;
      return getSnapshot();
    },
  };
});

const api = vi.hoisted(() => ({ responses: vi.fn() }));
vi.mock("@/lib/forms/admin-api", () => ({ formsAdminApi: { responses: api.responses } }));

import {
  loadResponses,
  replaceResponse,
  setPipeline,
  setView,
  updateResponses,
  useFormDataState,
  useFormDataset,
  type FormDataset,
  type FormDataState,
} from "./store";
import { newStep } from "./pipeline";

let counter = 0;
const nextId = () => {
  counter += 1;
  return `form-${counter}`;
};

function record(id: string, name: string): FormResponseRecord {
  return {
    id,
    formId: "f",
    answers: { name },
    score: null,
    endingId: null,
    sessionId: null,
    spam: false,
    meta: {
      ip: null,
      userAgent: null,
      referer: null,
      country: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      device: null,
      browser: null,
      os: null,
      language: null,
      screen: null,
      deviceId: null,
      utm: null,
      startedAt: null,
      durationMs: null,
    },
    admin: {
      starred: false,
      flagged: false,
      reviewed: false,
      tags: [],
      note: null,
      editedAt: null,
    },
    createdAt: "2024-03-05T10:30:00.000Z",
  };
}

function formRecord(id: string): FormRecord {
  return {
    id,
    slug: id,
    status: "published",
    document: {
      fields: [{ id: "name", type: "short_text", label: "Name" }],
      endings: [{ id: "end" }],
    },
    hasPassphrase: false,
    publishedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    stats: { responses: 0, views: 0, starts: 0, lastResponseAt: null },
  } as unknown as FormRecord;
}

function stateOf(formId: string): FormDataState {
  function Probe() {
    useFormDataState(formId);
    return null;
  }
  renderToString(createElement(Probe));
  return (hooks.snapshot as () => FormDataState)();
}

function datasetOf(form: FormRecord): FormDataset {
  let result: FormDataset | null = null;
  function Probe() {
    result = useFormDataset(form);
    return null;
  }
  renderToString(createElement(Probe));
  return result as unknown as FormDataset;
}

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
  };
  vi.stubGlobal("window", { localStorage: storage });
  return { data, storage };
}

beforeEach(() => {
  api.responses.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loading responses", () => {
  it("loads once, goes through loading, and serves the cache after", async () => {
    const id = nextId();
    const list = [record("a", "Ada")];
    let release: (value: { responses: FormResponseRecord[] }) => void = () => {};
    api.responses.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const first = loadResponses(id);
    expect(stateOf(id)).toMatchObject({ status: "loading", responses: null, error: null });
    // A second call while one runs shares the request
    expect(loadResponses(id)).toBe(first);
    release({ responses: list });
    await expect(first).resolves.toBe(list);
    expect(stateOf(id)).toMatchObject({ status: "ready", responses: list });
    expect(stateOf(id).loadedAt).toBeGreaterThan(0);
    await expect(loadResponses(id)).resolves.toBe(list);
    expect(api.responses).toHaveBeenCalledTimes(1);
  });

  it("reloads when forced and stays quiet when asked", async () => {
    const id = nextId();
    api.responses.mockResolvedValueOnce({ responses: [record("a", "A")] });
    await loadResponses(id);
    const second = [record("b", "B")];
    let release: (value: { responses: FormResponseRecord[] }) => void = () => {};
    api.responses.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const pending = loadResponses(id, { force: true, quiet: true });
    expect(stateOf(id).status).toBe("ready");
    release({ responses: second });
    await pending;
    expect(stateOf(id).responses).toBe(second);
    expect(api.responses).toHaveBeenCalledTimes(2);
  });

  it("keeps the loaded rows and status when a forced reload loads", async () => {
    const id = nextId();
    api.responses.mockResolvedValueOnce({ responses: [record("a", "A")] });
    await loadResponses(id);
    let release: (value: { responses: FormResponseRecord[] }) => void = () => {};
    api.responses.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const pending = loadResponses(id, { force: true });
    expect(stateOf(id).status).toBe("ready");
    release({ responses: [] });
    await pending;
  });

  it("records an error and rethrows, with a fallback message", async () => {
    const id = nextId();
    api.responses.mockRejectedValueOnce(new Error("boom"));
    await expect(loadResponses(id)).rejects.toThrow("boom");
    expect(stateOf(id)).toMatchObject({ status: "error", error: "boom" });
    api.responses.mockRejectedValueOnce("plain string");
    await expect(loadResponses(id)).rejects.toBe("plain string");
    expect(stateOf(id).error).toBe("Could not load the responses.");
  });

  it("stays ready with a message when a reload fails after a first load", async () => {
    const id = nextId();
    api.responses.mockResolvedValueOnce({ responses: [record("a", "A")] });
    await loadResponses(id);
    api.responses.mockRejectedValueOnce(new Error("later"));
    await expect(loadResponses(id, { force: true })).rejects.toThrow("later");
    expect(stateOf(id)).toMatchObject({ status: "ready", error: "later" });
    expect(stateOf(id).responses).toHaveLength(1);
  });
});

describe("editing responses", () => {
  it("updates and replaces rows once loaded, and ignores edits before", async () => {
    const id = nextId();
    updateResponses(id, (list) => [...list, record("z", "Z")]);
    expect(stateOf(id).responses).toBeNull();
    api.responses.mockResolvedValueOnce({ responses: [record("a", "A"), record("b", "B")] });
    await loadResponses(id);
    replaceResponse(id, record("b", "Bee"));
    expect(stateOf(id).responses?.map((item) => item.answers.name)).toEqual(["A", "Bee"]);
    updateResponses(id, (list) => list.slice(0, 1));
    expect(stateOf(id).responses).toHaveLength(1);
  });
});

describe("pipeline persistence", () => {
  it("restores a saved pipeline and writes changes back", () => {
    const id = nextId();
    const saved = [newStep("trim", "s1")];
    const { storage, data } = stubStorage({ [`mgm.forms.pipeline.${id}`]: JSON.stringify(saved) });
    expect(stateOf(id).pipeline).toEqual(saved);
    setPipeline(id, (steps) => [...steps, newStep("collapse", "s2")]);
    expect(stateOf(id).pipeline).toHaveLength(2);
    expect(JSON.parse(data.get(`mgm.forms.pipeline.${id}`) ?? "[]")).toHaveLength(2);
    setPipeline(id, []);
    expect(storage.removeItem).toHaveBeenCalledWith(`mgm.forms.pipeline.${id}`);
    expect(data.has(`mgm.forms.pipeline.${id}`)).toBe(false);
  });

  it("ignores broken, non array and missing storage", () => {
    stubStorage({ "mgm.forms.pipeline.bad-json": "{nope", "mgm.forms.pipeline.object": '{"a":1}' });
    expect(stateOf("bad-json").pipeline).toEqual([]);
    expect(stateOf("object").pipeline).toEqual([]);
    expect(stateOf("never-saved").pipeline).toEqual([]);
  });

  it("works without a window and survives a storage that throws", () => {
    const id = nextId();
    expect(stateOf(id).pipeline).toEqual([]);
    const other = nextId();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("full");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => setPipeline(other, [newStep("trim", "s")])).not.toThrow();
    expect(stateOf(other).pipeline).toHaveLength(1);
    expect(() => setPipeline(other, [])).not.toThrow();
  });

  it("does not write when only the view changes", () => {
    const id = nextId();
    const { storage } = stubStorage();
    setView(id, { search: "x" });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

describe("view and subscriptions", () => {
  it("merges a partial view or takes a function, and notifies listeners", () => {
    const id = nextId();
    stateOf(id);
    const listener = vi.fn();
    const unsubscribe = (hooks.subscribe as (listener: () => void) => () => void)(listener);
    setView(id, { search: "ada" });
    expect(stateOf(id).view).toMatchObject({ search: "ada", segment: "all" });
    setView(id, (view) => ({ ...view, segment: "starred" }));
    expect(stateOf(id).view).toMatchObject({ search: "ada", segment: "starred" });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setView(id, { search: "bob" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not notify when an update returns the same state", async () => {
    const id = nextId();
    stateOf(id);
    const listener = vi.fn();
    (hooks.subscribe as (listener: () => void) => () => void)(listener);
    updateResponses(id, (list) => list);
    expect(listener).not.toHaveBeenCalled();
  });

  it("serves the empty state to the server render", () => {
    const id = nextId();
    stateOf(id);
    expect((hooks.serverSnapshot as () => FormDataState)()).toMatchObject({
      responses: null,
      status: "idle",
      pipeline: [],
    });
  });
});

describe("useFormDataset", () => {
  it("derives columns, cleaned rows and the view", async () => {
    const id = nextId();
    const form = formRecord(id);
    api.responses.mockResolvedValueOnce({
      responses: [record("a", "  Ada "), record("b", "Bob"), record("c", "Cy")],
    });
    await loadResponses(id);
    setPipeline(id, [
      { ...newStep("trim", "s1") },
      { ...newStep("compute", "s2"), name: "Len", formula: "len({Name})" } as ReturnType<
        typeof newStep
      >,
    ]);
    setView(id, {
      filters: [{ key: "s2:value", op: "range", min: 3 }],
      sort: { key: "name", direction: "desc" },
    });
    const dataset = datasetOf(form);
    expect(dataset.answerColumns.map((column) => column.key)).toEqual(["name"]);
    expect(dataset.metaColumns.length).toBeGreaterThan(10);
    expect(dataset.columns.at(-1)).toMatchObject({ label: "Len", valueType: "number" });
    expect(dataset.rows.map((row) => row.answers.name)).toEqual(["Ada", "Bob", "Cy"]);
    expect(dataset.filtered.map((row) => row.id)).toEqual(["a", "b"]);
    expect(dataset.viewRows.map((row) => row.id)).toEqual(["b", "a"]);
    expect(dataset.pipeline.extraColumns).toHaveLength(1);
  });

  it("reuses the cache until an input changes", async () => {
    const id = nextId();
    const form = formRecord(id);
    api.responses.mockResolvedValueOnce({ responses: [record("a", "Ada"), record("b", "Bob")] });
    await loadResponses(id);
    const first = datasetOf(form);
    const again = datasetOf(form);
    expect(again.pipeline).toBe(first.pipeline);
    expect(again.filtered).toBe(first.filtered);
    // A new view reruns only the filter, not the pipeline or the columns
    setView(id, { search: "ada" });
    const filtered = datasetOf(form);
    expect(filtered.pipeline).toBe(first.pipeline);
    expect(filtered.answerColumns).toEqual(first.answerColumns);
    expect(filtered.filtered.map((row) => row.id)).toEqual(["a"]);
    // New responses rerun the pipeline but keep the columns
    replaceResponse(id, record("a", "Ann"));
    const replaced = datasetOf(form);
    expect(replaced.pipeline).not.toBe(first.pipeline);
    expect(replaced.rows.map((row) => row.answers.name)).toEqual(["Ann", "Bob"]);
    // A new document rebuilds the columns
    const changed = { ...form, document: { ...form.document, fields: [] } } as FormRecord;
    expect(datasetOf(changed).answerColumns).toEqual([]);
  });

  it("handles a form with no responses loaded", () => {
    const id = nextId();
    const dataset = datasetOf(formRecord(id));
    expect(dataset.rows).toEqual([]);
    expect(dataset.viewRows).toEqual([]);
    expect(dataset.state.status).toBe("idle");
  });
});
