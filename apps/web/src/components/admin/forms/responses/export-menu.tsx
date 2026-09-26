"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { DownloadSimple, FileArchive, Printer, X } from "@phosphor-icons/react";
import type { FormRecord } from "@repo/shared";

import { formFileUrl } from "@/lib/forms/admin-api";
import { cellFiles, type DataColumn, type WorkingRow } from "@/lib/forms/data/columns";
import {
  downloadBlob,
  exportFileName,
  exportTable,
  toCsvBytes,
  toDelimited,
  toFlatJson,
  toMarkdown,
  toRawJson,
  toXlsxBytes,
} from "@/lib/forms/data/export";
import { ZipWriter, safeZipPath, uniqueName } from "@/lib/forms/data/zip";

import { Popover, ghostButton, labelClass, primaryButton } from "./column-menus";

type Format = "csv" | "tsv" | "xlsx" | "json-flat" | "json-raw" | "md";

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "csv", label: "CSV", hint: "UTF-8, opens in any spreadsheet" },
  { id: "xlsx", label: "Excel (.xlsx)", hint: "Typed numbers and dates, frozen header" },
  { id: "tsv", label: "TSV", hint: "Tab separated" },
  { id: "json-flat", label: "JSON rows", hint: "One flat object per response" },
  { id: "json-raw", label: "JSON records", hint: "Full records with metadata" },
  { id: "md", label: "Markdown table", hint: "For docs and chats" },
];

type Scope = "all" | "filtered" | "selected";

/**
 * Same-origin download of one respondent file as bytes. XMLHttpRequest
 * rather than fetch: the URL is an admin route built from the form id and
 * the stored key, and the call must be abortable for Cancel.
 */
class DownloadError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;
  constructor(status: number, retryAfter: number | null) {
    super(`HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/**
 * One file, retried while the API's rate limit (about 100 requests a
 * minute) says to slow down, so big archives finish instead of skipping.
 */
async function downloadWithRetry(
  url: string,
  signal: AbortSignal,
  onWait: (seconds: number) => void,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await downloadFileBytes(url, signal);
    } catch (error) {
      if (!(error instanceof DownloadError) || error.status !== 429 || attempt >= 30) throw error;
      const seconds = Math.max(2, Math.min(60, error.retryAfter ?? 10));
      onWait(seconds);
      await wait(seconds * 1000, signal);
    }
  }
}

function downloadFileBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.onload = () => {
      if (request.status >= 200 && request.status < 300)
        resolve(new Uint8Array(request.response as ArrayBuffer));
      else {
        const header = Number(request.getResponseHeader("retry-after"));
        reject(
          new DownloadError(request.status, Number.isFinite(header) && header > 0 ? header : null),
        );
      }
    };
    request.onerror = () => {
      reject(new Error("Network error"));
    };
    request.onabort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener(
      "abort",
      () => {
        request.abort();
      },
      { once: true },
    );
    request.send();
  });
}

export function ExportMenu({
  form,
  anchor,
  allRows,
  filteredRows,
  selectedRows,
  answerColumns,
  metaColumns,
  extraColumns,
  visibleOrder,
  rawAll,
  onPrint,
  onClose,
}: {
  form: FormRecord;
  anchor: DOMRect;
  /** Cleaned rows (all), filtered+sorted, and the selection. */
  allRows: WorkingRow[];
  filteredRows: WorkingRow[];
  selectedRows: WorkingRow[];
  answerColumns: DataColumn[];
  metaColumns: DataColumn[];
  extraColumns: DataColumn[];
  /** The table's visible column keys, in order. */
  visibleOrder: string[];
  /** The responses without any cleaning, for "don't apply the pipeline". */
  rawAll: WorkingRow[];
  onPrint: () => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("csv");
  const [scope, setScope] = useState<Scope>(selectedRows.length ? "selected" : "filtered");
  const [labels, setLabels] = useState(true);
  const [meta, setMeta] = useState(true);
  const [clean, setClean] = useState(true);
  const [onlyVisible, setOnlyVisible] = useState(false);
  const [zipping, setZipping] = useState<{
    done: number;
    total: number;
    bytes: number;
    waiting: number;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const rowsFor = (): WorkingRow[] => {
    if (!clean) {
      const ids = new Set(
        (scope === "selected" ? selectedRows : scope === "filtered" ? filteredRows : allRows).map(
          (row) => row.id,
        ),
      );
      const source = scope === "all" ? rawAll : rawAll.filter((row) => ids.has(row.id));
      if (scope === "filtered") {
        const order = new Map(filteredRows.map((row, index) => [row.id, index]));
        return [...source].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      }
      return source;
    }
    return scope === "selected" ? selectedRows : scope === "filtered" ? filteredRows : allRows;
  };

  const columnsFor = (): DataColumn[] => {
    const all = [...answerColumns, ...(clean ? extraColumns : []), ...(meta ? metaColumns : [])];
    if (!onlyVisible) return all;
    const byKey = new Map(all.map((column) => [column.key, column]));
    return visibleOrder
      .map((key) => byKey.get(key))
      .filter((column): column is DataColumn => Boolean(column));
  };

  const endingTitles = new Map(form.document.endings.map((ending) => [ending.id, ending.title]));

  const run = () => {
    const rows = rowsFor();
    if (!rows.length) {
      toast.error("Nothing to export", { description: "No responses in that selection." });
      return;
    }
    const table = exportTable(rows, columnsFor(), { raw: !labels, endingTitles });
    const title = form.document.title;
    try {
      switch (format) {
        case "csv":
          downloadBlob(
            [toCsvBytes(table) as BlobPart],
            exportFileName(title, "csv"),
            "text/csv;charset=utf-8",
          );
          break;
        case "tsv":
          downloadBlob(
            [toDelimited(table, "\t")],
            exportFileName(title, "tsv"),
            "text/tab-separated-values;charset=utf-8",
          );
          break;
        case "xlsx":
          downloadBlob(
            [toXlsxBytes(table, title) as BlobPart],
            exportFileName(title, "xlsx"),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
          break;
        case "json-flat":
          downloadBlob([toFlatJson(table)], exportFileName(title, "json"), "application/json");
          break;
        case "json-raw":
          downloadBlob([toRawJson(table)], exportFileName(title, "json"), "application/json");
          break;
        case "md":
          downloadBlob(
            [toMarkdown(table)],
            exportFileName(title, "md"),
            "text/markdown;charset=utf-8",
          );
          break;
      }
      toast.success(`Exported ${rows.length} response${rows.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error("Export failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const zipFiles = async () => {
    const rows = rowsFor();
    const fileColumns = answerColumns.filter((column) => column.valueType === "file");
    const jobs: { path: string; key: string }[] = [];
    rows.forEach((row) => {
      const folder = safeZipPath(`${String(row.index + 1).padStart(5, "0")}-${row.id}`);
      const taken = new Set<string>();
      for (const column of fileColumns) {
        for (const file of cellFiles(column, row)) {
          const name = uniqueName(
            safeZipPath(`${column.label.slice(0, 40)} - ${file.name}`).replace(/\//g, "_") ||
              file.key,
            taken,
          );
          jobs.push({ path: `${folder}/${name}`, key: file.key });
        }
      }
    });
    if (!jobs.length) {
      toast.error("No uploaded files", { description: "None of these responses has a file." });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const zip = new ZipWriter();
    setZipping({ done: 0, total: jobs.length, bytes: 0, waiting: 0 });
    let failed = 0;
    try {
      for (let index = 0; index < jobs.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const job = jobs[index];
        try {
          const data = await downloadWithRetry(
            formFileUrl(form.id, job.key, "download"),
            controller.signal,
            (seconds) => {
              setZipping((current) => (current ? { ...current, waiting: seconds } : current));
            },
          );
          zip.add({ name: job.path, data });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          failed += 1;
        }
        setZipping({ done: index + 1, total: jobs.length, bytes: zip.size, waiting: 0 });
      }
      downloadBlob(
        zip.finish() as BlobPart[],
        exportFileName(`${form.document.title}-files`, "zip"),
        "application/zip",
      );
      if (failed)
        toast.warning(`Zipped ${jobs.length - failed} files`, {
          description: `${failed} could not be downloaded.`,
        });
      else toast.success(`Zipped ${jobs.length} files`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") toast("Download cancelled");
      else
        toast.error("Could not build the archive", {
          description: error instanceof Error ? error.message : undefined,
        });
    } finally {
      setZipping(null);
      abort.current = null;
    }
  };

  const counts = {
    all: allRows.length,
    filtered: filteredRows.length,
    selected: selectedRows.length,
  };
  const option = "flex items-center gap-2 text-xs";

  return (
    <Popover
      anchor={anchor}
      label="Export"
      onClose={() => {
        if (!zipping) onClose();
      }}
      width={360}
    >
      <div className="space-y-4" data-testid="export-menu">
        <div>
          <p className={`${labelClass} mb-2`}>Format</p>
          <div className="grid grid-cols-2 gap-1.5">
            {FORMATS.map((item) => (
              <button
                aria-pressed={format === item.id}
                className={`rounded-xl border px-2.5 py-2 text-left transition ${format === item.id ? "border-brand-blue bg-brand-blue-50 dark:bg-brand-blue/15" : "border-[#e4e8f0] hover:border-[#c6cfdd] dark:border-white/10"}`}
                key={item.id}
                onClick={() => {
                  setFormat(item.id);
                }}
                type="button"
              >
                <span className="block text-xs font-bold">{item.label}</span>
                <span className="block text-[10px] text-[#8a93a6]">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={`${labelClass} mb-2`}>Rows</p>
          <div className="flex flex-wrap gap-3">
            {(["all", "filtered", "selected"] as Scope[]).map((item) => (
              <label className={option} key={item}>
                <input
                  checked={scope === item}
                  className="accent-brand-blue"
                  disabled={item === "selected" && !counts.selected}
                  name="export-scope"
                  onChange={() => {
                    setScope(item);
                  }}
                  type="radio"
                />
                {item === "all" ? "All" : item === "filtered" ? "Filtered" : "Selected"}{" "}
                <span className="tabular-nums text-[#8a93a6]">{counts[item]}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={option}>
            <input
              checked={labels}
              className="size-3.5 accent-brand-blue"
              onChange={(event) => {
                setLabels(event.target.checked);
              }}
              type="checkbox"
            />{" "}
            Option labels (off: raw option ids)
          </label>
          <label className={option}>
            <input
              checked={meta}
              className="size-3.5 accent-brand-blue"
              onChange={(event) => {
                setMeta(event.target.checked);
              }}
              type="checkbox"
            />{" "}
            Include metadata columns
          </label>
          <label className={option}>
            <input
              checked={onlyVisible}
              className="size-3.5 accent-brand-blue"
              onChange={(event) => {
                setOnlyVisible(event.target.checked);
              }}
              type="checkbox"
            />{" "}
            Only the table&apos;s visible columns
          </label>
          <label className={option}>
            <input
              checked={clean}
              className="size-3.5 accent-brand-blue"
              onChange={(event) => {
                setClean(event.target.checked);
              }}
              type="checkbox"
            />{" "}
            Apply the cleaning pipeline
          </label>
        </div>
        <button className={`${primaryButton} w-full justify-center`} onClick={run} type="button">
          <DownloadSimple size={15} weight="bold" /> Export{" "}
          {FORMATS.find((item) => item.id === format)?.label}
        </button>
        <div className="border-t border-[#eef0f4] pt-3 dark:border-white/5">
          {zipping ? (
            <div aria-live="polite" className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span>
                  Downloading {zipping.done} / {zipping.total} files ·{" "}
                  {(zipping.bytes / 1024 / 1024).toFixed(1)} MB
                  {zipping.waiting
                    ? ` · the server asked to slow down, retrying in ${zipping.waiting}s`
                    : ""}
                </span>
                <button
                  className="inline-flex items-center gap-1 font-semibold text-brand-red"
                  onClick={() => abort.current?.abort()}
                  type="button"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#eef0f4] dark:bg-white/10">
                <div
                  className="h-full bg-brand-blue transition-[width]"
                  style={{ width: `${(zipping.done / zipping.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className={ghostButton} onClick={() => void zipFiles()} type="button">
                <FileArchive size={15} /> All uploaded files (.zip)
              </button>
              <button
                className={ghostButton}
                onClick={() => {
                  onClose();
                  onPrint();
                }}
                type="button"
              >
                <Printer size={15} /> Print report
              </button>
            </div>
          )}
        </div>
      </div>
    </Popover>
  );
}
