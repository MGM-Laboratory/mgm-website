export type ApplyPayload = {
  applicantType: "ub-student" | "general";
  fullName: string;
  email: string;
  phoneCountry: string;
  phoneNumber: string;
  nim?: string;
  faculty?: string;
  motivation: string;
  agreedToTerms: boolean;
  cvFile: File;
};

export type ApplyResult = { ok: true } | { ok: false; message: string };

function apiMessage(xhr: XMLHttpRequest, fallback: string) {
  try {
    const body = JSON.parse(xhr.responseText) as { message?: unknown };
    return typeof body.message === "string" && body.message ? body.message : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Submits an application through the same-origin proxy. XHR on purpose:
 * `upload.onprogress` reports real transfer progress for 100 MB CVs, which
 * fetch cannot provide even with streamed request bodies.
 */
export function submitApplication(
  jobSlug: string,
  payload: ApplyPayload,
  onProgress?: (fraction: number) => void,
): Promise<ApplyResult> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("applicantType", payload.applicantType);
    formData.append("fullName", payload.fullName);
    formData.append("email", payload.email);
    formData.append("phoneCountry", payload.phoneCountry);
    formData.append("phoneNumber", payload.phoneNumber);
    if (payload.applicantType === "ub-student") {
      formData.append("nim", payload.nim ?? "");
      formData.append("faculty", payload.faculty ?? "");
    }
    formData.append("motivation", payload.motivation);
    formData.append("agreedToTerms", payload.agreedToTerms ? "true" : "false");
    formData.append("cv", payload.cvFile);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/careers-cms/${encodeURIComponent(jobSlug)}/apply`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
      else
        resolve({
          ok: false,
          message: apiMessage(xhr, "We could not submit your application. Please try again."),
        });
    };
    xhr.onerror = () =>
      resolve({
        ok: false,
        message: "We could not reach the server. Check your connection and try again.",
      });
    xhr.send(formData);
  });
}
