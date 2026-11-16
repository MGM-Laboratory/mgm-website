// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cmsApi: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet }) }));
vi.mock("@/lib/cms-api", () => ({ cmsApi: mocks.cmsApi }));

import {
  FORM_TOKEN_MAX_AGE_SECONDS,
  fetchPublicForm,
  formTokenCookieName,
  isFormSlug,
  readFormToken,
} from "./public-server";

beforeEach(() => {
  mocks.cookieGet.mockReset();
  mocks.cmsApi.mockReset();
});

describe("isFormSlug and the cookie name", () => {
  it("accepts lowercase hyphenated slugs and nothing else", () => {
    expect(isFormSlug("orbit-maple-7k2m")).toBe(true);
    expect(isFormSlug("a")).toBe(true);
    expect(isFormSlug("")).toBe(false);
    expect(isFormSlug("-a")).toBe(false);
    expect(isFormSlug("a--b")).toBe(false);
    expect(isFormSlug("A")).toBe(false);
    expect(isFormSlug("../etc")).toBe(false);
    expect(isFormSlug("a".repeat(81))).toBe(false);
    expect(isFormSlug("a".repeat(80))).toBe(true);
  });

  it("names the cookie after the slug and lives twelve hours", () => {
    expect(formTokenCookieName("my-form")).toBe("mgm_form_my-form");
    expect(FORM_TOKEN_MAX_AGE_SECONDS).toBe(43_200);
  });
});

describe("readFormToken", () => {
  it("reads the token cookie of a slug", async () => {
    mocks.cookieGet.mockReturnValue({ value: "tok" });
    await expect(readFormToken("my-form")).resolves.toBe("tok");
    expect(mocks.cookieGet).toHaveBeenCalledWith("mgm_form_my-form");
  });

  it("returns nothing for no cookie, an empty cookie or a bad slug", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(readFormToken("my-form")).resolves.toBeUndefined();
    mocks.cookieGet.mockReturnValue({ value: "" });
    await expect(readFormToken("my-form")).resolves.toBeUndefined();
    mocks.cookieGet.mockClear();
    await expect(readFormToken("Bad Slug")).resolves.toBeUndefined();
    expect(mocks.cookieGet).not.toHaveBeenCalled();
  });
});

describe("fetchPublicForm", () => {
  const answer = (status: number, body: unknown = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });

  it("returns the payload and sends the token and a timeout", async () => {
    mocks.cmsApi.mockResolvedValue(answer(200, { state: "open", slug: "my-form" }));
    await expect(fetchPublicForm("my-form", "tok")).resolves.toEqual({
      state: "open",
      slug: "my-form",
    });
    const [path, init] = mocks.cmsApi.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/forms/public/my-form");
    expect(init.headers).toEqual({ "x-form-token": "tok" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no token header when the visitor has none", async () => {
    mocks.cmsApi.mockResolvedValue(answer(200, {}));
    await fetchPublicForm("my-form");
    expect((mocks.cmsApi.mock.calls[0][1] as RequestInit).headers).toEqual({});
  });

  it("returns null for a 404 and for a slug that cannot exist, without a request", async () => {
    mocks.cmsApi.mockResolvedValue(answer(404));
    await expect(fetchPublicForm("my-form")).resolves.toBeNull();
    mocks.cmsApi.mockClear();
    await expect(fetchPublicForm("Not A Slug")).resolves.toBeNull();
    expect(mocks.cmsApi).not.toHaveBeenCalled();
  });

  it("throws for any other failure so the page shows an error and not a 404", async () => {
    mocks.cmsApi.mockResolvedValue(answer(500));
    await expect(fetchPublicForm("my-form")).rejects.toThrow("Public form could not be read");
    mocks.cmsApi.mockResolvedValue(answer(403));
    await expect(fetchPublicForm("my-form")).rejects.toThrow();
  });
});
