"use client";

import {
  Clock,
  FileArrowUp,
  MagnifyingGlass,
  Plus,
  Question,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import type { FormDocument } from "@repo/shared";

import {
  documentStats,
  parseImportedJson,
  parseTemplateDocument,
  readSavedTemplates,
  removeSavedTemplate,
  type SavedTemplate,
} from "@/lib/forms/builder-templates";
import { PROJECT_THEMES, projectPaletteVars } from "@/lib/project-themes";
import { FIELD_TYPE_INFO } from "@/lib/forms/builder-fields";

import { FORM_TEMPLATES } from "../templates";
import { TEMPLATE_CATEGORIES, type FormTemplate, type TemplateCategory } from "../templates/types";
import { FieldIcon } from "./field-icons";
import {
  Dialog,
  eyebrowClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "./ui";

/** A miniature of the form: its theme colours, title, and first questions as skeleton lines. */
export function MiniPreview({ document }: { document: FormDocument }) {
  const theme = PROJECT_THEMES[document.design.theme] ?? PROJECT_THEMES.laboratory;
  const questions = document.fields
    .filter(
      (field) => field.type !== "page_break" && field.type !== "spacer" && field.type !== "divider",
    )
    .slice(0, 3);
  return (
    <div
      aria-hidden="true"
      className="relative flex h-36 flex-col overflow-hidden rounded-xl bg-[var(--project-bg)] p-3.5 text-[var(--project-text)] ring-1 ring-black/[0.06]"
      style={projectPaletteVars(theme.light) as React.CSSProperties}
    >
      <span className="absolute -top-6 -right-6 size-20 rounded-full bg-[var(--project-highlight)] opacity-20" />
      <span className="line-clamp-1 font-display text-[13px] leading-tight font-semibold tracking-[-0.02em]">
        {document.welcome.title || document.title}
      </span>
      <div className="mt-2.5 space-y-2">
        {questions.map((field, index) => (
          <div className="flex items-center gap-2" key={field.id}>
            <span className="grid size-5 shrink-0 place-items-center rounded-md bg-[var(--project-line)] text-[var(--project-muted)]">
              <FieldIcon size={11} type={field.type} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block h-1.5 rounded-full bg-[var(--project-text)] opacity-60"
                style={{ width: `${[78, 62, 70][index]}%` }}
              />
              <span
                className="mt-1 block h-3 rounded-md border border-[var(--project-line)]"
                style={{ width: `${[92, 84, 88][index]}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <span className="mt-auto inline-flex h-5 w-14 items-center justify-center self-start rounded-full bg-[var(--project-button-bg)]">
        <span className="h-1 w-6 rounded-full bg-[var(--project-button-text)] opacity-80" />
      </span>
    </div>
  );
}

function TileMeta({ document }: { document: FormDocument }) {
  const stats = documentStats(document);
  const types = [...new Set(document.fields.map((field) => field.type))]
    .filter((type) => type !== "page_break")
    .slice(0, 6);
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[#7e899d] dark:text-white/40">
      <span className="inline-flex items-center gap-1">
        <Question aria-hidden="true" size={12} weight="bold" />
        {stats.questions} questions
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock aria-hidden="true" size={12} weight="bold" />
        {stats.minutes} min
      </span>
      <span
        className="flex items-center gap-1"
        title={types.map((type) => FIELD_TYPE_INFO[type].label).join(", ")}
      >
        {types.map((type) => (
          <FieldIcon
            className="text-[#9ba4b5] dark:text-white/30"
            key={type}
            size={12}
            type={type}
          />
        ))}
      </span>
    </div>
  );
}

export const TemplateTile = memo(function TemplateTile({
  onChoose,
  template,
  busy,
}: {
  onChoose: () => void;
  template: FormTemplate;
  busy?: boolean;
}) {
  const document = parseTemplateDocument(template.document);
  if (!document) return null;
  const category = TEMPLATE_CATEGORIES.find((item) => item.id === template.category);
  return (
    <button
      aria-busy={busy}
      className="group flex min-w-0 flex-col rounded-2xl border border-[#dfe4ee] bg-white p-2.5 text-left transition hover:-translate-y-0.5 hover:border-brand-blue/50 hover:shadow-[0_22px_45px_-32px_rgba(20,32,58,0.6)] focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none disabled:opacity-60 motion-reduce:hover:translate-y-0 dark:border-white/10 dark:bg-white/[0.035]"
      disabled={busy}
      onClick={onChoose}
      type="button"
    >
      <MiniPreview document={document} />
      <span className="mt-3 px-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-[#171b25] dark:text-white">
            {template.name}
          </span>
          {document.settings.language === "id" ? (
            <span className="shrink-0 rounded-full bg-[#eef1f6] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#5d687d] dark:bg-white/10 dark:text-white/55">
              ID
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-[#69748a] dark:text-white/45">
          {template.description}
        </span>
        {category ? <span className="sr-only">{category.label}</span> : null}
        <TileMeta document={document} />
      </span>
    </button>
  );
});

type Tab = "all" | TemplateCategory | "mine";

export type GalleryChoice =
  | { kind: "blank" }
  | { kind: "template"; template: FormTemplate }
  | { kind: "document"; document: FormDocument; name: string };

/** The "New form" sheet: blank, the built-in templates by category, and My templates. */
export function TemplateGallery({
  busy,
  onChoose,
  onClose,
  onImport,
}: {
  busy: boolean;
  onChoose: (choice: GalleryChoice) => void;
  onClose: () => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState<SavedTemplate[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Local storage is only readable in the browser, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMine(readSavedTemplates());
  }, []);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "All", count: FORM_TEMPLATES.length },
    ...TEMPLATE_CATEGORIES.map((category) => ({
      id: category.id as Tab,
      label: category.label,
      count: FORM_TEMPLATES.filter((template) => template.category === category.id).length,
    })),
    { id: "mine", label: "My templates", count: mine.length },
  ];

  const needle = query.trim().toLocaleLowerCase();
  const templates = useMemo(
    () =>
      FORM_TEMPLATES.filter(
        (template) =>
          (tab === "all" || template.category === tab) &&
          (!needle ||
            `${template.name} ${template.description} ${template.category}`
              .toLocaleLowerCase()
              .includes(needle)),
      ),
    [needle, tab],
  );
  const mineVisible = mine.filter(
    (item) => !needle || `${item.name} ${item.description}`.toLocaleLowerCase().includes(needle),
  );

  const tabIndex = tabs.findIndex((item) => item.id === tab);
  const moveTab = (next: number) => {
    const target = (next + tabs.length) % tabs.length;
    setTab(tabs[target].id);
    tabRefs.current[target]?.focus();
  };

  return (
    <Dialog
      bare
      description="Start blank, or from a ready-made form you can change freely."
      onClose={onClose}
      size="full"
      title="New form"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-[#e3e7f0] px-5 pt-4 sm:px-6 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
              <MagnifyingGlass
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8490a5]"
                size={17}
              />
              <input
                aria-label="Search templates"
                className={`${inputClass} pl-9`}
                data-autofocus=""
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search templates"
                type="search"
                value={query}
              />
            </div>
            <button className={`${secondaryButtonClass} ml-auto`} onClick={onImport} type="button">
              <UploadSimple size={16} weight="bold" />
              Import JSON
            </button>
          </div>
          <div
            aria-label="Template categories"
            className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-0"
            role="tablist"
          >
            {tabs.map((item, index) => {
              const selected = item.id === tab;
              return (
                <button
                  aria-controls="template-panel"
                  aria-selected={selected}
                  className={`relative shrink-0 rounded-t-lg px-3 pt-1.5 pb-2.5 text-sm font-semibold whitespace-nowrap transition focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none ${selected ? "text-brand-blue" : "text-[#69748a] hover:text-[#171b25] dark:text-white/50 dark:hover:text-white"}`}
                  id={`template-tab-${item.id}`}
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      moveTab(tabIndex + 1);
                    } else if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      moveTab(tabIndex - 1);
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
                  <span className="ml-1.5 font-mono text-[10px] opacity-60">{item.count}</span>
                  {selected ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-blue" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div
          aria-labelledby={`template-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
          id="template-panel"
          role="tabpanel"
        >
          <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {tab !== "mine" && !needle ? (
              <button
                className="group flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-blue/35 bg-brand-blue/[0.03] p-6 text-center transition hover:border-brand-blue hover:bg-brand-blue/[0.06] focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none disabled:opacity-60"
                disabled={busy}
                onClick={() => onChoose({ kind: "blank" })}
                type="button"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-blue text-white shadow-[0_14px_28px_-16px_rgba(58,109,197,0.9)] transition group-hover:scale-105 motion-reduce:group-hover:scale-100">
                  <Plus size={22} weight="bold" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[#171b25] dark:text-white">
                    Blank form
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#69748a] dark:text-white/45">
                    A welcome screen, a thank-you screen, and room for your questions.
                  </span>
                </span>
              </button>
            ) : null}
            {tab === "mine"
              ? mineVisible.map((item) => {
                  const document = parseTemplateDocument(item.document);
                  if (!document) return null;
                  return (
                    <div className="relative min-w-0" key={item.id}>
                      <button
                        className="flex w-full min-w-0 flex-col rounded-2xl border border-[#dfe4ee] bg-white p-2.5 text-left transition hover:border-brand-blue/50 focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none dark:border-white/10 dark:bg-white/[0.035]"
                        disabled={busy}
                        onClick={() => onChoose({ kind: "document", document, name: item.name })}
                        type="button"
                      >
                        <MiniPreview document={document} />
                        <span className="mt-3 block truncate px-1 text-sm font-semibold">
                          {item.name}
                        </span>
                        <span className="line-clamp-2 block px-1 text-xs leading-5 text-[#69748a] dark:text-white/45">
                          {item.description ||
                            `Saved ${new Date(item.savedAt).toLocaleDateString("en-GB")}`}
                        </span>
                        <span className="px-1">
                          <TileMeta document={document} />
                        </span>
                      </button>
                      <button
                        aria-label={`Remove ${item.name} from my templates`}
                        className="absolute top-4 right-4 grid size-8 place-items-center rounded-lg bg-white/90 text-[#667187] shadow transition hover:text-brand-red dark:bg-[#1a1f2b]/90"
                        onClick={() => {
                          removeSavedTemplate(item.id);
                          setMine(readSavedTemplates());
                        }}
                        type="button"
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  );
                })
              : templates.map((template) => (
                  <TemplateTile
                    busy={busy}
                    key={template.id}
                    onChoose={() => onChoose({ kind: "template", template })}
                    template={template}
                  />
                ))}
          </div>
          {tab === "mine" && !mineVisible.length ? (
            <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[#d9dfeb] px-6 text-center dark:border-white/10">
              <p className="max-w-sm text-sm leading-6 text-[#778299] dark:text-white/45">
                No saved templates yet. In the builder, open the form menu and choose &ldquo;Save as
                template&rdquo; to keep a form&rsquo;s structure for later. They stay in this
                browser.
              </p>
            </div>
          ) : tab !== "mine" && !templates.length ? (
            <p className="mt-6 text-center text-sm text-[#778299]">
              No template matches &ldquo;{query}&rdquo;.
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** Paste or upload a form's JSON; validated with the shared schema before it is created. */
export function ImportDialog({
  busy,
  onClose,
  onImport,
}: {
  busy: boolean;
  onClose: () => void;
  onImport: (document: FormDocument) => void;
}) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const result = parseImportedJson(text);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    onImport(result.document);
  };

  return (
    <Dialog
      description="Paste a form exported from this builder, or choose its .json file. It is checked before anything is created."
      footer={
        <>
          <button className={secondaryButtonClass} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={primaryButtonClass}
            disabled={busy || !text.trim()}
            onClick={submit}
            type="button"
          >
            {busy ? "Creating…" : "Create form"}
          </button>
        </>
      }
      onClose={onClose}
      size="lg"
      title="Import a form"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className={eyebrowClass} htmlFor="import-json">
            Form JSON
          </label>
          <button
            className={secondaryButtonClass}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            <FileArrowUp size={16} />
            Choose file
          </button>
          <input
            accept="application/json,.json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 3 * 1024 * 1024) {
                setErrors(["That file is larger than 3 MB; a form export is much smaller."]);
                return;
              }
              setText(await file.text());
              setErrors([]);
            }}
            ref={fileRef}
            tabIndex={-1}
            type="file"
          />
        </div>
        <textarea
          aria-describedby={errors.length ? "import-errors" : undefined}
          aria-invalid={errors.length > 0}
          className={`${textareaClass} min-h-72 font-mono text-xs`}
          data-autofocus=""
          id="import-json"
          onChange={(event) => setText(event.target.value)}
          placeholder='{ "kind": "mgm-form", "version": 1, "document": { "title": "…" } }'
          spellCheck={false}
          value={text}
        />
        {errors.length ? (
          <ul
            className="space-y-1 rounded-xl bg-brand-red-50 p-3 text-xs leading-5 text-brand-red dark:bg-brand-red/15"
            id="import-errors"
            role="alert"
          >
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
