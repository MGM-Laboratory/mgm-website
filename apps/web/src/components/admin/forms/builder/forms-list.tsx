"use client";

import {
  ArrowSquareOut,
  ChartLineUp,
  ClipboardText,
  Copy,
  DotsThree,
  Eye,
  LinkSimple,
  ListBullets,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SquaresFour,
  Trash,
  Tray,
  UploadSimple,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import type { FormStatus, FormSummary } from "@repo/shared";

import { relativeTime } from "@/lib/forms/builder-document";
import { PROJECT_THEMES } from "@/lib/project-themes";

import { featuredTemplates } from "../templates";
import type { FormTemplate } from "../templates/types";
import { TemplateTile } from "./template-gallery";
import {
  Menu,
  Segmented,
  StatusBadge,
  eyebrowClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./ui";

export type FormsListAction =
  "open" | "responses" | "copy" | "live" | "duplicate" | "delete" | "analytics";

type SortKey = "updated" | "created" | "responses" | "title";
type StatusFilter = "all" | FormStatus;

const VIEW_KEY = "mgm-forms-view";

function readView(): "grid" | "list" {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** The five colour stripes of a theme: light bg, text, highlight, button, dark bg. */
export function ThemeStrip({
  theme,
  className = "h-2",
}: {
  theme: FormSummary["theme"];
  className?: string;
}) {
  const palette = PROJECT_THEMES[theme] ?? PROJECT_THEMES.laboratory;
  const colors = [
    palette.light.bg,
    palette.light.highlight,
    palette.light.buttonBg,
    palette.dark.highlight,
    palette.dark.bg,
  ];
  return (
    <span aria-hidden="true" className={`flex overflow-hidden ${className}`}>
      {colors.map((color, index) => (
        <span className="flex-1" key={`${color}-${index}`} style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

function conversion(form: FormSummary) {
  if (!form.stats.views) return "–";
  return `${Math.min(100, Math.round((form.stats.responses / form.stats.views) * 100))}%`;
}

function FormActions({
  canDelete,
  canWrite,
  form,
  onAction,
}: {
  canDelete: boolean;
  canWrite: boolean;
  form: FormSummary;
  onAction: (action: FormsListAction, form: FormSummary) => void;
}) {
  return (
    <Menu
      buttonContent={<DotsThree size={20} weight="bold" />}
      items={[
        {
          label: canWrite ? "Open builder" : "Open",
          icon: <PencilSimple size={16} />,
          onSelect: () => {
            onAction("open", form);
          },
        },
        {
          label: "Open responses",
          icon: <Tray size={16} />,
          onSelect: () => {
            onAction("responses", form);
          },
        },
        {
          label: "Analytics",
          icon: <ChartLineUp size={16} />,
          onSelect: () => {
            onAction("analytics", form);
          },
        },
        "separator",
        {
          label: "Copy public link",
          icon: <LinkSimple size={16} />,
          onSelect: () => {
            onAction("copy", form);
          },
        },
        {
          label: "View live",
          icon: <ArrowSquareOut size={16} />,
          disabled: form.status === "draft",
          hint: form.status === "draft" ? "draft" : undefined,
          onSelect: () => {
            onAction("live", form);
          },
        },
        {
          label: "Duplicate",
          icon: <Copy size={16} />,
          disabled: !canWrite,
          onSelect: () => {
            onAction("duplicate", form);
          },
        },
        "separator",
        {
          label: "Delete",
          icon: <Trash size={16} />,
          danger: true,
          disabled: !canDelete,
          onSelect: () => {
            onAction("delete", form);
          },
        },
      ]}
      label={`Actions for ${form.title || "Untitled form"}`}
    />
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate font-mono text-[9px] font-bold tracking-[0.14em] text-[#8490a5] uppercase dark:text-white/35">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-[#171b25] dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function FormCard({
  canDelete,
  canWrite,
  form,
  mounted,
  onAction,
}: {
  canDelete: boolean;
  canWrite: boolean;
  form: FormSummary;
  mounted: boolean;
  onAction: (action: FormsListAction, form: FormSummary) => void;
}) {
  const title = form.title || "Untitled form";
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#dfe4ee] bg-white shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] transition hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-[0_22px_45px_-30px_rgba(20,32,58,0.55)] focus-within:border-brand-blue/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-white/10 dark:bg-white/[0.035]">
      <ThemeStrip theme={form.theme} />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-lg font-semibold tracking-[-0.03em]">
              <button
                className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                onClick={() => {
                  onAction("open", form);
                }}
                type="button"
              >
                {title}
              </button>
            </h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[#7e899d] dark:text-white/40">
              /forms/{form.slug}
            </p>
          </div>
          <div className="relative z-10 -mr-1 -mt-1 flex items-center gap-1">
            <StatusBadge status={form.status} />
            <FormActions
              canDelete={canDelete}
              canWrite={canWrite}
              form={form}
              onAction={onAction}
            />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[#eef1f6] pt-3 dark:border-white/[0.07]">
          <Stat label="Responses" value={form.stats.responses.toLocaleString("en-US")} />
          <Stat label="Views" value={form.stats.views.toLocaleString("en-US")} />
          <Stat label="Conversion" value={conversion(form)} />
        </dl>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8490a5] dark:text-white/40">
          <span>{form.questionCount} questions</span>
          <span aria-hidden="true">·</span>
          <span suppressHydrationWarning>
            Last response {mounted ? relativeTime(form.stats.lastResponseAt) : "…"}
          </span>
          {form.hasPassphrase ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Passphrase</span>
            </>
          ) : null}
        </p>
      </div>
    </article>
  );
}

function FormRow({
  canDelete,
  canWrite,
  form,
  mounted,
  onAction,
}: {
  canDelete: boolean;
  canWrite: boolean;
  form: FormSummary;
  mounted: boolean;
  onAction: (action: FormsListAction, form: FormSummary) => void;
}) {
  return (
    <li className="relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-[#f7f9fc] sm:flex-nowrap dark:hover:bg-white/[0.03]">
      <ThemeStrip className="h-8 w-2 shrink-0 flex-col rounded-full" theme={form.theme} />
      <div className="min-w-0 flex-1 basis-48">
        <button
          className="block max-w-full truncate text-left text-sm font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          onClick={() => {
            onAction("open", form);
          }}
          type="button"
        >
          {form.title || "Untitled form"}
        </button>
        <p className="truncate font-mono text-[11px] text-[#7e899d] dark:text-white/40">
          /forms/{form.slug}
        </p>
      </div>
      <StatusBadge status={form.status} />
      <span className="w-20 text-right text-sm tabular-nums">
        {form.stats.responses.toLocaleString("en-US")}
        <span className="block text-[10px] text-[#8490a5]">responses</span>
      </span>
      <span className="hidden w-16 text-right text-sm tabular-nums md:block">
        {form.stats.views.toLocaleString("en-US")}
        <span className="block text-[10px] text-[#8490a5]">views</span>
      </span>
      <span className="hidden w-16 text-right text-sm tabular-nums md:block">
        {conversion(form)}
        <span className="block text-[10px] text-[#8490a5]">conv.</span>
      </span>
      <span
        className="hidden w-28 text-right text-xs text-[#8490a5] lg:block"
        suppressHydrationWarning
      >
        {mounted ? relativeTime(form.stats.lastResponseAt) : "…"}
      </span>
      <div className="relative z-10">
        <FormActions canDelete={canDelete} canWrite={canWrite} form={form} onAction={onAction} />
      </div>
    </li>
  );
}

export function FormsList({
  canDelete,
  canWrite,
  forms,
  loading,
  onAction,
  onImport,
  onNew,
  onPickTemplate,
}: {
  canDelete: boolean;
  canWrite: boolean;
  forms: FormSummary[];
  loading: boolean;
  onAction: (action: FormsListAction, form: FormSummary) => void;
  onImport: () => void;
  onNew: () => void;
  onPickTemplate: (template: FormTemplate | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Reading the stored view and the clock only after mount keeps the
    // server-rendered list identical to the first client render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(readView());
    setMounted(true);
  }, []);

  const chooseView = (next: "grid" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private windows may refuse storage; the choice just won't stick.
    }
  };

  const counts = useMemo(() => {
    const result = { all: forms.length, draft: 0, published: 0, closed: 0 };
    for (const form of forms) result[form.status] += 1;
    return result;
  }, [forms]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = forms.filter(
      (form) =>
        (status === "all" || form.status === status) &&
        (!needle || `${form.title} ${form.slug}`.toLocaleLowerCase().includes(needle)),
    );
    const sorted = [...filtered];
    sorted.sort((left, right) => {
      switch (sort) {
        case "created":
          return right.createdAt.localeCompare(left.createdAt);
        case "responses":
          return right.stats.responses - left.stats.responses;
        case "title":
          return (left.title || "").localeCompare(right.title || "", "en", { sensitivity: "base" });
        default:
          return right.updatedAt.localeCompare(left.updatedAt);
      }
    });
    return sorted;
  }, [forms, query, sort, status]);

  const featured = useMemo(() => featuredTemplates(), []);

  return (
    <div className="mx-auto w-full max-w-[1680px] px-4 pt-8 pb-20 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-red uppercase">
            Forms
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Forms
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#69748a] dark:text-white/50">
            Registrations, surveys, quizzes and applications. Design a form, publish it at its own
            link, and read every response here.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClass} onClick={onImport} type="button">
              <UploadSimple size={16} weight="bold" />
              Import JSON
            </button>
            <button className={primaryButtonClass} onClick={onNew} type="button">
              <Plus size={16} weight="bold" />
              New form
            </button>
          </div>
        ) : null}
      </div>

      {forms.length || loading ? (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-0 flex-1 basis-60 sm:max-w-xs">
              <MagnifyingGlass
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8490a5]"
                size={17}
              />
              <input
                aria-label="Search forms by title or link"
                className={`${inputClass} pl-9`}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="Search title or link"
                type="search"
                value={query}
              />
            </div>
            <Segmented<StatusFilter>
              label="Filter by status"
              onChange={setStatus}
              options={(["all", "draft", "published", "closed"] as const).map((value) => ({
                value,
                label: (
                  <>
                    {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
                    <span className="font-mono text-[10px] opacity-60">{counts[value]}</span>
                  </>
                ),
              }))}
              value={status}
            />
            <div className="ml-auto flex items-center gap-2">
              <label className="sr-only" htmlFor="forms-sort">
                Sort forms
              </label>
              <select
                className={`${inputClass} w-auto pr-8`}
                id="forms-sort"
                onChange={(event) => {
                  setSort(event.target.value as SortKey);
                }}
                value={sort}
              >
                <option value="updated">Last updated</option>
                <option value="created">Newest</option>
                <option value="responses">Most responses</option>
                <option value="title">Title A–Z</option>
              </select>
              <div className="shrink-0">
                <Segmented<"grid" | "list">
                  label="Layout"
                  onChange={chooseView}
                  options={[
                    {
                      value: "grid",
                      label: <SquaresFour aria-label="Grid" size={16} />,
                      title: "Grid",
                    },
                    {
                      value: "list",
                      label: <ListBullets aria-label="List" size={16} />,
                      title: "List",
                    },
                  ]}
                  value={view}
                />
              </div>
            </div>
          </div>

          <p aria-live="polite" className="mt-5 mb-3 text-xs text-[#8490a5] dark:text-white/40">
            {loading && !forms.length
              ? "Loading forms…"
              : `${visible.length} of ${forms.length} forms`}
          </p>

          {loading && !forms.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {[0, 1, 2].map((index) => (
                <div className="builder-skeleton h-44 rounded-2xl" key={index} />
              ))}
            </div>
          ) : visible.length ? (
            view === "grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visible.map((form) => (
                  <FormCard
                    canDelete={canDelete}
                    canWrite={canWrite}
                    form={form}
                    key={form.id}
                    mounted={mounted}
                    onAction={onAction}
                  />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-[#eef1f6] overflow-visible rounded-2xl border border-[#dfe4ee] bg-white dark:divide-white/[0.07] dark:border-white/10 dark:bg-white/[0.035]">
                {visible.map((form) => (
                  <FormRow
                    canDelete={canDelete}
                    canWrite={canWrite}
                    form={form}
                    key={form.id}
                    mounted={mounted}
                    onAction={onAction}
                  />
                ))}
              </ul>
            )
          ) : (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#d9dfeb] px-6 text-center dark:border-white/10">
              <div>
                <p className="font-display text-lg font-semibold tracking-[-0.03em]">
                  No forms match
                </p>
                <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
                  Try another search or status.
                </p>
                <button
                  className={`${secondaryButtonClass} mt-4`}
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <section
          aria-labelledby="forms-empty-title"
          className="mt-10 overflow-hidden rounded-3xl border border-[#dfe4ee] bg-white p-6 sm:p-10 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="flex flex-wrap items-start gap-6">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-red-50 text-brand-red dark:bg-brand-red/15">
              <ClipboardText size={28} weight="duotone" />
            </span>
            <div className="min-w-0 flex-1 basis-72">
              <h2
                className="font-display text-2xl font-semibold tracking-[-0.04em]"
                id="forms-empty-title"
              >
                Your first form is a click away
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69748a] dark:text-white/50">
                Start from a blank page, or pick one of the ready-made forms below: each comes with
                its questions, logic, welcome and thank-you screens already written, so you only
                adjust what is yours.
              </p>
              {canWrite ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    className={primaryButtonClass}
                    onClick={() => {
                      onPickTemplate(null);
                    }}
                    type="button"
                  >
                    <Plus size={16} weight="bold" />
                    Blank form
                  </button>
                  <button className={secondaryButtonClass} onClick={onNew} type="button">
                    <Eye size={16} />
                    Browse all templates
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {canWrite ? (
            <div className="mt-8">
              <p className={eyebrowClass}>Featured templates</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {featured.map((template) => (
                  <TemplateTile
                    key={template.id}
                    onChoose={() => {
                      onPickTemplate(template);
                    }}
                    template={template}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
