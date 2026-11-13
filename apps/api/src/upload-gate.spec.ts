import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { requireAdminPassphrase } from "./upload-gate.js";

const SECRET = "the-admin-passphrase-for-the-test";

function run(method: string, headers: Record<string, unknown>, expected = SECRET) {
  const request = { method, headers } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const response = { status, setHeader } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  requireAdminPassphrase(expected)(request, response, next);
  return { next, status, json, setHeader };
}

describe("requireAdminPassphrase", () => {
  it("lets a request with the right passphrase through", () => {
    const { next, status } = run("POST", { "x-cms-passphrase": SECRET });

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("answers 401 and closes the connection when the header is missing", () => {
    const { next, status, json, setHeader } = run("POST", {});

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      message: "Unauthorized",
      error: "Unauthorized",
      statusCode: 401,
    });
    expect(setHeader).toHaveBeenCalledWith("Connection", "close");
  });

  it("answers 401 for a wrong passphrase", () => {
    const { next, status } = run("POST", { "x-cms-passphrase": "not-the-passphrase" });

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("answers 401 for a repeated header, which Node joins into an array in some cases", () => {
    const { next, status } = run("POST", { "x-cms-passphrase": [SECRET, SECRET] });

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("answers 401 when no passphrase is configured, even for an empty header", () => {
    const { next, status } = run("POST", { "x-cms-passphrase": "" }, "");

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("lets a read through, because the same path prefix also serves public downloads", () => {
    const { next, status } = run("GET", {});

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("lets a preflight request through, because it never carries the header", () => {
    const { next, status } = run("OPTIONS", {});

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
