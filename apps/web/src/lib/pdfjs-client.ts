"use client";

import { GlobalWorkerOptions } from "pdfjs-dist";

let configured = false;

/**
 * Points pdf.js at the bundled worker. The worker module ships inside
 * pdfjs-dist and is resolved as a static asset by the bundler, so the viewer
 * never depends on an external CDN at runtime.
 */
export function ensurePdfJsWorker() {
  if (configured) return;
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  configured = true;
}
