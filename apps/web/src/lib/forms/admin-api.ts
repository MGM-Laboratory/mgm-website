/**
 * Browser-side calls to the forms admin routes (`/api/admin/forms/**`), each
 * gated by the `forms` permission in its Next route handler. Every helper
 * throws a `FormsApiError` carrying the API's message on a non-2xx answer.
 */

import type {
  FormAnalytics,
  FormAnalyticsRange,
  FormApplyInput,
  FormBulkInput,
  FormCreateInput,
  FormRecord,
  FormResponsePatch,
  FormResponseRecord,
  FormSummary,
  FormUpdateInput,
  FormVisit,
} from "@repo/shared";

export class FormsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FormsApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && typeof init.body === "string"
        ? { "content-type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { message?: unknown; error?: unknown };
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(" ")
      : typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : `Request failed (${response.status}).`;
    throw new FormsApiError(message, response.status);
  }
  return body as T;
}

const base = "/api/admin/forms";
const enc = encodeURIComponent;

export const formsAdminApi = {
  list: () => request<{ forms: FormSummary[] }>(base),
  create: (input: FormCreateInput) =>
    request<{ form: FormRecord }>(base, { method: "POST", body: JSON.stringify(input) }),
  get: (id: string) => request<{ form: FormRecord }>(`${base}/${enc(id)}`),
  update: (id: string, input: FormUpdateInput) =>
    request<{ form: FormRecord }>(`${base}/${enc(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => request<{ ok: true }>(`${base}/${enc(id)}`, { method: "DELETE" }),
  duplicate: (id: string) =>
    request<{ form: FormRecord }>(`${base}/${enc(id)}/duplicate`, { method: "POST" }),
  slugAvailable: (slug: string, excludeId?: string) =>
    request<{ available: boolean; suggestion: string }>(
      `${base}/slug-available?slug=${enc(slug)}${excludeId ? `&excludeId=${enc(excludeId)}` : ""}`,
    ),
  /** A PNG, JPEG, WebP or GIF as a data URL (at most 6 MB decoded). */
  uploadImage: (id: string, dataUrl: string) =>
    request<{ key: string }>(`${base}/${enc(id)}/media`, {
      method: "POST",
      body: JSON.stringify({ image: dataUrl }),
    }),
  /** An MP4 or WebM file, streamed raw. */
  uploadVideo: (id: string, file: File) =>
    request<{ key: string }>(`${base}/${enc(id)}/media`, {
      method: "POST",
      body: file,
      headers: { "content-type": file.type },
    }),
  responses: (id: string) =>
    request<{ responses: FormResponseRecord[] }>(`${base}/${enc(id)}/responses`),
  patchResponse: (id: string, responseId: string, patch: FormResponsePatch) =>
    request<{ response: FormResponseRecord }>(`${base}/${enc(id)}/responses/${enc(responseId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  bulk: (id: string, input: FormBulkInput) =>
    request<{ ok: true; count: number }>(`${base}/${enc(id)}/responses/bulk`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  apply: (id: string, input: FormApplyInput) =>
    request<{ ok: true; count: number }>(`${base}/${enc(id)}/responses/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  analytics: (id: string, range: FormAnalyticsRange, tzOffsetMinutes: number) =>
    request<FormAnalytics>(
      `${base}/${enc(id)}/analytics?range=${enc(range)}&tzOffset=${tzOffsetMinutes}`,
    ),
  visits: (id: string, limit = 200) =>
    request<{ visits: FormVisit[] }>(`${base}/${enc(id)}/visits?limit=${limit}`),
};

/** A respondent's uploaded file: opens (302) or, with `download`, streams through the site. */
export function formFileUrl(formId: string, key: string, mode: "view" | "download" = "view") {
  return `${base}/${enc(formId)}/files/${enc(key)}${mode === "download" ? "?download=1" : ""}`;
}

/** A design image or video of a form (public once the form is published). */
export function formMediaUrl(key: string) {
  return `/api/forms/media/${enc(key)}`;
}
