import "server-only";

/**
 * A small limit for failed sign in attempts, kept in the memory of this server. The API counts the guesses of delegated
 * accounts, but the check of the superadmin passphrase never leaves the web server, so nothing else slows it down.
 * Each copy of the web server counts on its own and a restart empties the counters.
 */
const WINDOW_MS = 60_000;
const MAX_FAILURES = 10;
/** The most visitors that are tracked at once. The oldest entry goes first, so a flood of addresses cannot grow the map. */
const MAX_KEYS = 5_000;

const failures = new Map<string, number[]>();

function recent(key: string, now: number) {
  const list = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (list.length > 0) failures.set(key, list);
  else failures.delete(key);
  return list;
}

/** False when this visitor has already failed `MAX_FAILURES` times in the last minute. */
export function loginAllowed(key: string, now = Date.now()) {
  return recent(key, now).length < MAX_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const list = recent(key, now);
  list.push(now);
  failures.delete(key);
  failures.set(key, list);
  while (failures.size > MAX_KEYS) {
    const oldest = failures.keys().next().value;
    if (oldest === undefined) break;
    failures.delete(oldest);
  }
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}
