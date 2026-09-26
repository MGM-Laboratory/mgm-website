"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  Copy,
  Flag,
  PencilSimple,
  Printer,
  Prohibit,
  Star,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  isAnswered,
  isFileAnswer,
  type FormAnswerValue,
  type FormRecord,
  type FormResponsePatch,
} from "@repo/shared";

import { MiniMap } from "@/components/admin/forms/charts/world-map";
import {
  cellText,
  countryName,
  formatDateTime,
  formatDuration,
  type DataColumn,
  type WorkingRow,
} from "@/lib/forms/data/columns";

import { AnswerEditor } from "./answer-editor";
import { CellView, FileChips, answerIsEditable, type OpenFile } from "./cells";

const sectionLabel =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-[#7e899d] dark:text-white/35";

/**
 * One response in full: every answer in form order, files previewable,
 * where it came from, and the admin controls. J and K step through the
 * rows the table currently shows.
 */
export function ResponseDrawer({
  form,
  row,
  position,
  count,
  columns,
  allTags,
  canWrite,
  canDelete,
  onClose,
  onStep,
  onPatch,
  onEditAnswer,
  onDelete,
  onOpenFile,
}: {
  form: FormRecord;
  row: WorkingRow;
  position: number;
  count: number;
  columns: DataColumn[];
  allTags: string[];
  canWrite: boolean;
  canDelete: boolean;
  onClose: () => void;
  onStep: (delta: number) => void;
  onPatch: (patch: FormResponsePatch) => Promise<void>;
  onEditAnswer: (column: DataColumn, value: FormAnswerValue | undefined) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpenFile: OpenFile;
}) {
  const record = row.record;
  const [note, setNote] = useState(record.admin.note ?? "");
  const [tagInput, setTagInput] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A new row resets the local editors (keyed by the row id).
  const [noteFor, setNoteFor] = useState(row.id);
  if (noteFor !== row.id) {
    setNoteFor(row.id);
    setNote(record.admin.note ?? "");
    setEditing(null);
    setTagInput("");
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "Escape") onClose();
      else if (event.key === "j" || event.key === "J") onStep(1);
      else if (event.key === "k" || event.key === "K") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [row.id]);

  const answerCols = useMemo(
    () =>
      columns.filter(
        (column) => column.group === "answer" && column.answer?.part?.kind !== "other",
      ),
    [columns],
  );
  const extraCols = columns.filter((column) => column.group === "extra");
  const meta = record.meta;
  const endingTitle = form.document.endings.find((ending) => ending.id === record.endingId)?.title;
  const place = [meta.city, meta.region, meta.country ? countryName(meta.country) : null]
    .filter(Boolean)
    .join(", ");

  const toggle = (key: "starred" | "flagged" | "reviewed" | "spam") => {
    const current = key === "spam" ? record.spam : record.admin[key];
    void onPatch({ [key]: !current });
  };

  const addTag = (tag: string) => {
    const clean = tag.trim().slice(0, 40);
    if (!clean || record.admin.tags.includes(clean)) return;
    void onPatch({ tags: [...record.admin.tags, clean] });
    setTagInput("");
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ ...record, answers: row.answers }, null, 2),
      );
      toast.success("Response copied as JSON");
    } catch {
      toast.error("Could not copy");
    }
  };

  const print = () => {
    const popup = window.open("", "_blank", "width=820,height=900");
    if (!popup) {
      toast.error("Allow pop-ups to print this response");
      return;
    }
    const doc = popup.document;
    doc.title = `${form.document.title} · response`;
    const style = doc.createElement("style");
    style.textContent =
      "body{font:14px/1.5 system-ui,sans-serif;color:#0e1116;margin:32px}h1{font-size:20px;margin:0 0 4px}p{color:#6b7280;margin:0 0 20px}table{border-collapse:collapse;width:100%;margin-bottom:24px}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid #ececea}th{width:34%;color:#3b4150;font-weight:600}td{white-space:pre-wrap}";
    doc.head.appendChild(style);
    const heading = doc.createElement("h1");
    heading.textContent = form.document.title;
    const sub = doc.createElement("p");
    sub.textContent = `Response ${position + 1} of ${count} · ${formatDateTime(record.createdAt)}`;
    doc.body.append(heading, sub);
    const table = (rows: [string, string][]) => {
      const element = doc.createElement("table");
      for (const [label, value] of rows) {
        const tr = doc.createElement("tr");
        const th = doc.createElement("th");
        th.textContent = label;
        const td = doc.createElement("td");
        td.textContent = value || "No answer";
        tr.append(th, td);
        element.appendChild(tr);
      }
      doc.body.appendChild(element);
    };
    table(answerCols.map((column) => [column.label, cellText(column, row)]));
    table(
      (
        [
          ["Duration", formatDuration(meta.durationMs === null ? null : meta.durationMs / 1000)],
          ["Location", place],
          ["Device", [meta.device, meta.browser, meta.os].filter(Boolean).join(" · ")],
          ["Response ID", record.id],
        ] as [string, string][]
      ).filter(([, value]) => value),
    );
    popup.focus();
    popup.print();
  };

  const remove = async () => {
    if (!window.confirm("Delete this response? This can't be undone.")) return;
    await onDelete();
  };

  const toggleClass = (on: boolean, tone: string) =>
    `inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition disabled:opacity-50 ${on ? tone : "border-[#d9dfeb] text-[#5c6679] hover:border-[#b9c2d3] dark:border-white/10 dark:text-white/60"}`;

  const suggestions = allTags
    .filter(
      (tag) =>
        !record.admin.tags.includes(tag) && tag.toLowerCase().includes(tagInput.toLowerCase()),
    )
    .slice(0, 8);

  const metaItems: [string, string | null | undefined][] = [
    ["Submitted", formatDateTime(record.createdAt)],
    ["Started", meta.startedAt ? formatDateTime(meta.startedAt) : null],
    ["Duration", formatDuration(meta.durationMs === null ? null : meta.durationMs / 1000)],
    ["Score", record.score === null ? null : String(record.score)],
    ["Ending", endingTitle ?? record.endingId],
    ["IP", meta.ip],
    ["Location", place],
    ["Timezone", meta.timezone],
    ["Device", meta.device],
    ["Browser", meta.browser],
    ["OS", meta.os],
    ["Language", meta.language],
    ["Screen", meta.screen],
    ["Referrer", meta.referer],
    [
      "UTM",
      meta.utm
        ? Object.entries(meta.utm)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}=${value}`)
            .join(" · ")
        : null,
    ],
    ["User agent", meta.userAgent],
    ["Session", record.sessionId],
    ["Device ID", meta.deviceId],
    ["Response ID", record.id],
    ["Edited", record.admin.editedAt ? formatDateTime(record.admin.editedAt) : null],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        aria-label="Close response"
        className="absolute inset-0 bg-[#0e1116]/35 backdrop-blur-[1px]"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={`Response ${position + 1} of ${count}`}
        aria-modal="true"
        className="relative flex h-full w-full max-w-[640px] flex-col bg-[#f7f8fa] shadow-2xl outline-none dark:bg-[#12151b]"
        data-testid="response-drawer"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center gap-2 border-b border-[#e4e8f0] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#161a21] sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              Response <span className="tabular-nums">{position + 1}</span>{" "}
              <span className="font-normal text-[#8a93a6]">of {count}</span>
            </p>
            <p className="truncate text-xs text-[#778299] dark:text-white/45">
              {formatDateTime(record.createdAt)}
              {place ? ` · ${place}` : ""}
            </p>
          </div>
          <button
            aria-label="Previous response (K)"
            className="rounded-lg p-2 text-[#5c6679] hover:bg-[#f4f6fa] disabled:opacity-30 dark:text-white/60 dark:hover:bg-white/10"
            disabled={position <= 0}
            onClick={() => onStep(-1)}
            title="Previous (K)"
            type="button"
          >
            <CaretUp size={16} weight="bold" />
          </button>
          <button
            aria-label="Next response (J)"
            className="rounded-lg p-2 text-[#5c6679] hover:bg-[#f4f6fa] disabled:opacity-30 dark:text-white/60 dark:hover:bg-white/10"
            disabled={position >= count - 1}
            onClick={() => onStep(1)}
            title="Next (J)"
            type="button"
          >
            <CaretDown size={16} weight="bold" />
          </button>
          <button
            aria-label="Close"
            className="rounded-lg p-2 text-[#5c6679] hover:bg-[#f4f6fa] dark:text-white/60 dark:hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <button
              aria-pressed={record.admin.starred}
              className={toggleClass(
                record.admin.starred,
                "border-[#e0a82a] bg-brand-yellow-50 text-[#8a6412] dark:bg-brand-yellow/15 dark:text-brand-yellow",
              )}
              disabled={!canWrite}
              onClick={() => toggle("starred")}
              type="button"
            >
              <Star size={14} weight={record.admin.starred ? "fill" : "regular"} />{" "}
              {record.admin.starred ? "Starred" : "Star"}
            </button>
            <button
              aria-pressed={record.admin.flagged}
              className={toggleClass(
                record.admin.flagged,
                "border-brand-red bg-brand-red-50 text-brand-red dark:bg-brand-red/15",
              )}
              disabled={!canWrite}
              onClick={() => toggle("flagged")}
              type="button"
            >
              <Flag size={14} weight={record.admin.flagged ? "fill" : "regular"} />{" "}
              {record.admin.flagged ? "Flagged" : "Flag"}
            </button>
            <button
              aria-pressed={record.admin.reviewed}
              className={toggleClass(
                record.admin.reviewed,
                "border-brand-green bg-brand-green-50 text-brand-green dark:bg-brand-green/15",
              )}
              disabled={!canWrite}
              onClick={() => toggle("reviewed")}
              type="button"
            >
              <CheckCircle size={14} weight={record.admin.reviewed ? "fill" : "regular"} />{" "}
              {record.admin.reviewed ? "Reviewed" : "Mark reviewed"}
            </button>
            <button
              aria-pressed={record.spam}
              className={toggleClass(
                record.spam,
                "border-[#5c6470] bg-[#eef0f4] text-[#3b4150] dark:bg-white/10 dark:text-white/75",
              )}
              disabled={!canWrite}
              onClick={() => toggle("spam")}
              type="button"
            >
              <Prohibit size={14} /> {record.spam ? "Spam" : "Mark spam"}
            </button>
          </div>

          <section className="mt-6">
            <h3 className={sectionLabel}>Answers</h3>
            <dl className="mt-3 divide-y divide-[#eef0f4] rounded-2xl border border-[#e4e8f0] bg-white dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.02]">
              {answerCols.map((column) => {
                const field = column.field;
                const value = field ? row.answers[column.answer?.fieldId ?? column.key] : undefined;
                const answered = isAnswered(value);
                const editable = canWrite && answerIsEditable(column);
                return (
                  <div className="group px-4 py-3" key={column.key}>
                    <dt className="flex items-start gap-2 text-xs font-semibold text-[#5c6679] dark:text-white/50">
                      <span className="min-w-0 flex-1">{column.label}</span>
                      {editable && editing !== column.key ? (
                        <button
                          aria-label={`Edit ${column.label}`}
                          className="rounded p-1 text-[#9ba4b5] opacity-0 transition hover:text-brand-blue focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => setEditing(column.key)}
                          type="button"
                        >
                          <PencilSimple size={13} />
                        </button>
                      ) : null}
                    </dt>
                    <dd className="mt-1 min-w-0 text-sm text-[#171b25] dark:text-white/85">
                      {editing === column.key ? (
                        <AnswerEditor
                          answers={row.answers}
                          column={column}
                          compact={false}
                          onCancel={() => setEditing(null)}
                          onCommit={(next) => {
                            setEditing(null);
                            void onEditAnswer(column, next);
                          }}
                        />
                      ) : !answered ? (
                        <span className="text-[#aab2c0] italic dark:text-white/25">No answer</span>
                      ) : field && isFileAnswer(value) ? (
                        <FileChips
                          files={value}
                          formId={form.id}
                          onOpen={onOpenFile}
                          signature={field.type === "signature"}
                          thumbSize={72}
                        />
                      ) : field?.type === "long_text" ||
                        field?.type === "address" ||
                        field?.type === "matrix" ? (
                        <span className="block whitespace-pre-wrap break-words">
                          {field.type === "matrix"
                            ? cellText(column, row).split("; ").join("\n")
                            : cellText(column, row)}
                        </span>
                      ) : (
                        <span className="flex min-w-0 flex-wrap">
                          <CellView
                            column={column}
                            expanded
                            formId={form.id}
                            onOpenFile={onOpenFile}
                            row={row}
                          />
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
              {extraCols.map((column) => (
                <div className="px-4 py-3" key={column.key}>
                  <dt className="text-xs font-semibold text-[#a97b1c]">
                    {column.label} · computed
                  </dt>
                  <dd className="mt-1 text-sm">
                    {cellText(column, row) || <span className="text-[#aab2c0] italic">empty</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-6">
            <h3 className={sectionLabel}>Tags</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {record.admin.tags.map((tag) => (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-[#eef1f6] py-0.5 pr-1 pl-2.5 text-xs font-medium dark:bg-white/10"
                  key={tag}
                >
                  {tag}
                  {canWrite ? (
                    <button
                      aria-label={`Remove tag ${tag}`}
                      className="rounded-full p-0.5 text-[#8a93a6] hover:bg-white hover:text-brand-red dark:hover:bg-white/10"
                      onClick={() =>
                        void onPatch({ tags: record.admin.tags.filter((item) => item !== tag) })
                      }
                      type="button"
                    >
                      <X size={10} weight="bold" />
                    </button>
                  ) : null}
                </span>
              ))}
              {canWrite ? (
                <input
                  aria-label="Add a tag"
                  className="h-7 min-w-28 flex-1 rounded-lg border border-dashed border-[#d9dfeb] bg-transparent px-2 text-xs outline-none focus:border-brand-blue dark:border-white/15"
                  list={`tags-${form.id}`}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  placeholder="Add a tag, Enter"
                  value={tagInput}
                />
              ) : null}
              <datalist id={`tags-${form.id}`}>
                {suggestions.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </div>
            {canWrite && suggestions.length && !tagInput ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {suggestions.map((tag) => (
                  <button
                    className="rounded-full border border-[#e4e8f0] px-2 py-0.5 text-[11px] text-[#5c6679] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                    key={tag}
                    onClick={() => addTag(tag)}
                    type="button"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="mt-6">
            <label className={sectionLabel} htmlFor={`note-${record.id}`}>
              Private note
            </label>
            <textarea
              className="mt-2 min-h-20 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.045]"
              disabled={!canWrite}
              id={`note-${record.id}`}
              onBlur={() => {
                if ((record.admin.note ?? "") !== note)
                  void onPatch({ note: note.trim() ? note : null });
              }}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Only admins see this."
              value={note}
            />
          </section>

          <section className="mt-6">
            <h3 className={sectionLabel}>Where it came from</h3>
            {meta.latitude !== null && meta.longitude !== null ? (
              <div className="mt-3 rounded-2xl border border-[#e4e8f0] bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]">
                <MiniMap
                  label={place || "Unknown"}
                  latitude={meta.latitude}
                  longitude={meta.longitude}
                />
              </div>
            ) : null}
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
              {metaItems
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div className="contents" key={label}>
                    <dt className="font-semibold text-[#7e899d] dark:text-white/40">{label}</dt>
                    <dd
                      className={`min-w-0 break-words text-[#3b4150] dark:text-white/75 ${label === "IP" || label.endsWith("ID") || label === "Session" ? "font-mono" : ""}`}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-[#e4e8f0] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#161a21] sm:px-5">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d9dfeb] px-3 text-xs font-semibold text-[#3b4150] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/70"
            onClick={() => void copyJson()}
            type="button"
          >
            <Copy size={14} /> Copy JSON
          </button>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d9dfeb] px-3 text-xs font-semibold text-[#3b4150] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/70"
            onClick={print}
            type="button"
          >
            <Printer size={14} /> Print
          </button>
          <span className="ml-auto hidden text-[11px] text-[#9ba4b5] sm:inline">
            J / K to move · Esc to close
          </span>
          {canDelete ? (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-brand-red/40 px-3 text-xs font-semibold text-brand-red hover:bg-brand-red-50 dark:hover:bg-brand-red/10"
              onClick={() => void remove()}
              type="button"
            >
              <Trash size={14} /> Delete
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
