// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    data,
  };
}

async function load(storage: ReturnType<typeof fakeStorage> | "throws" | "no-window") {
  vi.resetModules();
  if (storage === "no-window") {
    vi.stubGlobal("window", undefined);
  } else if (storage === "throws") {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
  } else {
    vi.stubGlobal("window", { sessionStorage: storage });
  }
  return import("./lab-notes");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("labNote", () => {
  it("does nothing on the server", async () => {
    const { labNote } = await load("no-window");

    expect(labNote({ id: "a", text: "hi" })).toBe(false);
  });

  it("delivers a note once per id and remembers it in the session", async () => {
    const storage = fakeStorage();
    const { labNote, onLabNote } = await load(storage);
    const listener = vi.fn();
    onLabNote(listener);

    expect(labNote({ id: "a", text: "hi" })).toBe(true);
    expect(labNote({ id: "a", text: "hi again" })).toBe(false);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.data.get("mgm:lab-notes") ?? "[]")).toEqual(["a"]);
  });

  it("skips ids that an earlier page load already said", async () => {
    const storage = fakeStorage({ "mgm:lab-notes": JSON.stringify(["old"]) });
    const { labNote } = await load(storage);

    expect(labNote({ id: "old", text: "x" })).toBe(false);
    expect(labNote({ id: "new", text: "x" })).toBe(true);
    expect(JSON.parse(storage.data.get("mgm:lab-notes") ?? "[]")).toEqual(["old", "new"]);
  });

  it("says a repeat note again", async () => {
    const { labNote, onLabNote } = await load(fakeStorage());
    const listener = vi.fn();
    onLabNote(listener);

    labNote({ id: "r", text: "x", repeat: true });
    labNote({ id: "r", text: "x", repeat: true });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("still works when storage is blocked", async () => {
    const { labNote } = await load("throws");

    expect(labNote({ id: "a", text: "x" })).toBe(true);
    expect(labNote({ id: "a", text: "x" })).toBe(false);
  });

  it("ignores an unreadable stored list", async () => {
    const { labNote } = await load(fakeStorage({ "mgm:lab-notes": "not json" }));

    expect(labNote({ id: "a", text: "x" })).toBe(true);
  });

  it("stops telling a listener that unsubscribed", async () => {
    const { labNote, onLabNote } = await load(fakeStorage());
    const listener = vi.fn();
    onLabNote(listener)();

    labNote({ id: "a", text: "x" });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("noteDuration", () => {
  it("uses the given duration", async () => {
    const { noteDuration } = await load(fakeStorage());

    expect(noteDuration({ id: "a", text: "x", duration: 1000 })).toBe(1000);
  });

  it("scales with the text length between 3.2 and 7 seconds", async () => {
    const { noteDuration } = await load(fakeStorage());

    expect(noteDuration({ id: "a", text: "short" })).toBe(3200);
    expect(noteDuration({ id: "a", text: "x".repeat(60) })).toBe(4200);
    expect(noteDuration({ id: "a", text: "x".repeat(500) })).toBe(7000);
  });
});
