// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { expect } from "@playwright/test";
import { test } from "./support/csp-guard";

test.describe("healthz", () => {
  test("answers ok with no caching and without a page", async ({ request }) => {
    const response = await request.get("/healthz");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
