import "server-only";

import { ipBucket } from "@/lib/ip-bucket";

/**
 * A small limit for sign in attempts, kept in the memory of this server. The API counts the guesses of delegated accounts, but
 * the check of the superadmin passphrase never leaves the web server, so nothing else slows it down.
 *
 * An attempt takes its place in the count before any asynchronous work starts, so a burst of requests from one visitor cannot
 * all pass the check before the first of them is counted, and an attempt that ends in an error stays counted. A right
 * passphrase gives its place back. Each copy of the web server counts on its own, and a restart empties the counters.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
/** The most visitors that are tracked at once. The oldest entry goes first, so a flood of addresses cannot grow the map. */
const MAX_KEYS = 5_000;

const attempts = new Map<string, number[]>();

function recent(key: string, now: number) {
  const list = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (list.length > 0) attempts.set(key, list);
  else attempts.delete(key);
  return list;
}

/** Takes one place for this address and returns true, or returns false when the last minute already holds ten attempts. */
export function reserveLoginAttempt(address: string, now = Date.now()) {
  const key = ipBucket(address);
  const list = recent(key, now);
  if (list.length >= MAX_ATTEMPTS) return false;
  list.push(now);
  attempts.delete(key);
  attempts.set(key, list);
  while (attempts.size > MAX_KEYS) {
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
  return true;
}

/** Gives back the newest place of this address, for an attempt that was not a wrong guess. */
export function releaseLoginAttempt(address: string, now = Date.now()) {
  const key = ipBucket(address);
  const list = recent(key, now);
  list.pop();
  if (list.length > 0) attempts.set(key, list);
  else attempts.delete(key);
}

/** The places that are in use for this address, for the tests. */
export function loginAttemptCount(address: string, now = Date.now()) {
  return recent(ipBucket(address), now).length;
}
