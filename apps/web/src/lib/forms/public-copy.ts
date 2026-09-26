import type { FormLanguage, FormUnavailableReason } from "@repo/shared";

/**
 * The public form's own sentences, beyond the overridable interface words
 * of `formLabels`: durations, progress, the status screens, sharing. English
 * and Indonesian, like the rest of the form.
 */

type Copy = {
  minutes: (count: number) => string;
  questions: (count: number) => string;
  pageOf: (page: number, total: number) => string;
  questionOf: (index: number, total: number) => string;
  answered: (done: number, total: number) => string;
  progressLabel: string;
  startHint: string;
  resumeTitle: string;
  resumeBody: string;
  restoredNote: string;
  lockedEyebrow: string;
  lockedTitle: string;
  lockedBody: string;
  passphrase: string;
  unlock: string;
  unlocking: string;
  wrongPassphrase: string;
  unlockFailed: string;
  unavailableEyebrow: string;
  notOpenTitle: string;
  notOpenBody: string;
  opensIn: string;
  opensAt: (when: string) => string;
  closedBody: string;
  fullTitle: string;
  fullBody: string;
  alreadyTitle: string;
  alreadyBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  submitting: string;
  submitFailed: string;
  fixErrors: (count: number) => string;
  yes: string;
  no: string;
  other: string;
  otherPlaceholder: string;
  pickUpTo: (max: number) => string;
  pickAtLeast: (min: number) => string;
  pickBetween: (min: number, max: number) => string;
  chars: (count: number, max: number) => string;
  didYouMean: (suggestion: string) => string;
  useSuggestion: string;
  increase: string;
  decrease: string;
  countryCode: string;
  phoneNumber: string;
  searchCountries: string;
  noMatches: string;
  remove: string;
  removeFile: (name: string) => string;
  retryUpload: string;
  uploadFailed: string;
  fileTooBig: (limit: string) => string;
  fileType: string;
  tooManyFiles: (max: number) => string;
  filesHint: (max: number, size: string) => string;
  signHere: string;
  signatureSaved: string;
  clearSignature: string;
  first: string;
  last: string;
  addressParts: Record<"line1" | "line2" | "city" | "region" | "postal" | "country", string>;
  customColor: string;
  rankHint: string;
  rankGrabbed: (label: string, position: number, total: number) => string;
  rankMoved: (label: string, position: number, total: number) => string;
  rankDropped: (label: string, position: number, total: number) => string;
  keepOrder: string;
  moveUp: string;
  moveDown: string;
  playVideo: string;
  videoConsent: string;
  score: string;
  share: string;
  copyLink: string;
  copied: string;
  another: string;
  redirecting: (seconds: number) => string;
  cancel: string;
  soundOn: string;
  soundOff: string;
  previous: string;
  nextQuestion: string;
  shiftEnter: string;
  keyHint: string;
  autoAdvance: string;
  preview: string;
  thanks: string;
};

const en: Copy = {
  minutes: (count) => `Takes about ${count} minute${count === 1 ? "" : "s"}`,
  questions: (count) => `${count} question${count === 1 ? "" : "s"}`,
  pageOf: (page, total) => `Page ${page} of ${total}`,
  questionOf: (index, total) => `Question ${index} of ${total}`,
  answered: (done, total) => `${done} of ${total} answered`,
  progressLabel: "Your progress",
  startHint: "or press Enter",
  resumeTitle: "Welcome back",
  resumeBody: "Your earlier answers are still here.",
  restoredNote: "We kept your earlier answers.",
  lockedEyebrow: "Private form",
  lockedTitle: "This form needs a passphrase",
  lockedBody: "Whoever shared it with you has the word. Type it to step in.",
  passphrase: "Passphrase",
  unlock: "Unlock",
  unlocking: "Checking",
  wrongPassphrase: "That passphrase doesn't open this form. Check it and try again.",
  unlockFailed: "The form couldn't be reached. Check your connection and try again.",
  unavailableEyebrow: "Not open",
  notOpenTitle: "Not open yet",
  notOpenBody: "This form opens soon. Come back when the countdown ends.",
  opensIn: "Opens in",
  opensAt: (when) => `Opens ${when}`,
  closedBody: "It no longer takes responses.",
  fullTitle: "Every spot is taken",
  fullBody: "This form has all the responses it can take.",
  alreadyTitle: "You've already responded",
  alreadyBody: "This form takes one response per device, and yours is in. Thank you.",
  errorTitle: "The form didn't load",
  errorBody: "The connection dropped on the way. Try again in a moment.",
  retry: "Try again",
  submitting: "Sending",
  submitFailed: "Your answers weren't sent. Check your connection and try again.",
  fixErrors: (count) =>
    count === 1 ? "One answer needs another look." : `${count} answers need another look.`,
  yes: "Yes",
  no: "No",
  other: "Other",
  otherPlaceholder: "Type your answer",
  pickUpTo: (max) => `Choose up to ${max}`,
  pickAtLeast: (min) => `Choose at least ${min}`,
  pickBetween: (min, max) => `Choose ${min} to ${max}`,
  chars: (count, max) => `${count} / ${max}`,
  didYouMean: (suggestion) => `Did you mean ${suggestion}?`,
  useSuggestion: "Use it",
  increase: "Increase",
  decrease: "Decrease",
  countryCode: "Country code",
  phoneNumber: "Phone number",
  searchCountries: "Search countries",
  noMatches: "Nothing matches",
  remove: "Remove",
  removeFile: (name) => `Remove ${name}`,
  retryUpload: "Retry",
  uploadFailed: "Upload failed",
  fileTooBig: (limit) => `Larger than ${limit}`,
  fileType: "That file type isn't accepted here",
  tooManyFiles: (max) => `Only ${max} file${max === 1 ? "" : "s"} fit here`,
  filesHint: (max, size) => `Up to ${max} file${max === 1 ? "" : "s"}, ${size} each`,
  signHere: "Sign here with your finger, pen or mouse",
  signatureSaved: "Signature saved",
  clearSignature: "Clear",
  first: "First name",
  last: "Last name",
  addressParts: {
    line1: "Street address",
    line2: "Apartment, suite, floor",
    city: "City",
    region: "State or province",
    postal: "Postal code",
    country: "Country",
  },
  customColor: "Custom colour",
  rankHint: "Drag to reorder, or focus an item, press Space and move it with the arrow keys.",
  rankGrabbed: (label, position, total) =>
    `${label} grabbed, position ${position} of ${total}. Use the arrow keys to move, Space to drop.`,
  rankMoved: (label, position, total) => `${label}, position ${position} of ${total}.`,
  rankDropped: (label, position, total) => `${label} dropped at position ${position} of ${total}.`,
  keepOrder: "This order is right",
  moveUp: "Move up",
  moveDown: "Move down",
  playVideo: "Play video",
  videoConsent: "Plays from the video's own site",
  score: "Your score",
  share: "Share this form",
  copyLink: "Copy link",
  copied: "Link copied",
  another: "Submit another response",
  redirecting: (seconds) => `Taking you onward in ${seconds} s`,
  cancel: "Stay here",
  soundOn: "Turn sound on",
  soundOff: "Turn sound off",
  previous: "Previous question",
  nextQuestion: "Next question",
  shiftEnter: "Shift + Enter for a new line",
  keyHint: "Press a letter to choose",
  autoAdvance: "Moving on",
  preview: "Preview",
  thanks: "Thank you",
};

const id: Copy = {
  minutes: (count) => `Sekitar ${count} menit`,
  questions: (count) => `${count} pertanyaan`,
  pageOf: (page, total) => `Halaman ${page} dari ${total}`,
  questionOf: (index, total) => `Pertanyaan ${index} dari ${total}`,
  answered: (done, total) => `${done} dari ${total} terjawab`,
  progressLabel: "Kemajuan Anda",
  startHint: "atau tekan Enter",
  resumeTitle: "Selamat datang kembali",
  resumeBody: "Jawaban Anda sebelumnya masih tersimpan.",
  restoredNote: "Jawaban Anda sebelumnya kami simpan.",
  lockedEyebrow: "Formulir privat",
  lockedTitle: "Formulir ini memerlukan kata sandi",
  lockedBody: "Orang yang membagikannya punya kata sandinya. Ketik untuk masuk.",
  passphrase: "Kata sandi",
  unlock: "Buka",
  unlocking: "Memeriksa",
  wrongPassphrase: "Kata sandi itu tidak membuka formulir ini. Periksa lalu coba lagi.",
  unlockFailed: "Formulir tidak dapat dijangkau. Periksa koneksi Anda lalu coba lagi.",
  unavailableEyebrow: "Belum dibuka",
  notOpenTitle: "Belum dibuka",
  notOpenBody: "Formulir ini segera dibuka. Kembali lagi saat hitungan mundur selesai.",
  opensIn: "Dibuka dalam",
  opensAt: (when) => `Dibuka ${when}`,
  closedBody: "Formulir ini tidak lagi menerima jawaban.",
  fullTitle: "Semua tempat sudah terisi",
  fullBody: "Formulir ini sudah menerima semua jawaban yang bisa ditampung.",
  alreadyTitle: "Anda sudah menjawab",
  alreadyBody: "Formulir ini menerima satu jawaban per perangkat, dan jawaban Anda sudah masuk.",
  errorTitle: "Formulir gagal dimuat",
  errorBody: "Koneksi terputus. Coba lagi sebentar lagi.",
  retry: "Coba lagi",
  submitting: "Mengirim",
  submitFailed: "Jawaban Anda belum terkirim. Periksa koneksi lalu coba lagi.",
  fixErrors: (count) =>
    count === 1 ? "Satu jawaban perlu diperiksa lagi." : `${count} jawaban perlu diperiksa lagi.`,
  yes: "Ya",
  no: "Tidak",
  other: "Lainnya",
  otherPlaceholder: "Ketik jawaban Anda",
  pickUpTo: (max) => `Pilih hingga ${max}`,
  pickAtLeast: (min) => `Pilih minimal ${min}`,
  pickBetween: (min, max) => `Pilih ${min} sampai ${max}`,
  chars: (count, max) => `${count} / ${max}`,
  didYouMean: (suggestion) => `Maksud Anda ${suggestion}?`,
  useSuggestion: "Pakai",
  increase: "Tambah",
  decrease: "Kurangi",
  countryCode: "Kode negara",
  phoneNumber: "Nomor telepon",
  searchCountries: "Cari negara",
  noMatches: "Tidak ada yang cocok",
  remove: "Hapus",
  removeFile: (name) => `Hapus ${name}`,
  retryUpload: "Ulangi",
  uploadFailed: "Unggahan gagal",
  fileTooBig: (limit) => `Lebih besar dari ${limit}`,
  fileType: "Jenis berkas itu tidak diterima di sini",
  tooManyFiles: (max) => `Hanya muat ${max} berkas`,
  filesHint: (max, size) => `Hingga ${max} berkas, masing-masing ${size}`,
  signHere: "Tanda tangan di sini dengan jari, pena, atau tetikus",
  signatureSaved: "Tanda tangan tersimpan",
  clearSignature: "Hapus",
  first: "Nama depan",
  last: "Nama belakang",
  addressParts: {
    line1: "Alamat jalan",
    line2: "Blok, unit, lantai",
    city: "Kota",
    region: "Provinsi",
    postal: "Kode pos",
    country: "Negara",
  },
  customColor: "Warna lain",
  rankHint:
    "Seret untuk mengurutkan, atau fokus pada item, tekan Spasi dan pindahkan dengan tombol panah.",
  rankGrabbed: (label, position, total) =>
    `${label} diambil, posisi ${position} dari ${total}. Pindahkan dengan panah, Spasi untuk melepas.`,
  rankMoved: (label, position, total) => `${label}, posisi ${position} dari ${total}.`,
  rankDropped: (label, position, total) => `${label} dilepas di posisi ${position} dari ${total}.`,
  keepOrder: "Urutan ini sudah pas",
  moveUp: "Naikkan",
  moveDown: "Turunkan",
  playVideo: "Putar video",
  videoConsent: "Diputar dari situs videonya",
  score: "Skor Anda",
  share: "Bagikan formulir ini",
  copyLink: "Salin tautan",
  copied: "Tautan disalin",
  another: "Kirim jawaban lain",
  redirecting: (seconds) => `Melanjutkan dalam ${seconds} dtk`,
  cancel: "Tetap di sini",
  soundOn: "Nyalakan suara",
  soundOff: "Matikan suara",
  previous: "Pertanyaan sebelumnya",
  nextQuestion: "Pertanyaan berikutnya",
  shiftEnter: "Shift + Enter untuk baris baru",
  keyHint: "Tekan huruf untuk memilih",
  autoAdvance: "Lanjut",
  preview: "Pratinjau",
  thanks: "Terima kasih",
};

export const FORM_COPY: Record<FormLanguage, Copy> = { en, id };
export type FormCopy = Copy;

export function formCopy(language: FormLanguage | undefined): Copy {
  return FORM_COPY[language ?? "en"] ?? en;
}

export function unavailableTitle(
  reason: FormUnavailableReason,
  copy: Copy,
  closedTitle?: string,
  closedLabel?: string,
) {
  if (closedTitle) return closedTitle;
  if (reason === "not_open_yet") return copy.notOpenTitle;
  if (reason === "limit_reached") return copy.fullTitle;
  return closedLabel ?? copy.closedBody;
}

/** "2.5 MB", "800 KB". */
export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    const value = bytes / 1024 / 1024;
    return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
