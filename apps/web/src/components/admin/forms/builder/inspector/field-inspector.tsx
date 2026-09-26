"use client";

import { Check, Copy, Warning } from "@phosphor-icons/react";
import { memo, useCallback, useId, useState } from "react";

import { isChoiceType, isInputType, type FormDocument, type FormField } from "@repo/shared";

import { FIELD_TYPE_INFO, documentIds } from "@/lib/forms/builder-fields";
import type { DocumentChange } from "@/lib/forms/builder-history";
import { patchField } from "@/lib/forms/builder-ops";

import { FAMILY_TONES, FieldIcon } from "../field-icons";
import { MediaPicker } from "../media-picker";
import { RichTextEditor } from "../rich-text-editor";
import { RuleBuilder } from "../rule-builder";
import { Section, Segmented, Switch, smallInputClass } from "../ui";
import { OptionsEditor } from "./options-editor";
import { PipingInput } from "./piping-input";
import { TypeSettings } from "./type-settings";

const labelText = "mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={label}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-[#667187] transition hover:bg-[#eef1f7] hover:text-brand-blue dark:text-white/50 dark:hover:bg-white/10"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard refused (insecure context): nothing to do.
        }
      }}
      title={label}
      type="button"
    >
      {copied ? <Check className="text-brand-green" size={15} weight="bold" /> : <Copy size={15} />}
    </button>
  );
}

/** The inspector for one block: question, options, type settings, media, logic, advanced. */
export const FieldInspector = memo(function FieldInspector({
  change,
  document,
  field,
  formId,
  index,
  issues,
  origin,
  readOnly,
  slug,
}: {
  change: DocumentChange;
  document: FormDocument;
  field: FormField;
  formId: string;
  index: number;
  issues: string[];
  origin: string;
  readOnly: boolean;
  slug: string;
}) {
  const baseId = useId();
  const info = FIELD_TYPE_INFO[field.type];
  const question = isInputType(field.type);
  const scoring = document.settings.scoring.enabled;

  const update = useCallback(
    (patch: Partial<FormField>, coalesce?: string) =>
      change((current) => patchField(current, field.id, patch), coalesce),
    [change, field.id],
  );
  const takenIds = useCallback(() => documentIds(document), [document]);
  const earlier = document.fields.slice(0, index);
  const showQuestion = ![
    "divider",
    "spacer",
    "page_break",
    "image",
    "video",
    "paragraph",
    "callout",
  ].includes(field.type);

  return (
    <fieldset className="min-w-0" disabled={readOnly}>
      <div className="flex items-center gap-2.5 border-b border-[#e6eaf2] px-4 py-3.5 dark:border-white/[0.07]">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${FAMILY_TONES[info.family]}`}
        >
          <FieldIcon size={16} type={field.type} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{info.label}</p>
          <p className="truncate text-[11px] text-[#8490a5] dark:text-white/40">
            {info.description}
          </p>
        </div>
      </div>

      {issues.length ? (
        <div
          className="mx-4 mt-3 space-y-1 rounded-xl bg-brand-red-50 p-2.5 text-xs leading-5 text-brand-red dark:bg-brand-red/15"
          role="alert"
        >
          {issues.map((issue) => (
            <p className="flex gap-1.5" key={issue}>
              <Warning className="mt-0.5 shrink-0" size={13} weight="fill" />
              {issue}
            </p>
          ))}
        </div>
      ) : null}

      {showQuestion ? (
        <Section title={question ? "Question" : "Text"}>
          <div>
            <label className={labelText} htmlFor={`${baseId}-label`}>
              {field.type === "heading"
                ? "Heading"
                : field.type === "quote"
                  ? "Attribution"
                  : field.type === "hidden"
                    ? "Name (admin only)"
                    : "Label"}
            </label>
            {question && field.type !== "hidden" ? (
              <PipingInput
                earlier={earlier}
                id={`${baseId}-label`}
                onChange={(label) => update({ label }, `${field.id}:label`)}
                placeholder="Type a question"
                value={field.label}
              />
            ) : (
              <input
                className={smallInputClass}
                id={`${baseId}-label`}
                maxLength={500}
                onChange={(event) => update({ label: event.target.value }, `${field.id}:label`)}
                value={field.label}
              />
            )}
          </div>
          {question && field.type !== "hidden" ? (
            <>
              <div>
                <span className={labelText}>Description</span>
                <RichTextEditor
                  label="Question description"
                  minHeight={64}
                  onChange={(value) => update({ description: value }, `${field.id}:description`)}
                  placeholder="Optional extra context under the question"
                  value={field.description}
                  variant="compact"
                />
              </div>
              {[
                "short_text",
                "long_text",
                "email",
                "phone",
                "number",
                "url",
                "dropdown",
                "multiselect",
                "country",
              ].includes(field.type) ? (
                <label className="block">
                  <span className={labelText}>Placeholder</span>
                  <input
                    className={smallInputClass}
                    maxLength={200}
                    onChange={(event) =>
                      update(
                        { placeholder: event.target.value || undefined },
                        `${field.id}:placeholder`,
                      )
                    }
                    value={field.placeholder ?? ""}
                  />
                </label>
              ) : null}
              <label className="block">
                <span className={labelText}>Help text</span>
                <input
                  className={smallInputClass}
                  maxLength={500}
                  onChange={(event) =>
                    update({ help: event.target.value || undefined }, `${field.id}:help`)
                  }
                  placeholder="Shown small, under the answer"
                  value={field.help ?? ""}
                />
              </label>
              <Switch
                checked={field.required}
                label="Required"
                onChange={(required) => update({ required })}
                size="sm"
              />
              <div>
                <span className={labelText}>Width (classic layout)</span>
                <Segmented
                  fullWidth
                  label="Width"
                  onChange={(width) => update({ width })}
                  options={[
                    { value: "full", label: "Full" },
                    { value: "half", label: "Half" },
                  ]}
                  size="sm"
                  value={field.width}
                />
              </div>
            </>
          ) : null}
        </Section>
      ) : null}

      {isChoiceType(field.type) ? (
        <Section title="Options">
          <OptionsEditor
            field={field}
            formId={formId}
            scoring={scoring}
            takenIds={takenIds}
            update={update}
          />
        </Section>
      ) : null}

      <TypeSettings field={field} formId={formId} takenIds={takenIds} update={update} />

      {question && field.type !== "hidden" ? (
        <Section title="Media" description="An image or video shown with the question.">
          <MediaPicker
            formId={formId}
            label="Question media"
            onChange={(media) => update({ media })}
            value={field.media}
          />
        </Section>
      ) : null}

      {field.type !== "page_break" ? (
        <Section title="Logic">
          <RuleBuilder
            beforeIndex={index}
            document={document}
            emptyHint="Always shown. Add a rule to show it only for some answers."
            label="Show this block when"
            onChange={(visibleIf) => update({ visibleIf })}
            readOnly={readOnly}
            value={field.visibleIf}
          />
        </Section>
      ) : null}

      <Section title="Advanced">
        <div>
          <span className={labelText}>Block id</span>
          <div className="flex items-center gap-1">
            <code className="flex h-9 min-w-0 flex-1 items-center truncate rounded-lg bg-[#f1f4f9] px-2.5 font-mono text-xs dark:bg-white/[0.05]">
              {field.id}
            </code>
            <CopyButton label="Copy block id" text={field.id} />
          </div>
          <p className="mt-1 text-[11px] leading-5 text-[#8490a5]">
            The answer key in exports; it never changes. Pipe it into a later label as{" "}
            {`{{${field.id}}}`}.
          </p>
        </div>
        {question ? (
          <>
            <label className="block">
              <span className={labelText}>
                {field.type === "hidden" ? "URL parameter" : "Prefill from URL parameter"}
              </span>
              <input
                className={`${smallInputClass} font-mono`}
                maxLength={64}
                onChange={(event) =>
                  update(
                    {
                      prefillParam: event.target.value.replace(/[^A-Za-z0-9_.-]/g, "") || undefined,
                    },
                    `${field.id}:prefill`,
                  )
                }
                placeholder={field.type === "hidden" ? "source" : "Optional"}
                value={field.prefillParam ?? ""}
              />
            </label>
            {field.prefillParam ? (
              <div className="flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-[#f1f4f9] px-2.5 py-2 font-mono text-[11px] dark:bg-white/[0.05]">
                  {origin}/forms/{slug}?{field.prefillParam}=value
                </code>
                <CopyButton
                  label="Copy example link"
                  text={`${origin}/forms/${slug}?${field.prefillParam}=value`}
                />
              </div>
            ) : null}
            {field.type !== "hidden" && !isChoiceType(field.type) && field.type !== "matrix" ? (
              <label className="block">
                <span className={labelText}>Default value</span>
                <input
                  className={smallInputClass}
                  maxLength={2000}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const numeric = ["number", "rating", "opinion_scale", "nps", "slider"].includes(
                      field.type,
                    );
                    const value =
                      raw === ""
                        ? undefined
                        : numeric && Number.isFinite(Number(raw))
                          ? Number(raw)
                          : raw;
                    update({ defaultValue: value }, `${field.id}:default`);
                  }}
                  placeholder="Empty"
                  value={field.defaultValue === undefined ? "" : String(field.defaultValue)}
                />
              </label>
            ) : null}
          </>
        ) : null}
      </Section>
    </fieldset>
  );
});
