// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({ options: { workerSrc: "" } }));

vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: worker.options }));

beforeEach(() => {
  worker.options.workerSrc = "";
  vi.resetModules();
});

describe("ensurePdfJsWorker", () => {
  it("points pdf.js at the bundled worker once", async () => {
    const { ensurePdfJsWorker } = await import("./pdfjs-client");

    ensurePdfJsWorker();
    const first = worker.options.workerSrc;
    expect(first).toMatch(/pdf\.worker\.min\.mjs$/);

    worker.options.workerSrc = "changed-elsewhere";
    ensurePdfJsWorker();
    expect(worker.options.workerSrc).toBe("changed-elsewhere");
  });
});
