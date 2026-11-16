// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FormUploadError,
  clearAutosave,
  clientContext,
  formDeviceId,
  formSessionId,
  hasResponded,
  loadAutosave,
  markResponded,
  readStored,
  resetFormSession,
  saveAutosave,
  sendFormEvent,
  submitFormResponse,
  unlockForm,
  uploadFormFile,
  writeStored,
} from "./public-client";

type Reply = { status: number; text?: string } | "error" | "abort";

class FakeXhr {
  static instances: FakeXhr[] = [];
  static reply: Reply = { status: 200, text: "{}" };
  static hold = false;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  responseType = "";
  responseText = "";
  status = 0;
  sent: unknown = undefined;
  aborted = false;
  upload: {
    onprogress:
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  send(body: unknown) {
    this.sent = body;
    if (FakeXhr.hold) return;
    const reply = FakeXhr.reply;
    queueMicrotask(() => {
      if (reply === "error") this.onerror?.();
      else if (reply === "abort") this.onabort?.();
      else {
        this.status = reply.status;
        this.responseText = reply.text ?? "";
        this.onload?.();
      }
    });
  }
}

function makeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

let local: ReturnType<typeof makeStorage>;
let session: ReturnType<typeof makeStorage>;
const last = () => FakeXhr.instances[FakeXhr.instances.length - 1];
let counter = 0;
const slug = () => `slug-${(counter += 1)}`;

beforeEach(() => {
  FakeXhr.instances = [];
  FakeXhr.reply = { status: 200, text: "{}" };
  FakeXhr.hold = false;
  local = makeStorage();
  session = makeStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("stored values", () => {
  it("reads, writes and removes in the chosen storage", () => {
    writeStored("local", "k", "v");
    expect(local.data.get("k")).toBe("v");
    expect(readStored("local", "k")).toBe("v");
    expect(readStored("session", "k")).toBeNull();
    writeStored("session", "s", "1");
    expect(readStored("session", "s")).toBe("1");
    writeStored("local", "k", null);
    expect(readStored("local", "k")).toBeNull();
  });

  it("survives blocked storage", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("blocked");
      },
      sessionStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("full");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(readStored("local", "k")).toBeNull();
    expect(readStored("session", "k")).toBeNull();
    expect(() => writeStored("local", "k", "v")).not.toThrow();
    expect(() => writeStored("session", "k", "v")).not.toThrow();
    expect(() => writeStored("session", "k", null)).not.toThrow();
  });
});

describe("session and device ids", () => {
  it("makes one id per form and keeps it", () => {
    const one = slug();
    const id = formSessionId(one);
    expect(id).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(formSessionId(one)).toBe(id);
    expect(session.data.get(`mgm-form-session:${one}`)).toBe(id);
    expect(formSessionId(slug())).not.toBe(id);
  });

  it("starts a fresh session on reset", () => {
    const one = slug();
    const id = formSessionId(one);
    resetFormSession(one);
    expect(session.data.has(`mgm-form-session:${one}`)).toBe(false);
    expect(formSessionId(one)).not.toBe(id);
  });

  it("keeps the id in memory when storage refuses", () => {
    vi.stubGlobal("window", {
      localStorage: null,
      get sessionStorage(): never {
        throw new Error("blocked");
      },
    });
    const one = slug();
    expect(formSessionId(one)).toBe(formSessionId(one));
  });

  it("makes one device id for the browser", () => {
    const id = formDeviceId();
    expect(formDeviceId()).toBe(id);
    expect(local.data.get("mgm-form-device")).toBe(id);
  });

  it("falls back to random bytes without randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(171);
        return bytes;
      },
    });
    expect(formSessionId(slug())).toBe("ab".repeat(16));
  });

  it("marks a form as responded", () => {
    const one = slug();
    expect(hasResponded(one)).toBe(false);
    markResponded(one);
    expect(hasResponded(one)).toBe(true);
    expect(local.data.get(`mgm-form-done:${one}`)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("clientContext", () => {
  function stubBrowser(search: string, referrer: string) {
    vi.stubGlobal("navigator", { language: "id-ID" });
    vi.stubGlobal("window", {
      screen: { width: 1280, height: 720 },
      location: { search, origin: "https://labmgm.org" },
    });
    vi.stubGlobal("document", { referrer });
  }

  it("collects language, time zone, screen, utm values and an outside referrer", () => {
    stubBrowser(
      "?utm_source=news&utm_medium=email&utm_campaign=&utm_term=" + "x".repeat(300),
      "https://other.test/page",
    );
    const context = clientContext();
    expect(context).toMatchObject({
      language: "id-ID",
      screen: "1280x720",
      referrer: "https://other.test/page",
    });
    expect(context.timezone).toBeTruthy();
    expect(context.utm).toEqual({ source: "news", medium: "email", term: "x".repeat(200) });
  });

  it("leaves out utm and an own-site or empty referrer", () => {
    stubBrowser("", "https://labmgm.org/forms");
    expect(clientContext().utm).toBeUndefined();
    expect(clientContext().referrer).toBeUndefined();
    stubBrowser("", "");
    expect(clientContext().referrer).toBeUndefined();
  });

  it("keeps what it had when a part throws", () => {
    vi.stubGlobal("navigator", { language: "en" });
    vi.stubGlobal("window", {
      get screen(): never {
        throw new Error("no screen");
      },
    });
    expect(clientContext()).toEqual({ language: "en", timezone: expect.any(String) });
  });
});

describe("sendFormEvent", () => {
  it("uses a beacon when the browser has one", () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    sendFormEvent("a b", { type: "view" } as never);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect((sendBeacon.mock.calls[0] as unknown as [string])[0]).toBe("/api/forms/a%20b/events");
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("posts when there is no beacon, the beacon refuses, or it throws", () => {
    vi.stubGlobal("navigator", {});
    sendFormEvent("s", { type: "view" } as never);
    expect(last()).toMatchObject({
      method: "POST",
      url: "/api/forms/s/events",
      sent: '{"type":"view"}',
    });
    vi.stubGlobal("navigator", { sendBeacon: () => false });
    sendFormEvent("s", { type: "start" } as never);
    expect(FakeXhr.instances).toHaveLength(2);
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("blocked");
      },
    });
    sendFormEvent("s", { type: "start" } as never);
    expect(FakeXhr.instances).toHaveLength(3);
  });
});

describe("submitFormResponse", () => {
  const submit = () => submitFormResponse("my form", { answers: {} } as never);

  it("returns the result of a successful submission", async () => {
    FakeXhr.reply = { status: 200, text: '{"ok":true,"responseId":"r1","endingId":"e","score":3}' };
    await expect(submit()).resolves.toEqual({
      kind: "ok",
      result: { ok: true, responseId: "r1", endingId: "e", score: 3 },
    });
    expect(last()).toMatchObject({ method: "POST", url: "/api/forms/my%20form/responses" });
    expect(last().headers["content-type"]).toBe("application/json");
  });

  it("returns field errors for a 400, with the message when given", async () => {
    FakeXhr.reply = {
      status: 400,
      text: '{"errors":{"a":{"code":"required"}},"message":"Fix it"}',
    };
    await expect(submit()).resolves.toEqual({
      kind: "invalid",
      errors: { a: { code: "required" } },
      message: "Fix it",
    });
    FakeXhr.reply = { status: 400, text: '{"errors":{}}' };
    await expect(submit()).resolves.toEqual({ kind: "invalid", errors: {}, message: undefined });
    FakeXhr.reply = { status: 400, text: '{"message":"Bad"}' };
    await expect(submit()).resolves.toEqual({ kind: "failed", message: "Bad" });
  });

  it("maps a 409 to the reason the form is unavailable", async () => {
    const reason = async (body: Record<string, unknown>) => {
      FakeXhr.reply = { status: 409, text: JSON.stringify(body) };
      return submit();
    };
    await expect(reason({ reason: "closed" })).resolves.toEqual({
      kind: "conflict",
      reason: "closed",
    });
    await expect(reason({ message: "One response per device" })).resolves.toEqual({
      kind: "conflict",
      reason: "already",
    });
    await expect(reason({ code: "duplicate" })).resolves.toEqual({
      kind: "conflict",
      reason: "already",
    });
    await expect(reason({ message: "Response limit reached" })).resolves.toEqual({
      kind: "conflict",
      reason: "limit_reached",
    });
    await expect(reason({ reason: "form is full" })).resolves.toEqual({
      kind: "conflict",
      reason: "limit_reached",
    });
    await expect(reason({ message: "Form not open yet" })).resolves.toEqual({
      kind: "conflict",
      reason: "not_open_yet",
    });
    await expect(reason({ code: "not_open" })).resolves.toEqual({
      kind: "conflict",
      reason: "not_open_yet",
    });
    await expect(reason({})).resolves.toEqual({ kind: "conflict", reason: "closed" });
    await expect(reason({ message: 5 })).resolves.toEqual({ kind: "conflict", reason: "closed" });
  });

  it("treats a 409 about a file as a problem of this submission", async () => {
    FakeXhr.reply = { status: 409, text: '{"message":"This file was already used"}' };
    await expect(submit()).resolves.toEqual({
      kind: "failed",
      message: "This file was already used",
    });
  });

  it("fails on a network error, a server error and an answer without ok", async () => {
    FakeXhr.reply = "error";
    await expect(submit()).resolves.toEqual({ kind: "failed" });
    FakeXhr.reply = "abort";
    await expect(submit()).resolves.toEqual({ kind: "failed" });
    FakeXhr.reply = { status: 500, text: '{"message":"Oops"}' };
    await expect(submit()).resolves.toEqual({ kind: "failed", message: "Oops" });
    FakeXhr.reply = { status: 200, text: "{}" };
    await expect(submit()).resolves.toEqual({ kind: "failed", message: undefined });
    FakeXhr.reply = { status: 502, text: "<html>" };
    await expect(submit()).resolves.toEqual({ kind: "failed", message: undefined });
    FakeXhr.reply = { status: 500, text: "" };
    await expect(submit()).resolves.toEqual({ kind: "failed", message: undefined });
  });
});

describe("unlockForm", () => {
  it("returns the payload of a good passphrase", async () => {
    FakeXhr.reply = { status: 200, text: '{"state":"open","slug":"s"}' };
    await expect(unlockForm("s", "pw")).resolves.toEqual({
      kind: "ok",
      payload: { state: "open", slug: "s" },
    });
    expect(last().url).toBe("/api/forms/s/unlock");
    expect(JSON.parse(last().sent as string)).toEqual({ passphrase: "pw" });
  });

  it("reports a wrong passphrase and failures", async () => {
    FakeXhr.reply = { status: 401, text: "{}" };
    await expect(unlockForm("s", "pw")).resolves.toEqual({ kind: "wrong" });
    FakeXhr.reply = { status: 403, text: "{}" };
    await expect(unlockForm("s", "pw")).resolves.toEqual({ kind: "wrong" });
    FakeXhr.reply = { status: 500, text: "{}" };
    await expect(unlockForm("s", "pw")).resolves.toEqual({ kind: "failed" });
    FakeXhr.reply = { status: 0, text: "{}" };
    await expect(unlockForm("s", "pw")).resolves.toEqual({ kind: "failed" });
    FakeXhr.reply = { status: 200, text: "{}" };
    await expect(unlockForm("s", "pw")).resolves.toEqual({ kind: "failed" });
  });
});

describe("uploadFormFile", () => {
  const upload = (extra: Partial<Parameters<typeof uploadFormFile>[0]> = {}) =>
    uploadFormFile({
      slug: "my form",
      fieldId: "f/1",
      sessionId: "s 1",
      file: new Blob(["abc"], { type: "image/png" }),
      name: "my pic.png",
      ...extra,
    });
  const file = { key: "k", name: "n", size: 3, type: "image/png" };

  it("sends the file raw with encoded names and resolves to the stored file", async () => {
    const onProgress = vi.fn();
    FakeXhr.reply = { status: 200, text: JSON.stringify({ file }) };
    const pending = upload({ token: "tok", onProgress });
    await expect(pending).resolves.toEqual(file);
    expect(last()).toMatchObject({
      method: "POST",
      url: "/api/forms/my%20form/uploads?fieldId=f%2F1&sessionId=s%201",
    });
    expect(last().headers).toMatchObject({
      "content-type": "image/png",
      "x-file-name": "my%20pic.png",
      "x-form-token": "tok",
    });
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("falls back to a generic type and sends no token header without one", async () => {
    FakeXhr.reply = { status: 200, text: JSON.stringify({ file }) };
    await upload({ file: new Blob(["x"]) });
    expect(last().headers["content-type"]).toBe("application/octet-stream");
    expect(last().headers["x-form-token"]).toBeUndefined();
  });

  it("reports the fraction of the upload while it runs", async () => {
    FakeXhr.hold = true;
    const onProgress = vi.fn();
    const pending = upload({ onProgress });
    last().upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 });
    last().upload.onprogress?.({ lengthComputable: false, loaded: 2, total: 4 });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0.25);
    last().status = 200;
    last().responseText = JSON.stringify({ file });
    last().onload?.();
    await pending;
    const noCallback = upload();
    last().upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
    last().status = 200;
    last().responseText = JSON.stringify({ file });
    last().onload?.();
    await noCallback;
  });

  it("rejects with the message and status of a refusal", async () => {
    FakeXhr.reply = { status: 413, text: '{"message":"Too big"}' };
    await expect(upload()).rejects.toMatchObject({
      message: "Too big",
      status: 413,
      name: "FormUploadError",
    });
    FakeXhr.reply = { status: 500, text: "garbage" };
    await expect(upload()).rejects.toMatchObject({ message: "Upload failed", status: 500 });
    FakeXhr.reply = { status: 200, text: "{}" };
    await expect(upload()).rejects.toMatchObject({ message: "Upload failed", status: 200 });
    FakeXhr.reply = { status: 200, text: "" };
    await expect(upload()).rejects.toBeInstanceOf(FormUploadError);
  });

  it("rejects with status 0 on a network error or an abort", async () => {
    FakeXhr.reply = "error";
    await expect(upload()).rejects.toMatchObject({ message: "Network error", status: 0 });
    FakeXhr.reply = "abort";
    await expect(upload()).rejects.toMatchObject({ message: "Aborted", status: 0 });
  });

  it("aborts the request when the signal fires", async () => {
    FakeXhr.hold = true;
    const controller = new AbortController();
    const pending = upload({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ message: "Aborted", status: 0 });
    expect(last().aborted).toBe(true);
  });
});

describe("autosave", () => {
  const draft = { answers: { a: "x" }, trail: ["start"], startedAt: "2024-03-05T10:00:00.000Z" };

  it("saves, loads and clears a draft", () => {
    const one = slug();
    expect(loadAutosave(one)).toBeNull();
    saveAutosave(one, draft);
    expect(loadAutosave(one)).toMatchObject(draft);
    expect(JSON.parse(local.data.get(`mgm-form-draft:${one}`) ?? "{}").savedAt).toMatch(/^\d{4}-/);
    clearAutosave(one);
    expect(loadAutosave(one)).toBeNull();
  });

  it("forgets a draft older than 30 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-05T10:00:00Z"));
    const one = slug();
    saveAutosave(one, draft);
    vi.setSystemTime(new Date("2024-04-03T10:00:00Z"));
    expect(loadAutosave(one)).not.toBeNull();
    vi.setSystemTime(new Date("2024-04-05T10:00:00Z"));
    expect(loadAutosave(one)).toBeNull();
  });

  it("ignores drafts of the wrong shape or broken JSON", () => {
    const one = slug();
    const key = `mgm-form-draft:${one}`;
    for (const raw of [
      "null",
      "{broken",
      '{"answers":"x","trail":[]}',
      '{"answers":{},"trail":"x"}',
    ]) {
      local.data.set(key, raw);
      expect(loadAutosave(one), raw).toBeNull();
    }
  });
});
