"use client";

import { useId, useState } from "react";

import {
  normalizeDescription,
  projectDescriptionParagraphs,
  projectThemeId,
  PROJECT_DETAIL_LIMITS,
  type ProjectDraft,
} from "@/lib/project-cms";
import { PROJECT_THEMES } from "@/lib/project-themes";

import { ServicesInput } from "./services-input";
import { ThemePicker, ThemePreview } from "./theme-picker";
import {
  Counter,
  Field,
  cardClass,
  cardHintClass,
  cardLabelClass,
  inputClass,
  invalidClass,
  textareaClass,
} from "./ui";
import type { DetailErrors, DetailField } from "./validation";

type DetailKey = "theme" | "description" | "cta" | "services";

const limits = PROJECT_DETAIL_LIMITS;

function Subsection({
  children,
  hint,
  id,
  title,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  id?: string;
  title: string;
}) {
  return (
    <section className="border-t border-[#e6eaf2] pt-5 dark:border-white/10">
      <h3 className="text-sm font-semibold text-[#171b25] dark:text-white" id={id}>
        {title}
      </h3>
      {hint ? <p className={cardHintClass}>{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The "Detail page" group: the palette, the title panel's copy, its call to
 * action and services, and the links it lists. Errors show once a field has
 * been left (or after a save attempt); API errors show straight away.
 */
export function DetailPageFields({
  apiErrors,
  children,
  draft,
  errors,
  onChange,
  revealAll,
}: {
  apiErrors: DetailErrors;
  /** The links editor, rendered as the group's last subsection. */
  children?: React.ReactNode;
  draft: ProjectDraft;
  errors: DetailErrors;
  onChange: <K extends DetailKey>(key: K, value: ProjectDraft[K]) => void;
  revealAll: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState<Partial<Record<DetailField, boolean>>>({});
  const touch = (field: DetailField) =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  const shown = (field: DetailField) =>
    apiErrors[field] ?? (revealAll || touched[field] ? errors[field] : undefined);

  const description = draft.description ?? "";
  const paragraphCount = normalizeDescription(description)
    ? normalizeDescription(description).split("\n\n").length
    : 0;
  const ctaLabel = draft.cta?.label ?? "";
  const ctaUrl = draft.cta?.url ?? "";
  const setCta = (next: { label: string; url: string }) =>
    onChange("cta", next.label || next.url ? next : undefined);
  const themeId = projectThemeId(draft);
  const services = draft.services ?? [];

  const descriptionError = shown("description");
  const ctaLabelError = shown("ctaLabel");
  const ctaUrlError = shown("ctaUrl");
  const servicesError = shown("services");
  const themeError = shown("theme");

  return (
    <div className={`${cardClass} space-y-5`} id="project-detail-page">
      <div>
        <p className={cardLabelClass}>Detail page</p>
        <p className={cardHintClass}>
          What visitors see at /projects/{draft.slug || "your-project"}: the palette, the title
          panel&apos;s copy, its button, services and links.
        </p>
      </div>

      <Subsection
        hint="The page follows each visitor's light or dark mode, so every theme has both variants."
        id={`${id}-theme`}
        title="Theme"
      >
        <ThemePicker
          labelId={`${id}-theme`}
          onChange={(theme) => onChange("theme", theme)}
          slug={draft.slug}
          value={draft.theme}
        />
        {themeError ? (
          <p className="mt-2 text-[11px] leading-5 font-semibold text-brand-red" role="alert">
            {themeError}
          </p>
        ) : null}
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            Preview · {PROJECT_THEMES[themeId].name}
            {draft.theme ? "" : " (automatic)"}
          </p>
          <ThemePreview
            copy={projectDescriptionParagraphs(draft)[0]}
            ctaLabel={ctaLabel.trim() && ctaUrl.trim() ? ctaLabel.trim() : undefined}
            services={services}
            themeId={themeId}
            title={draft.title.trim() || "Project title"}
          />
        </div>
      </Subsection>

      <Subsection
        hint="The title panel's copy. Leave it empty and the page shows the summary instead."
        title="Description"
      >
        <Field
          aside={
            <Counter
              id={`${id}-description-count`}
              max={limits.descriptionMax}
              soft={limits.descriptionSoftMax}
              value={description.length}
            />
          }
          error={descriptionError}
          errorId={`${id}-description-error`}
          htmlFor={`${id}-description`}
          label="Description"
        >
          <textarea
            aria-describedby={`${id}-description-count ${id}-description-hint${descriptionError ? ` ${id}-description-error` : ""}`}
            aria-invalid={descriptionError ? true : undefined}
            className={`${textareaClass} min-h-40 ${descriptionError ? invalidClass : ""}`}
            id={`${id}-description`}
            maxLength={limits.descriptionMax}
            onBlur={() => touch("description")}
            onChange={(event) => onChange("description", event.target.value)}
            placeholder={
              draft.summary.trim() || "What the project is, who it is for, and what the lab did."
            }
            rows={6}
            value={description}
          />
        </Field>
        <p
          className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35"
          id={`${id}-description-hint`}
        >
          <span>Separate paragraphs with a blank line. Two short paragraphs read best.</span>
          <span
            className={`font-semibold ${paragraphCount > 2 ? "text-[#a97b1c] dark:text-brand-yellow" : "text-[#687187] dark:text-white/50"}`}
          >
            {paragraphCount === 0
              ? "Empty: the summary is used"
              : `${paragraphCount} paragraph${paragraphCount === 1 ? "" : "s"}`}
          </span>
          {description.length > limits.descriptionSoftMax ? (
            <span className="font-semibold text-[#a97b1c] dark:text-brand-yellow">
              Getting long for the title panel.
            </span>
          ) : null}
        </p>
      </Subsection>

      <Subsection
        hint="The page's main button. Leave both fields empty for no button."
        title="Call to action"
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <Field
            aside={<Counter max={limits.ctaLabelMax} value={ctaLabel.length} />}
            error={ctaLabelError}
            errorId={`${id}-cta-label-error`}
            htmlFor={`${id}-cta-label`}
            label="Button label"
          >
            <input
              aria-describedby={ctaLabelError ? `${id}-cta-label-error` : undefined}
              aria-invalid={ctaLabelError ? true : undefined}
              className={`${inputClass} ${ctaLabelError ? invalidClass : ""}`}
              id={`${id}-cta-label`}
              maxLength={limits.ctaLabelMax}
              onBlur={() => touch("ctaLabel")}
              onChange={(event) => setCta({ label: event.target.value, url: ctaUrl })}
              placeholder="Launch Project"
              value={ctaLabel}
            />
          </Field>
          <Field
            error={ctaUrlError}
            errorId={`${id}-cta-url-error`}
            hint={ctaUrlError ? undefined : "An https:// address, or a site path such as /contact."}
            htmlFor={`${id}-cta-url`}
            label="Button URL"
          >
            <input
              aria-describedby={ctaUrlError ? `${id}-cta-url-error` : undefined}
              aria-invalid={ctaUrlError ? true : undefined}
              className={`${inputClass} font-mono text-xs ${ctaUrlError ? invalidClass : ""}`}
              id={`${id}-cta-url`}
              inputMode="url"
              onBlur={() => touch("ctaUrl")}
              onChange={(event) => setCta({ label: ctaLabel, url: event.target.value })}
              placeholder="https://example.com"
              value={ctaUrl}
            />
          </Field>
        </div>
      </Subsection>

      <Subsection
        hint={
          <>
            What the lab did, in a few words each. For example: &ldquo;Concept&rdquo;, &ldquo;UX
            Research&rdquo;, &ldquo;Web Development&rdquo;.
          </>
        }
        title="Services"
      >
        <Field
          aside={<Counter max={limits.servicesMax} value={services.length} />}
          error={servicesError}
          errorId={`${id}-services-error`}
          htmlFor={`${id}-services`}
          label="Services"
        >
          <ServicesInput
            describedBy={servicesError ? `${id}-services-error` : undefined}
            id={`${id}-services`}
            invalid={Boolean(servicesError)}
            onChange={(values) => onChange("services", values)}
            values={services}
          />
        </Field>
      </Subsection>

      {children ? (
        <Subsection hint="Listed under “Links” on the detail page." title="Links">
          {children}
        </Subsection>
      ) : null}
    </div>
  );
}
