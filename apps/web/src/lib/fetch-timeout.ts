import "server-only";

/**
 * A fetch that gives up when the response headers have not arrived after `ms` milliseconds. Only the wait for the headers is
 * limited. The body is not, so a long download or a stream is not cut off. A server that accepts the connection and then
 * stalls would otherwise hold the request, and the page that waits for it, until the socket gives up after minutes.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit | undefined,
  ms: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`No answer within ${ms} ms`, "TimeoutError"));
  }, ms);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    return await fetch(input, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The time to wait for the API to answer, in milliseconds. A read is quick, a write may carry a larger body. */
export const API_READ_TIMEOUT_MS = 10_000;
export const API_WRITE_TIMEOUT_MS = 30_000;
/** A large file goes through the server as a stream, and the API answers only after it has stored the file. */
export const API_UPLOAD_TIMEOUT_MS = 30 * 60_000;
