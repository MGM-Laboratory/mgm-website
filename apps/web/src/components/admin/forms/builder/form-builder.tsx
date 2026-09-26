"use client";

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowSquareOut,
  BookmarkSimple,
  CheckCircle,
  CircleNotch,
  Copy,
  DotsThree,
  Export,
  Eye,
  Play,
  RocketLaunch,
  Trash,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { FormDocument, FormRecord } from "@repo/shared";

import { FormsApiError, formsAdminApi } from "@/lib/forms/admin-api";
import { checkDocument, type Problem } from "@/lib/forms/builder-document";
import { useDocumentHistory } from "@/lib/forms/builder-history";
import { useAutosave, type SaveStatus } from "@/lib/forms/builder-save";
import { exportJson, saveTemplate } from "@/lib/forms/builder-templates";

import { FormAnalyticsPanel } from "../analytics/form-analytics-panel";
import { FormResponsesPanel } from "../responses/form-responses-panel";
import { FormSharePanel } from "../share/form-share-panel";
import { BuildTab } from "./build-tab";
import { DesignTab } from "./design-tab";
import { LogicTab } from "./logic-tab";
import { PreviewOverlay } from "./preview-frame";
import { PublishDialog } from "./publish-dialog";
import { SettingsTab } from "./settings-tab";
import type { Selection } from "./types";
import {
  ConfirmDialog,
  Dialog,
  Menu,
  StatusBadge,
  ghostButtonClass,
  iconButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "./ui";

export const BUILDER_TABS = [
  { id: "build", label: "Build" },
  { id: "design", label: "Design" },
  { id: "logic", label: "Logic" },
  { id: "settings", label: "Settings" },
  { id: "share", label: "Share" },
  { id: "responses", label: "Responses" },
  { id: "analytics", label: "Analytics" },
] as const;
export type BuilderTab = (typeof BUILDER_TABS)[number]["id"];

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function SaveIndicator({ onRetry, status }: { onRetry: () => void; status: SaveStatus }) {
  const base = "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold";
  switch (status.kind) {
    case "saved":
      return (
        <span className={`${base} text-[#69748a] dark:text-white/45`}>
          <CheckCircle className="text-brand-green" size={15} weight="fill" />
          <span className="hidden sm:inline">Saved</span>
        </span>
      );
    case "saving":
      return (
        <span className={`${base} text-[#69748a] dark:text-white/45`}>
          <CircleNotch className="animate-spin motion-reduce:animate-none" size={15} />
          <span className="hidden sm:inline">Saving…</span>
        </span>
      );
    case "dirty":
      return (
        <span className={`${base} text-[#8a6412] dark:text-brand-yellow`}>
          <span className="size-2 rounded-full bg-brand-yellow" />
          <span className="hidden sm:inline">Unsaved changes</span>
        </span>
      );
    case "invalid":
      return (
        <span className={`${base} text-brand-red`}>
          <Warning size={15} weight="fill" />
          <span className="hidden sm:inline">
            Fix {status.count} problem{status.count === 1 ? "" : "s"} to save
          </span>
        </span>
      );
    case "error":
      return (
        <button
          className={`${base} text-brand-red hover:bg-brand-red-50 dark:hover:bg-brand-red/15`}
          onClick={onRetry}
          title={status.message}
          type="button"
        >
          <WarningCircle size={15} weight="fill" />
          <span className="hidden sm:inline">Not saved · Retry</span>
        </button>
      );
    default:
      return <span className={`${base} text-[#69748a]`}>Read only</span>;
  }
}

function ProblemsButton({
  onPick,
  problems,
}: {
  onPick: (problem: Problem) => void;
  problems: Problem[];
}) {
  const errors = problems.filter((problem) => problem.severity === "error").length;
  if (!problems.length) return null;
  return (
    <Menu
      buttonClassName={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${errors ? "bg-brand-red-50 text-brand-red dark:bg-brand-red/15" : "bg-brand-yellow-50 text-[#8a6412] dark:bg-brand-yellow/15 dark:text-brand-yellow"}`}
      buttonContent={
        <>
          <Warning size={14} weight="fill" />
          {problems.length}
          <span className="hidden md:inline">{errors ? "problems" : "warnings"}</span>
        </>
      }
      items={problems.slice(0, 30).map((problem) => ({
        label: problem.message,
        icon:
          problem.severity === "error" ? (
            <WarningCircle className="text-brand-red" size={15} weight="fill" />
          ) : (
            <Warning className="text-brand-yellow" size={15} weight="fill" />
          ),
        onSelect: () => onPick(problem),
      }))}
      label={`${problems.length} problems`}
    />
  );
}

/**
 * One form's workspace: the header (title, status, save state, undo/redo,
 * preview, publish) and the tabs. Edits autosave; blocking problems are
 * listed instead of sent.
 */
export function FormBuilder({
  canDelete,
  canReadLinks,
  canWrite,
  canWriteLinks,
  initialRecord,
  initialTab = "build",
  onBack,
  onDelete,
  onDuplicate,
  onRecordChange,
}: {
  canDelete: boolean;
  canReadLinks: boolean;
  canWrite: boolean;
  canWriteLinks: boolean;
  initialRecord: FormRecord;
  initialTab?: BuilderTab;
  onBack: () => void;
  onDelete: (record: FormRecord) => void;
  onDuplicate: (record: FormRecord) => void;
  onRecordChange: (record: FormRecord) => void;
}) {
  const [record, setRecord] = useState(initialRecord);
  const history = useDocumentHistory(initialRecord.document);
  const { change, document, undo, redo, canUndo, canRedo } = history;
  const [tab, setTab] = useState<BuilderTab>(initialTab);
  const [selection, setSelection] = useState<Selection>(null);
  const [multi, setMulti] = useState<Set<string>>(() => new Set());
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [origin, setOrigin] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const readOnly = !canWrite;

  useEffect(() => {
    // The public origin is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  // Sticky columns sit under the site header (69px) plus this header.
  useLayoutEffect(() => {
    const header = headerRef.current;
    const root = rootRef.current;
    if (!header || !root) return;
    const apply = () => root.style.setProperty("--builder-top", `${69 + header.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const check = useMemo(() => checkDocument(document), [document]);
  const errorCount = check.problems.filter((problem) => problem.severity === "error").length;
  // The preview keeps showing the last document that validated.
  const [previewDocument, setPreviewDocument] = useState<FormDocument | undefined>(check.parsed);
  if (check.parsed && check.parsed !== previewDocument) setPreviewDocument(check.parsed);

  const updateRecord = useCallback(
    (next: FormRecord) => {
      setRecord(next);
      onRecordChange(next);
    },
    [onRecordChange],
  );

  const { status, saveNow, dirty } = useAutosave({
    canWrite,
    document,
    errorCount,
    formId: record.id,
    initial: initialRecord.document,
    onSaved: (saved) => updateRecord(saved),
    parsed: check.parsed,
  });

  const select = useCallback((next: Selection) => setSelection(next), []);

  // Keyboard: save, undo and redo, but never while typing in a control
  // (text inputs and the rich text editor keep their own undo).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveNow().then((ok) => {
          if (!ok && check.problems.some((problem) => problem.severity === "error")) {
            toast.error("Fix the problems first", {
              description: "The form is saved once it validates.",
            });
          }
        });
        return;
      }
      if (key !== "z" && key !== "y") return;
      if (isTyping(event.target) || window.document.querySelector("[data-builder-dialog]")) return;
      event.preventDefault();
      if ((key === "z" && event.shiftKey) || key === "y") redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [check.problems, redo, saveNow, undo]);

  const leave = async () => {
    if (!dirty) {
      onBack();
      return;
    }
    if (check.parsed && (await saveNow())) {
      onBack();
      return;
    }
    setConfirmLeave(true);
  };

  const pickProblem = (problem: Problem) => {
    if (problem.target === "settings") setTab("settings");
    else if (problem.target === "design") setTab("design");
    else {
      setTab("build");
      setSelection(problem.target === "form" ? null : problem.target);
      window.requestAnimationFrame(() =>
        window.document
          .querySelector<HTMLElement>(`[data-block-id="${CSS.escape(problem.target)}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }
  };

  const exportDocument = () => {
    const source = check.parsed ?? document;
    const blob = new Blob([exportJson(source)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${record.slug || "form"}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const publicUrl = origin ? `${origin}/forms/${record.slug}` : `/forms/${record.slug}`;
  const tabIndex = BUILDER_TABS.findIndex((item) => item.id === tab);
  const moveTab = (next: number) => {
    const target = (next + BUILDER_TABS.length) % BUILDER_TABS.length;
    setTab(BUILDER_TABS[target].id);
    tabRefs.current[target]?.focus();
  };

  const tabProps = { change, document, record, readOnly, selection, select };
  const saveError = status.kind === "error" ? status : undefined;
  // A save the API refused for a named field shows on that field too.
  const errorPath = saveError?.path;
  const errorMessage = saveError?.message;
  const problems = useMemo<Problem[]>(
    () =>
      errorPath
        ? [
            {
              key: `api:${errorPath}`,
              message: `Not saved: ${errorMessage}`,
              severity: "error",
              target: targetFromPath(document, errorPath),
              path: errorPath,
            },
            ...check.problems,
          ]
        : check.problems,
    [check.problems, document, errorMessage, errorPath],
  );

  return (
    <div
      className="min-w-0"
      ref={rootRef}
      style={{ "--builder-top": "181px" } as React.CSSProperties}
    >
      <div
        className="sticky top-[69px] z-30 border-b border-[#dee4ef] bg-[#f5f7fb]/95 backdrop-blur dark:border-white/10 dark:bg-[#0f1117]/95"
        ref={headerRef}
      >
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-2 gap-y-2 px-3 pt-3 sm:px-6">
          <button
            aria-label="Back to all forms"
            className={iconButtonClass}
            onClick={() => void leave()}
            title="All forms"
            type="button"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
            <input
              aria-label="Form title"
              className="min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-display text-lg font-semibold tracking-[-0.03em] outline-none transition hover:border-[#d9dfeb] focus:border-brand-blue focus:bg-white sm:text-xl dark:hover:border-white/10 dark:focus:bg-white/[0.05]"
              maxLength={200}
              onChange={(event) => {
                const title = event.target.value;
                change(
                  (current) => ({
                    ...current,
                    title,
                    welcome:
                      current.welcome.title === current.title
                        ? { ...current.welcome, title }
                        : current.welcome,
                  }),
                  "form.title",
                );
              }}
              placeholder="Untitled form"
              readOnly={readOnly}
              value={document.title}
            />
            <StatusBadge status={record.status} />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <SaveIndicator onRetry={() => void saveNow()} status={status} />
            <ProblemsButton onPick={pickProblem} problems={problems} />
            {!readOnly ? (
              <>
                <button
                  aria-label="Undo"
                  className={iconButtonClass}
                  disabled={!canUndo}
                  onClick={undo}
                  title="Undo (Cmd/Ctrl+Z)"
                  type="button"
                >
                  <ArrowCounterClockwise size={17} />
                </button>
                <button
                  aria-label="Redo"
                  className={iconButtonClass}
                  disabled={!canRedo}
                  onClick={redo}
                  title="Redo (Shift+Cmd/Ctrl+Z)"
                  type="button"
                >
                  <ArrowClockwise size={17} />
                </button>
              </>
            ) : null}
            <button
              className={`${ghostButtonClass} max-sm:hidden`}
              onClick={() => setPreviewing(true)}
              type="button"
            >
              <Play size={15} weight="fill" />
              Preview
            </button>
            <button
              aria-label="Preview"
              className={`${iconButtonClass} sm:hidden`}
              onClick={() => setPreviewing(true)}
              type="button"
            >
              <Eye size={17} />
            </button>
            {record.status !== "draft" ? (
              <a
                aria-label="View live form in a new tab"
                className={`${ghostButtonClass} max-md:hidden`}
                href={publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ArrowSquareOut size={15} />
                View live
              </a>
            ) : null}
            <Menu
              buttonContent={<DotsThree size={20} weight="bold" />}
              items={[
                { label: "Export JSON", icon: <Export size={16} />, onSelect: exportDocument },
                {
                  label: "Save as template",
                  icon: <BookmarkSimple size={16} />,
                  onSelect: () => setTemplateDialog(true),
                },
                ...(record.status !== "draft"
                  ? [
                      {
                        label: "View live",
                        icon: <ArrowSquareOut size={16} />,
                        onSelect: () => window.open(publicUrl, "_blank", "noopener"),
                      },
                    ]
                  : []),
                {
                  label: "Duplicate form",
                  icon: <Copy size={16} />,
                  disabled: readOnly,
                  onSelect: () => onDuplicate(record),
                },
                "separator",
                {
                  label: "Delete form",
                  icon: <Trash size={16} />,
                  danger: true,
                  disabled: !canDelete,
                  onSelect: () => onDelete(record),
                },
              ]}
              label="Form actions"
            />
            {!readOnly ? (
              <button
                className={`${primaryButtonClass} h-9 px-3.5`}
                onClick={() => setPublishing(true)}
                type="button"
              >
                <RocketLaunch size={16} weight="fill" />
                {record.status === "draft" ? "Publish" : "Link & status"}
              </button>
            ) : null}
          </div>
        </div>
        {saveError ? (
          <p
            className="mx-auto max-w-[1680px] px-4 pt-2 text-xs font-semibold text-brand-red sm:px-7"
            role="alert"
          >
            {saveError.message}
            {saveError.path ? (
              <button
                className="ml-2 underline"
                onClick={() =>
                  pickProblem({
                    key: "api",
                    message: saveError.message,
                    severity: "error",
                    target: targetFromPath(document, saveError.path ?? ""),
                  })
                }
                type="button"
              >
                Show me
              </button>
            ) : null}
          </p>
        ) : null}
        <div className="mx-auto max-w-[1680px] px-3 sm:px-6">
          <div
            aria-label="Form workspace"
            className="-mb-px flex gap-1 overflow-x-auto pt-2"
            role="tablist"
          >
            {BUILDER_TABS.map((item, index) => {
              const selected = item.id === tab;
              return (
                <button
                  aria-controls="builder-panel"
                  aria-selected={selected}
                  className={`relative shrink-0 px-3 pt-1.5 pb-2.5 text-sm font-semibold whitespace-nowrap transition focus-visible:rounded-t-lg focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none ${selected ? "text-[#171b25] dark:text-white" : "text-[#69748a] hover:text-[#171b25] dark:text-white/50 dark:hover:text-white"}`}
                  id={`builder-tab-${item.id}`}
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      moveTab(tabIndex + 1);
                    } else if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      moveTab(tabIndex - 1);
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      moveTab(0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      moveTab(BUILDER_TABS.length - 1);
                    }
                  }}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  {item.label}
                  {item.id === "responses" && record.stats.responses ? (
                    <span className="ml-1.5 rounded-full bg-[#e8ecf4] px-1.5 py-0.5 font-mono text-[10px] dark:bg-white/10">
                      {record.stats.responses}
                    </span>
                  ) : null}
                  {selected ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-blue" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        aria-labelledby={`builder-tab-${tab}`}
        className="admin-editor-enter min-w-0"
        id="builder-panel"
        key={tab}
        role="tabpanel"
      >
        {tab === "build" ? (
          <BuildTab
            {...tabProps}
            multi={multi}
            origin={origin}
            problems={problems}
            setMulti={setMulti}
            undo={undo}
          />
        ) : tab === "design" ? (
          <DesignTab {...tabProps} previewDocument={previewDocument} />
        ) : tab === "logic" ? (
          <LogicTab {...tabProps} />
        ) : tab === "settings" ? (
          <SettingsTab
            {...tabProps}
            canDelete={canDelete}
            onDeleteForm={() => onDelete(record)}
            onRecordChange={updateRecord}
          />
        ) : (
          <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-8">
            {tab === "share" ? (
              <FormSharePanel
                canReadLinks={canReadLinks}
                canWrite={canWrite}
                canWriteLinks={canWriteLinks}
                form={record}
                onFormChange={updateRecord}
                origin={origin}
              />
            ) : tab === "responses" ? (
              <FormResponsesPanel canDelete={canDelete} canWrite={canWrite} form={record} />
            ) : (
              <FormAnalyticsPanel form={record} />
            )}
          </div>
        )}
      </div>

      {publishing ? (
        <PublishDialog
          onClose={() => setPublishing(false)}
          onRecordChange={updateRecord}
          origin={origin}
          problemCount={errorCount}
          record={record}
          saveNow={saveNow}
        />
      ) : null}
      {previewing ? (
        <PreviewOverlay
          document={previewDocument}
          focusFieldId={
            selection && !selection.includes(":") && selection !== "welcome" ? selection : undefined
          }
          onClose={() => setPreviewing(false)}
          slug={record.slug}
        />
      ) : null}
      {templateDialog ? (
        <SaveTemplateDialog
          document={check.parsed ?? document}
          onClose={() => setTemplateDialog(false)}
        />
      ) : null}
      {confirmLeave ? (
        <ConfirmDialog
          body={
            errorCount
              ? `This form has ${errorCount} problem${errorCount === 1 ? "" : "s"}, so the latest edits can't be saved. Leave and lose them?`
              : "The latest edits haven't reached the server. Leave and lose them?"
          }
          confirmLabel="Discard and leave"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            setConfirmLeave(false);
            onBack();
          }}
          title="Leave with unsaved changes?"
        />
      ) : null}
    </div>
  );
}

function targetFromPath(document: FormDocument, path: string) {
  const [head, index] = path.split(".");
  if (head === "fields") return document.fields[Number(index)]?.id ?? "form";
  if (head === "endings") {
    const ending = document.endings[Number(index)];
    return ending ? `ending:${ending.id}` : "form";
  }
  return head === "settings" || head === "design" ? head : head === "welcome" ? "welcome" : "form";
}

function SaveTemplateDialog({
  document,
  onClose,
}: {
  document: FormDocument;
  onClose: () => void;
}) {
  const [name, setName] = useState(document.title);
  const [description, setDescription] = useState("");
  return (
    <Dialog
      description="Keeps this form's questions, logic and design as a starting point under “My templates” in the New form gallery. Templates stay in this browser."
      footer={
        <>
          <button className={secondaryButtonClass} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={primaryButtonClass}
            disabled={!name.trim()}
            onClick={() => {
              try {
                saveTemplate(name, description, document);
                toast.success("Saved to My templates");
                onClose();
              } catch {
                toast.error("This browser refused to store the template.");
              }
            }}
            type="button"
          >
            Save template
          </button>
        </>
      }
      onClose={onClose}
      size="sm"
      title="Save as template"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            Name
          </span>
          <input
            className={inputClass}
            data-autofocus=""
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            Description
          </span>
          <textarea
            className={textareaClass}
            maxLength={300}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
      </div>
    </Dialog>
  );
}

/** Loads a form by id, then opens its builder; a skeleton meanwhile, a retry on failure. */
export function FormBuilderLoader(
  props: Omit<React.ComponentProps<typeof FormBuilder>, "initialRecord"> & {
    formId: string;
    initialRecord?: FormRecord;
  },
) {
  const { formId, initialRecord, ...rest } = props;
  const [record, setRecord] = useState<FormRecord | undefined>(initialRecord);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (record) return;
    let cancelled = false;
    formsAdminApi
      .get(formId)
      .then(({ form }) => {
        if (!cancelled) setRecord(form);
      })
      .catch((failure: unknown) => {
        if (!cancelled)
          setError(
            failure instanceof FormsApiError || failure instanceof Error
              ? failure.message
              : "The form could not be loaded.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, formId, record]);

  if (record) return <FormBuilder {...rest} initialRecord={record} />;
  return (
    <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          aria-label="Back to all forms"
          className={iconButtonClass}
          onClick={rest.onBack}
          type="button"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        {error ? null : <div className="builder-skeleton h-7 w-64 rounded-lg" />}
      </div>
      {error ? (
        <div
          className="mt-10 grid place-items-center rounded-2xl border border-dashed border-[#d9dfeb] p-10 text-center dark:border-white/10"
          role="alert"
        >
          <div>
            <p className="font-display text-lg font-semibold">This form couldn&rsquo;t be opened</p>
            <p className="mt-1 text-sm text-[#778299] dark:text-white/45">{error}</p>
            <button
              className={`${secondaryButtonClass} mt-4`}
              onClick={() => {
                setError(undefined);
                setAttempt((current) => current + 1);
              }}
              type="button"
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div
          aria-busy="true"
          aria-label="Loading the form"
          className="mt-6 grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_22rem]"
        >
          <div className="builder-skeleton hidden h-96 rounded-2xl lg:block" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((index) => (
              <div className="builder-skeleton h-28 rounded-2xl" key={index} />
            ))}
          </div>
          <div className="builder-skeleton hidden h-96 rounded-2xl lg:block" />
        </div>
      )}
    </div>
  );
}
