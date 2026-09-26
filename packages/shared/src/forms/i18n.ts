import type { FormLabelKey, FormLanguage } from "./schema.js";

/**
 * The built-in words of the public form, in English and Indonesian. A form
 * picks its language and may override any label (`settings.labels`).
 */
export const FORM_DEFAULT_LABELS: Record<FormLanguage, Record<FormLabelKey, string>> = {
  en: {
    start: "Start",
    next: "Next",
    back: "Back",
    submit: "Submit",
    required: "Required",
    optional: "Optional",
    other: "Other",
    pressEnter: "press Enter",
    chooseFile: "Choose a file",
    dropFiles: "or drop it here",
    uploading: "Uploading",
    selectPlaceholder: "Choose an option",
    searchPlaceholder: "Search",
    clear: "Clear",
    closed: "This form is closed",
    resume: "Continue where you left off",
    startOver: "Start over",
  },
  id: {
    start: "Mulai",
    next: "Lanjut",
    back: "Kembali",
    submit: "Kirim",
    required: "Wajib",
    optional: "Opsional",
    other: "Lainnya",
    pressEnter: "tekan Enter",
    chooseFile: "Pilih berkas",
    dropFiles: "atau letakkan di sini",
    uploading: "Mengunggah",
    selectPlaceholder: "Pilih salah satu",
    searchPlaceholder: "Cari",
    clear: "Hapus",
    closed: "Formulir ini sudah ditutup",
    resume: "Lanjutkan dari terakhir kali",
    startOver: "Mulai dari awal",
  },
};

export function formLabels(
  language: FormLanguage = "en",
  overrides: Partial<Record<FormLabelKey, string>> = {},
): Record<FormLabelKey, string> {
  const base = language === "id" ? FORM_DEFAULT_LABELS.id : FORM_DEFAULT_LABELS.en;
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && value.trim()) merged[key as FormLabelKey] = value.trim();
  }
  return merged;
}

/** Validation error codes, shared by the client and the API. */
export const FORM_ERROR_CODES = [
  "required",
  "invalid",
  "email",
  "url",
  "phone",
  "number",
  "min",
  "max",
  "minLength",
  "maxLength",
  "pattern",
  "minSelections",
  "maxSelections",
  "unknownOption",
  "date",
  "minDate",
  "maxDate",
  "files",
  "tooManyFiles",
  "consent",
  "color",
] as const;
export type FormErrorCode = (typeof FORM_ERROR_CODES)[number];

type MessageArgs = { min?: number | string; max?: number | string };

const MESSAGES: Record<FormLanguage, Record<FormErrorCode, (args: MessageArgs) => string>> = {
  en: {
    required: () => "This one needs an answer.",
    invalid: () => "That answer doesn't look right.",
    email: () => "Enter an email address like name@example.com.",
    url: () => "Enter a full link, starting with https://.",
    phone: () => "Enter a phone number with at least 6 digits.",
    number: () => "Enter a number.",
    min: ({ min }) => `Enter ${min} or more.`,
    max: ({ max }) => `Enter ${max} or less.`,
    minLength: ({ min }) => `Write at least ${min} characters.`,
    maxLength: ({ max }) => `Keep it under ${max} characters.`,
    pattern: () => "That answer doesn't match the expected format.",
    minSelections: ({ min }) => `Choose at least ${min}.`,
    maxSelections: ({ max }) => `Choose at most ${max}.`,
    unknownOption: () => "Choose one of the options.",
    date: () => "Enter a valid date.",
    minDate: ({ min }) => `Choose ${min} or later.`,
    maxDate: ({ max }) => `Choose ${max} or earlier.`,
    files: () => "One of the files couldn't be accepted.",
    tooManyFiles: ({ max }) => `Attach at most ${max} files.`,
    consent: () => "Please agree to continue.",
    color: () => "Pick a color.",
  },
  id: {
    required: () => "Pertanyaan ini wajib dijawab.",
    invalid: () => "Jawaban ini sepertinya belum tepat.",
    email: () => "Masukkan alamat email seperti nama@contoh.com.",
    url: () => "Masukkan tautan lengkap, diawali https://.",
    phone: () => "Masukkan nomor telepon minimal 6 digit.",
    number: () => "Masukkan angka.",
    min: ({ min }) => `Masukkan ${min} atau lebih.`,
    max: ({ max }) => `Masukkan ${max} atau kurang.`,
    minLength: ({ min }) => `Tulis minimal ${min} karakter.`,
    maxLength: ({ max }) => `Tulis maksimal ${max} karakter.`,
    pattern: () => "Jawaban belum sesuai format yang diminta.",
    minSelections: ({ min }) => `Pilih minimal ${min}.`,
    maxSelections: ({ max }) => `Pilih maksimal ${max}.`,
    unknownOption: () => "Pilih salah satu opsi.",
    date: () => "Masukkan tanggal yang valid.",
    minDate: ({ min }) => `Pilih ${min} atau setelahnya.`,
    maxDate: ({ max }) => `Pilih ${max} atau sebelumnya.`,
    files: () => "Salah satu berkas tidak dapat diterima.",
    tooManyFiles: ({ max }) => `Lampirkan maksimal ${max} berkas.`,
    consent: () => "Mohon setujui untuk melanjutkan.",
    color: () => "Pilih warna.",
  },
};

export function formErrorMessage(
  code: FormErrorCode,
  args: MessageArgs = {},
  language: FormLanguage = "en",
): string {
  const table = language === "id" ? MESSAGES.id : MESSAGES.en;
  const message = new Map(Object.entries(table)).get(code);
  return message ? message(args) : code;
}
