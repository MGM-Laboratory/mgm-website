import { BadRequestException } from "@nestjs/common";
import type { Request, Response } from "express";

import type { StorageService } from "../storage/storage.service.js";

/**
 * Shared by every CMS controller that accepts a raw video upload (projects'
 * per-record demo video, home's singleton video, …) — factored out so a new
 * controller doesn't re-spell the same magic-byte check closely enough to be
 * flagged as a clone of an existing one.
 */
export function isValidVideo(buffer: Buffer, contentType: string) {
  // Buffer.isBuffer() at the call site already proves this isn't array-shaped;
  // CodeQL's request-parameter model doesn't know about main.ts's raw-body middleware.
  if (contentType === "video/mp4") {
    // codeql[js/type-confusion-through-parameter-tampering]
    return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (contentType === "video/webm") {
    return (
      // codeql[js/type-confusion-through-parameter-tampering]
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }
  return false;
}

/**
 * Content-type/size/magic-byte checks for a raw streamed video upload body
 * (the global raw-body middleware in main.ts enforces the same size ceiling
 * at the HTTP layer). Throws a BadRequestException with a caller-supplied
 * noun ("video" / "demo video") on any failure; returns the validated buffer
 * plus the content-type/extension pair to mint a storage key from.
 */
export function parseVideoUploadBody(
  request: Request,
  maxBytes: number,
  noun = "video",
): { body: Buffer; contentType: "video/mp4" | "video/webm"; extension: "mp4" | "webm" } {
  const contentType = String(request.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  // CodeQL's type-confusion query only recognizes typeof/Array.isArray checks
  // as sanitizing barriers, not Buffer.isBuffer() below — this rejects the
  // array shape its model worries about before that real (sufficient) check.
  if (Array.isArray(request.body)) {
    throw new BadRequestException(`The ${noun} must be an MP4 or WebM file.`);
  }
  const body = Buffer.isBuffer(request.body) ? request.body : undefined;
  if ((contentType !== "video/mp4" && contentType !== "video/webm") || !body?.length) {
    throw new BadRequestException(`The ${noun} must be an MP4 or WebM file.`);
  }
  // body is a real Buffer here (guarded above), not an attacker-tamperable
  // array; see isValidVideo()'s own note.
  // codeql[js/type-confusion-through-parameter-tampering]
  if (body.length > maxBytes) {
    throw new BadRequestException(
      `The video must be under ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    );
  }
  if (!isValidVideo(body, contentType)) {
    throw new BadRequestException("That file is not a valid video.");
  }
  return { body, contentType, extension: contentType === "video/mp4" ? "mp4" : "webm" };
}

/** Resolves a validated video key to a signed URL and redirects the response to it. */
export async function redirectToSignedVideoUrl(
  response: Response,
  storage: StorageService,
  key: string,
): Promise<void> {
  let url: string;
  try {
    url = await storage.getSignedDownloadUrl(key, 60 * 60);
  } catch {
    throw new BadRequestException("Media storage is not configured in this environment.");
  }
  response.redirect(url);
}
