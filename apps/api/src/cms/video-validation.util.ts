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
