import type { NextFunction, Request, Response } from "express";

import { safeEqual } from "./cms/admin-auth.util.js";

/**
 * Express middleware that refuses a request before its body is read, unless it carries the admin passphrase. The raw body
 * parsers for the admin uploads run after it, so a caller without the passphrase cannot make the server buffer a large body.
 * The controllers still check the passphrase themselves. This only moves the first check ahead of the body.
 */
export function requireAdminPassphrase(expected: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    // A preflight request has no body and never carries the header
    if (request.method === "OPTIONS") {
      next();
      return;
    }
    const header = request.headers["x-cms-passphrase"];
    const given = typeof header === "string" ? header : "";
    if (!expected || !safeEqual(given, expected)) {
      // Close the connection so the rest of an upload is dropped and not read
      response.setHeader("Connection", "close");
      response.status(401).json({ statusCode: 401, message: "Unauthorized" });
      return;
    }
    next();
  };
}
