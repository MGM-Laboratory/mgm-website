import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison, shared by every CMS controller's passphrase check. */
export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
