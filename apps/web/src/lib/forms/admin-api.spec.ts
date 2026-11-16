// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormsApiError, formFileUrl, formMediaUrl, formsAdminApi } from "./admin-api";

type Reply = { status: number; text?: string } | "error";

class FakeXhr {
  static instances: FakeXhr[] = [];
  static reply: Reply | ((xhr: FakeXhr) => Reply) = { status: 200, text: "{}" };
  method = "";
  url = "";
  headers: Record<string, string> = {};
  responseType = "";
  responseText = "";
  status = 0;
  sent: unknown = undefined;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
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
  send(body: unknown) {
    this.sent = body;
    const reply = typeof FakeXhr.reply === "function" ? FakeXhr.reply(this) : FakeXhr.reply;
    queueMicrotask(() => {
      if (reply === "error") {
        this.onerror?.();
        return;
      }
      this.status = reply.status;
      this.responseText = reply.text ?? "";
      this.onload?.();
    });
  }
}

const last = () => FakeXhr.instances[FakeXhr.instances.length - 1];

beforeEach(() => {
  FakeXhr.instances = [];
  FakeXhr.reply = { status: 200, text: "{}" };
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request handling", () => {
  it("resolves with the parsed body of a 2xx answer", async () => {
    FakeXhr.reply = { status: 200, text: '{"forms":[1]}' };
    await expect(formsAdminApi.list()).resolves.toEqual({ forms: [1] });
    expect(last()).toMatchObject({ method: "GET", url: "/api/admin/forms", responseType: "text" });
    expect(last().headers["content-type"]).toBeUndefined();
  });

  it("treats an empty or broken body of a 2xx answer as an empty object", async () => {
    FakeXhr.reply = { status: 204, text: "" };
    await expect(formsAdminApi.list()).resolves.toEqual({});
    FakeXhr.reply = { status: 200, text: "<html>" };
    await expect(formsAdminApi.list()).resolves.toEqual({});
  });

  it("rejects with the message of the API, joined when it is a list", async () => {
    FakeXhr.reply = { status: 400, text: '{"message":["title is required","slug is bad"]}' };
    const error = await formsAdminApi.list().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FormsApiError);
    expect(error).toMatchObject({
      message: "title is required slug is bad",
      status: 400,
      name: "FormsApiError",
    });
    FakeXhr.reply = { status: 403, text: '{"message":"Nope"}' };
    await expect(formsAdminApi.list()).rejects.toMatchObject({ message: "Nope", status: 403 });
  });

  it("falls back to the error field, then to a generic message", async () => {
    FakeXhr.reply = { status: 500, text: '{"error":"Internal"}' };
    await expect(formsAdminApi.list()).rejects.toMatchObject({ message: "Internal", status: 500 });
    FakeXhr.reply = { status: 502, text: '{"message":5}' };
    await expect(formsAdminApi.list()).rejects.toMatchObject({ message: "Request failed (502)." });
    FakeXhr.reply = { status: 500, text: "not json" };
    await expect(formsAdminApi.list()).rejects.toMatchObject({ message: "Request failed (500)." });
    FakeXhr.reply = { status: 404, text: "" };
    await expect(formsAdminApi.list()).rejects.toMatchObject({ message: "Request failed (404)." });
  });

  it("rejects with status 0 on a network error", async () => {
    FakeXhr.reply = "error";
    await expect(formsAdminApi.list()).rejects.toMatchObject({
      message: "The network request failed.",
      status: 0,
    });
  });
});

describe("the routes", () => {
  it("sends JSON bodies with the right method and an encoded id", async () => {
    await formsAdminApi.create({ title: "T" } as never);
    expect(last()).toMatchObject({
      method: "POST",
      url: "/api/admin/forms",
      sent: '{"title":"T"}',
    });
    expect(last().headers["content-type"]).toBe("application/json");
    await formsAdminApi.update("a/b", { title: "X" } as never);
    expect(last()).toMatchObject({ method: "PUT", url: "/api/admin/forms/a%2Fb" });
    await formsAdminApi.get("a b");
    expect(last()).toMatchObject({ method: "GET", url: "/api/admin/forms/a%20b" });
    await formsAdminApi.remove("x");
    expect(last()).toMatchObject({ method: "DELETE", url: "/api/admin/forms/x" });
    await formsAdminApi.duplicate("x");
    expect(last()).toMatchObject({
      method: "POST",
      url: "/api/admin/forms/x/duplicate",
      sent: null,
    });
    await formsAdminApi.patchResponse("f", "r/1", { starred: true });
    expect(last()).toMatchObject({ method: "PATCH", url: "/api/admin/forms/f/responses/r%2F1" });
    await formsAdminApi.bulk("f", { action: "star", ids: ["a"] } as never);
    expect(last()).toMatchObject({ method: "POST", url: "/api/admin/forms/f/responses/bulk" });
    await formsAdminApi.apply("f", { changes: [] } as never);
    expect(last()).toMatchObject({ method: "POST", url: "/api/admin/forms/f/responses/apply" });
  });

  it("builds query strings", async () => {
    await formsAdminApi.slugAvailable("my slug");
    expect(last().url).toBe("/api/admin/forms/slug-available?slug=my%20slug");
    await formsAdminApi.slugAvailable("s", "id/1");
    expect(last().url).toBe("/api/admin/forms/slug-available?slug=s&excludeId=id%2F1");
    await formsAdminApi.analytics("f", "30d" as never, -420);
    expect(last().url).toBe("/api/admin/forms/f/analytics?range=30d&tzOffset=-420");
    await formsAdminApi.visits("f");
    expect(last().url).toBe("/api/admin/forms/f/visits?limit=200");
    await formsAdminApi.visits("f", 5);
    expect(last().url).toBe("/api/admin/forms/f/visits?limit=5");
  });

  it("uploads an image as JSON and a video raw with its type", async () => {
    await formsAdminApi.uploadImage("f", "data:image/png;base64,AAAA");
    expect(last()).toMatchObject({ method: "POST", url: "/api/admin/forms/f/media" });
    expect(JSON.parse(last().sent as string)).toEqual({ image: "data:image/png;base64,AAAA" });
    const file = new Blob(["x"], { type: "video/mp4" }) as File;
    await formsAdminApi.uploadVideo("f", file);
    expect(last().sent).toBe(file);
    expect(last().headers["content-type"]).toBe("video/mp4");
  });
});

describe("responses", () => {
  it("follows the cursor page by page and joins every page", async () => {
    const pages = [
      { responses: [{ id: "a" }, { id: "b" }], nextCursor: "c1" },
      { responses: [{ id: "c" }], nextCursor: "c/2" },
      { responses: [{ id: "d" }], nextCursor: null },
    ];
    FakeXhr.reply = () => ({
      status: 200,
      text: JSON.stringify(pages[FakeXhr.instances.length - 1]),
    });
    const { responses } = await formsAdminApi.responses("f");
    expect(responses.map((item) => (item as { id: string }).id)).toEqual(["a", "b", "c", "d"]);
    expect(FakeXhr.instances.map((xhr) => xhr.url)).toEqual([
      "/api/admin/forms/f/responses",
      "/api/admin/forms/f/responses?cursor=c1",
      "/api/admin/forms/f/responses?cursor=c%2F2",
    ]);
  });

  it("stops after 200 pages even when the cursor never ends", async () => {
    FakeXhr.reply = { status: 200, text: '{"responses":[{"id":"x"}],"nextCursor":"again"}' };
    const { responses } = await formsAdminApi.responses("f");
    expect(responses).toHaveLength(200);
    expect(FakeXhr.instances).toHaveLength(200);
  });

  it("rejects when a page fails", async () => {
    FakeXhr.reply = { status: 500, text: "{}" };
    await expect(formsAdminApi.responses("f")).rejects.toBeInstanceOf(FormsApiError);
  });
});

describe("file and media urls", () => {
  it("encodes the ids and adds the download flag", () => {
    expect(formFileUrl("f 1", "a/b.pdf")).toBe("/api/admin/forms/f%201/files/a%2Fb.pdf");
    expect(formFileUrl("f", "k", "view")).toBe("/api/admin/forms/f/files/k");
    expect(formFileUrl("f", "k", "download")).toBe("/api/admin/forms/f/files/k?download=1");
    expect(formMediaUrl("a b/c.png")).toBe("/api/forms/media/a%20b%2Fc.png");
  });
});
