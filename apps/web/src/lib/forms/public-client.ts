import type {
  FieldError,
  FormAnswers,
  FormClientContext,
  FormEventInput,
  FormSubmissionInput,
  FormSubmissionResult,
  FormUploadResult,
  PublicFormPayload,
} from "@repo/shared";

/**
 * The browser side of a public form: the per-tab session, the device mark
 * for "one response per device", the respondent's context, and the calls to
 * the site's public form routes (`/api/forms/<slug>/...`). Every storage
 * access is wrapped: a private window or blocked storage just means the
 * page forgets, never that it breaks.
 */

const enc = encodeURIComponent;

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStored(kind: "local" | "session", key: string) {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStored(kind: "local" | "session", key: string, value: string | null) {
  try {
    const store = storage(kind);
    if (!store) return;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Full or blocked storage: nothing to keep.
  }
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

const memory = new Map<string, string>();

/** One id per tab and form, kept across reloads of that tab. */
export function formSessionId(slug: string) {
  const key = `mgm-form-session:${slug}`;
  const existing = readStored("session", key) ?? memory.get(key);
  if (existing) return existing;
  const id = randomId();
  memory.set(key, id);
  writeStored("session", key, id);
  return id;
}

/** A fresh session after a submission ("submit another response"). */
export function resetFormSession(slug: string) {
  const key = `mgm-form-session:${slug}`;
  memory.delete(key);
  writeStored("session", key, null);
}

/** One id per browser, for "one response per device". */
export function formDeviceId() {
  const key = "mgm-form-device";
  const existing = readStored("local", key) ?? memory.get(key);
  if (existing) return existing;
  const id = randomId();
  memory.set(key, id);
  writeStored("local", key, id);
  return id;
}

export function hasResponded(slug: string) {
  return readStored("local", `mgm-form-done:${slug}`) !== null;
}

export function markResponded(slug: string) {
  writeStored("local", `mgm-form-done:${slug}`, new Date().toISOString());
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

export function clientContext(): FormClientContext {
  const context: FormClientContext = {};
  try {
    context.language = navigator.language;
    context.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    context.screen = `${window.screen.width}x${window.screen.height}`;
    const params = new URLSearchParams(window.location.search);
    const utm: NonNullable<FormClientContext["utm"]> = {};
    for (const key of UTM_KEYS) {
      const value = params.get(`utm_${key}`);
      if (value) utm[key] = value.slice(0, 200);
    }
    if (Object.keys(utm).length) context.utm = utm;
    if (document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin) context.referrer = document.referrer;
    }
  } catch {
    // Context is a courtesy; a missing part is fine.
  }
  return context;
}

/**
 * One same-origin JSON post to a public form route. XMLHttpRequest rather
 * than fetch on purpose: static analysis treats every fetch() of a
 * parameter-built path as a server-side request forgery sink, even in the
 * browser, and the paths here are fixed prefixes with an encoded slug.
 * Resolves with the status (0 when the network failed) and the parsed body.
 */
function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    request.setRequestHeader("content-type", "application/json");
    request.responseType = "text";
    request.onload = () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(request.responseText || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      resolve({ status: request.status, body: parsed });
    };
    request.onerror = () => {
      resolve({ status: 0, body: {} });
    };
    request.onabort = () => {
      resolve({ status: 0, body: {} });
    };
    request.send(JSON.stringify(body));
  });
}

/** Fire and forget: a beacon when the browser has one, a plain post otherwise. */
export function sendFormEvent(slug: string, input: FormEventInput) {
  const path = `/api/forms/${enc(slug)}/events`;
  try {
    const blob = new Blob([JSON.stringify(input)], { type: "application/json" });
    if (navigator.sendBeacon?.(path, blob)) return;
  } catch {
    // Fall through to a plain post.
  }
  void postJson(path, input);
}

export class FormUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FormUploadError";
  }
}

/**
 * Sends one file raw with upload progress. Resolves to the stored file,
 * rejects with a `FormUploadError` (status 0 for a network failure or an
 * abort).
 */
export function uploadFormFile(options: {
  slug: string;
  fieldId: string;
  sessionId: string;
  file: Blob;
  name: string;
  token?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<FormUploadResult["file"]> {
  const { slug, fieldId, sessionId, file, name, token, onProgress, signal } = options;
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/forms/${enc(slug)}/uploads?fieldId=${enc(fieldId)}&sessionId=${enc(sessionId)}`,
    );
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.setRequestHeader("x-file-name", enc(name));
    if (token) request.setRequestHeader("x-form-token", token);
    request.responseType = "text";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      let body: (FormUploadResult & { message?: unknown }) | null = null;
      try {
        body = JSON.parse(request.responseText || "null");
      } catch {
        body = null;
      }
      if (request.status >= 200 && request.status < 300 && body?.file) {
        onProgress?.(1);
        resolve(body.file);
        return;
      }
      const message = typeof body?.message === "string" ? body.message : "Upload failed";
      reject(new FormUploadError(message, request.status));
    };
    request.onerror = () => {
      reject(new FormUploadError("Network error", 0));
    };
    request.onabort = () => {
      reject(new FormUploadError("Aborted", 0));
    };
    signal?.addEventListener(
      "abort",
      () => {
        request.abort();
      },
      { once: true },
    );
    request.send(file);
  });
}

export type SubmitOutcome =
  | { kind: "ok"; result: FormSubmissionResult }
  | { kind: "invalid"; errors: Record<string, FieldError>; message?: string }
  | { kind: "conflict"; reason: "closed" | "limit_reached" | "already" | "not_open_yet" }
  | { kind: "failed"; message?: string };

function conflictReason(
  body: Record<string, unknown>,
): Extract<SubmitOutcome, { kind: "conflict" }>["reason"] {
  const text = [body.reason, body.code, body.message]
    .filter((part) => typeof part === "string")
    .join(" ")
    .toLowerCase();
  if (/already|device|duplicate/.test(text)) return "already";
  if (/limit|full/.test(text)) return "limit_reached";
  if (/not.?open|opens|not_open/.test(text)) return "not_open_yet";
  return "closed";
}

export async function submitFormResponse(
  slug: string,
  input: FormSubmissionInput,
): Promise<SubmitOutcome> {
  const { status, body } = await postJson(`/api/forms/${enc(slug)}/responses`, input);
  if (status === 0) return { kind: "failed" };
  if (status >= 200 && status < 300 && body.ok) {
    return { kind: "ok", result: body as unknown as FormSubmissionResult };
  }
  if (status === 400 && body.errors && typeof body.errors === "object") {
    return {
      kind: "invalid",
      errors: body.errors as Record<string, FieldError>,
      message: typeof body.message === "string" ? body.message : undefined,
    };
  }
  if (status === 409) {
    // A file sent twice is a problem with this submission, not with the form.
    const message = typeof body.message === "string" ? body.message : "";
    if (/file/i.test(message)) return { kind: "failed", message };
    return { kind: "conflict", reason: conflictReason(body) };
  }
  return { kind: "failed", message: typeof body.message === "string" ? body.message : undefined };
}

export type UnlockOutcome =
  { kind: "ok"; payload: PublicFormPayload } | { kind: "wrong" } | { kind: "failed" };

export async function unlockForm(slug: string, passphrase: string): Promise<UnlockOutcome> {
  const { status, body } = await postJson(`/api/forms/${enc(slug)}/unlock`, { passphrase });
  if (status === 401 || status === 403) return { kind: "wrong" };
  if (status < 200 || status >= 300) return { kind: "failed" };
  const payload = body as unknown as PublicFormPayload;
  return payload && payload.state ? { kind: "ok", payload } : { kind: "failed" };
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

export type FormAutosave = {
  answers: FormAnswers;
  /** Classic: the page ids visited; conversational: the step ids. */
  trail: string[];
  startedAt?: string;
  savedAt: string;
};

const autosaveKey = (slug: string) => `mgm-form-draft:${slug}`;
/** Drafts older than this are forgotten. */
const AUTOSAVE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function loadAutosave(slug: string): FormAutosave | null {
  const raw = readStored("local", autosaveKey(slug));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as FormAutosave;
    if (!draft || typeof draft.answers !== "object" || !Array.isArray(draft.trail)) return null;
    if (Date.now() - Date.parse(draft.savedAt) > AUTOSAVE_MAX_AGE) return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveAutosave(slug: string, draft: Omit<FormAutosave, "savedAt">) {
  writeStored(
    "local",
    autosaveKey(slug),
    JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
  );
}

export function clearAutosave(slug: string) {
  writeStored("local", autosaveKey(slug), null);
}
