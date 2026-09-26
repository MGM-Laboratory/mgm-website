"use client";

import { Plus, X } from "@phosphor-icons/react";
import { useState } from "react";

import {
  CALLOUT_TONES,
  FORM_FILE_CATEGORIES,
  FORM_LIMITS,
  RATING_ICONS,
  matchesFormatMask,
  type FormField,
  type FormMatrixItem,
} from "@repo/shared";

import { mintId } from "@/lib/forms/builder-fields";

import { MediaPicker } from "../media-picker";
import { RichTextEditor } from "../rich-text-editor";
import { NumberInput, Section, Segmented, Switch, smallInputClass } from "../ui";

type Update = (patch: Partial<FormField>, coalesce?: string) => void;

const labelText = "mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45";

function Labeled({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block min-w-0">
      <span className={labelText}>{label}</span>
      {children}
    </label>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

const FILE_CATEGORY_LABELS: Record<(typeof FORM_FILE_CATEGORIES)[number], string> = {
  image: "Images",
  pdf: "PDF",
  document: "Documents",
  spreadsheet: "Spreadsheets",
  presentation: "Slides",
  audio: "Audio",
  video: "Video",
  archive: "Archives",
  text: "Plain text",
};

const MASK_PRESETS: { label: string; mask: string; example: string }[] = [
  { label: "NIM (15 digits)", mask: "###############", example: "225150200111001" },
  {
    label: "Indonesian phone",
    mask: "08######### | 08########## | 08###########",
    example: "081234567890",
  },
  { label: "Postal code", mask: "#####", example: "65145" },
  { label: "Code AA-####", mask: "AA-####", example: "MG-2026" },
  { label: "Year", mask: "####", example: "2026" },
];

/** Short text: the format mask with presets and a live tester. */
function MaskEditor({ field, update }: { field: FormField; update: Update }) {
  const [sample, setSample] = useState("");
  const mask = field.pattern ?? "";
  const verdict = mask && sample ? matchesFormatMask(sample.trim(), mask) : null;
  return (
    <div className="space-y-2.5">
      <Labeled label="Format mask">
        <input
          className={`${smallInputClass} font-mono`}
          maxLength={120}
          onChange={(event) => {
            update({ pattern: event.target.value || undefined }, `${field.id}:pattern`);
          }}
          placeholder="e.g. AA-####"
          spellCheck={false}
          value={mask}
        />
      </Labeled>
      <p className="text-[11px] leading-5 text-[#8490a5] dark:text-white/40">
        <code className="font-mono">#</code> a digit, <code className="font-mono">A</code> a letter,{" "}
        <code className="font-mono">*</code> a letter or digit, <code className="font-mono">?</code>{" "}
        any character, <code className="font-mono">\x</code> a literal x. Separate alternatives with{" "}
        <code className="font-mono">{" | "}</code>.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {MASK_PRESETS.map((preset) => (
          <button
            className="rounded-full border border-[#dfe4ee] px-2.5 py-1 text-[11px] font-semibold text-[#4f5a6f] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/60"
            key={preset.label}
            onClick={() => {
              update({ pattern: preset.mask });
              setSample(preset.example);
            }}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>
      {mask ? (
        <>
          <Labeled label="Try an answer">
            <div className="relative">
              <input
                aria-describedby={`${field.id}-mask-verdict`}
                className={`${smallInputClass} pr-20`}
                onChange={(event) => {
                  setSample(event.target.value);
                }}
                placeholder="Type to test the mask"
                value={sample}
              />
              <span
                aria-live="polite"
                className={`absolute top-1/2 right-2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold ${verdict === null ? "text-[#9ba4b5]" : verdict ? "bg-brand-green-50 text-brand-green dark:bg-brand-green/15" : "bg-brand-red-50 text-brand-red dark:bg-brand-red/15"}`}
                id={`${field.id}-mask-verdict`}
              >
                {verdict === null ? "—" : verdict ? "Fits" : "Doesn't fit"}
              </span>
            </div>
          </Labeled>
          <Labeled label="Message when it doesn't fit">
            <input
              className={smallInputClass}
              maxLength={200}
              onChange={(event) => {
                update(
                  { patternMessage: event.target.value || undefined },
                  `${field.id}:patternMessage`,
                );
              }}
              placeholder="That answer doesn't match the expected format."
              value={field.patternMessage ?? ""}
            />
          </Labeled>
        </>
      ) : null}
    </div>
  );
}

function LengthLimits({ field, update }: { field: FormField; update: Update }) {
  return (
    <Pair>
      <Labeled label="Min characters">
        <NumberInput
          min={0}
          onChange={(value) => {
            update(
              { minLength: value === undefined ? undefined : Math.max(0, Math.round(value)) },
              `${field.id}:minLength`,
            );
          }}
          placeholder="0"
          value={field.minLength}
        />
      </Labeled>
      <Labeled label="Max characters">
        <NumberInput
          min={1}
          onChange={(value) => {
            update(
              { maxLength: value === undefined ? undefined : Math.max(1, Math.round(value)) },
              `${field.id}:maxLength`,
            );
          }}
          placeholder={String(FORM_LIMITS.textAnswerMax)}
          value={field.maxLength}
        />
      </Labeled>
    </Pair>
  );
}

function MinMax({
  field,
  update,
  labels = ["Minimum", "Maximum"],
  placeholders = ["", ""],
}: {
  field: FormField;
  update: Update;
  labels?: [string, string];
  placeholders?: [string, string];
}) {
  return (
    <Pair>
      <Labeled label={labels[0]}>
        <NumberInput
          onChange={(value) => {
            update({ min: value }, `${field.id}:min`);
          }}
          placeholder={placeholders[0]}
          step="any"
          value={field.min}
        />
      </Labeled>
      <Labeled label={labels[1]}>
        <NumberInput
          onChange={(value) => {
            update({ max: value }, `${field.id}:max`);
          }}
          placeholder={placeholders[1]}
          step="any"
          value={field.max}
        />
      </Labeled>
    </Pair>
  );
}

function ScaleLabels({
  field,
  update,
  mid = false,
}: {
  field: FormField;
  update: Update;
  mid?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${mid ? "grid-cols-3" : "grid-cols-2"}`}>
      <Labeled label="Low label">
        <input
          className={smallInputClass}
          maxLength={60}
          onChange={(event) => {
            update({ minLabel: event.target.value || undefined }, `${field.id}:minLabel`);
          }}
          value={field.minLabel ?? ""}
        />
      </Labeled>
      {mid ? (
        <Labeled label="Middle label">
          <input
            className={smallInputClass}
            maxLength={60}
            onChange={(event) => {
              update({ midLabel: event.target.value || undefined }, `${field.id}:midLabel`);
            }}
            value={field.midLabel ?? ""}
          />
        </Labeled>
      ) : null}
      <Labeled label="High label">
        <input
          className={smallInputClass}
          maxLength={60}
          onChange={(event) => {
            update({ maxLabel: event.target.value || undefined }, `${field.id}:maxLabel`);
          }}
          value={field.maxLabel ?? ""}
        />
      </Labeled>
    </div>
  );
}

function ItemsEditor({
  add,
  items,
  label,
  max,
  onChange,
}: {
  add: () => FormMatrixItem;
  items: FormMatrixItem[];
  label: string;
  max: number;
  onChange: (items: FormMatrixItem[], coalesce?: string) => void;
}) {
  return (
    <div>
      <span className={labelText}>{label}</span>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li className="flex items-center gap-1" key={item.id}>
            <input
              aria-invalid={!item.label.trim() || undefined}
              aria-label={`${label} ${index + 1}`}
              className={`${smallInputClass} ${item.label.trim() ? "" : "border-brand-red/60"}`}
              maxLength={200}
              onChange={(event) => {
                onChange(
                  items.map((entry) =>
                    entry.id === item.id ? { ...entry, label: event.target.value } : entry,
                  ),
                  `${item.id}:label`,
                );
              }}
              onPaste={(event) => {
                const lines = event.clipboardData
                  .getData("text")
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                if (lines.length < 2) return;
                event.preventDefault();
                const [first, ...rest] = lines;
                const next = items.map((entry) =>
                  entry.id === item.id ? { ...entry, label: first } : entry,
                );
                const added = rest
                  .slice(0, Math.max(0, max - next.length))
                  .map((text) => ({ ...add(), label: text }));
                onChange([...next.slice(0, index + 1), ...added, ...next.slice(index + 1)]);
              }}
              value={item.label}
            />
            <button
              aria-label={`Remove ${item.label}`}
              className="grid size-8 shrink-0 place-items-center rounded-md text-[#8490a5] hover:bg-brand-red-50 hover:text-brand-red disabled:opacity-25"
              disabled={items.length <= 1}
              onClick={() => {
                onChange(items.filter((entry) => entry.id !== item.id));
              }}
              type="button"
            >
              <X size={13} weight="bold" />
            </button>
          </li>
        ))}
      </ul>
      <button
        className="mt-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand-blue hover:bg-brand-blue-50 disabled:opacity-40 dark:hover:bg-brand-blue/15"
        disabled={items.length >= max}
        onClick={() => {
          onChange([...items, add()]);
        }}
        type="button"
      >
        <Plus size={13} weight="bold" />
        Add {label.toLowerCase().replace(/s$/, "")}
      </button>
    </div>
  );
}

/**
 * The settings only some types have. Returns null for types with none, so
 * the inspector can skip the section.
 */
export function TypeSettings({
  field,
  formId,
  takenIds,
  update,
}: {
  field: FormField;
  formId: string;
  takenIds: () => Set<string>;
  update: Update;
}) {
  switch (field.type) {
    case "short_text":
      return (
        <Section title="Answer format">
          <LengthLimits field={field} update={update} />
          <MaskEditor field={field} update={update} />
        </Section>
      );
    case "long_text":
      return (
        <Section title="Answer format">
          <LengthLimits field={field} update={update} />
          <Labeled label="Visible rows">
            <NumberInput
              max={20}
              min={2}
              onChange={(value) => {
                update(
                  {
                    rows:
                      value === undefined
                        ? undefined
                        : Math.min(20, Math.max(2, Math.round(value))),
                  },
                  `${field.id}:rows`,
                );
              }}
              placeholder="4"
              value={field.rows}
            />
          </Labeled>
        </Section>
      );
    case "number":
      return (
        <Section title="Number">
          <MinMax field={field} update={update} />
          <Pair>
            <Labeled label="Step">
              <NumberInput
                onChange={(value) => {
                  update({ step: value && value > 0 ? value : undefined }, `${field.id}:step`);
                }}
                placeholder="1"
                step="any"
                value={field.step}
              />
            </Labeled>
            <Labeled label="Decimals">
              <NumberInput
                max={6}
                min={0}
                onChange={(value) => {
                  update(
                    {
                      decimals:
                        value === undefined
                          ? undefined
                          : Math.min(6, Math.max(0, Math.round(value))),
                    },
                    `${field.id}:decimals`,
                  );
                }}
                placeholder="0"
                value={field.decimals}
              />
            </Labeled>
          </Pair>
          <Pair>
            <Labeled label="Prefix">
              <input
                className={smallInputClass}
                maxLength={12}
                onChange={(event) => {
                  update({ prefix: event.target.value || undefined }, `${field.id}:prefix`);
                }}
                placeholder="Rp"
                value={field.prefix ?? ""}
              />
            </Labeled>
            <Labeled label="Suffix">
              <input
                className={smallInputClass}
                maxLength={12}
                onChange={(event) => {
                  update({ suffix: event.target.value || undefined }, `${field.id}:suffix`);
                }}
                placeholder="people"
                value={field.suffix ?? ""}
              />
            </Labeled>
          </Pair>
        </Section>
      );
    case "rating":
      return (
        <Section title="Rating">
          <Labeled label="Icon">
            <select
              className={smallInputClass}
              onChange={(event) => {
                update({ ratingIcon: event.target.value as FormField["ratingIcon"] });
              }}
              value={field.ratingIcon ?? "star"}
            >
              {RATING_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon[0].toUpperCase() + icon.slice(1)}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Number of icons">
            <NumberInput
              max={10}
              min={3}
              onChange={(value) => {
                update(
                  {
                    max:
                      value === undefined
                        ? undefined
                        : Math.min(10, Math.max(3, Math.round(value))),
                  },
                  `${field.id}:max`,
                );
              }}
              placeholder="5"
              value={field.max}
            />
          </Labeled>
          <ScaleLabels field={field} update={update} />
        </Section>
      );
    case "opinion_scale":
      return (
        <Section title="Scale">
          <MinMax field={field} labels={["From", "To"]} placeholders={["1", "5"]} update={update} />
          <p className="text-[11px] text-[#8490a5]">
            Up to 11 steps, for example 0 to 10 or 1 to 7.
          </p>
          <ScaleLabels field={field} mid update={update} />
        </Section>
      );
    case "nps":
      return (
        <Section
          title="Net Promoter Score"
          description="Always 0 to 10; 9–10 promoters, 7–8 passives, 0–6 detractors."
        >
          <ScaleLabels field={field} update={update} />
        </Section>
      );
    case "slider":
      return (
        <Section title="Slider">
          <MinMax field={field} placeholders={["0", "100"]} update={update} />
          <Labeled label="Step">
            <NumberInput
              onChange={(value) => {
                update({ step: value && value > 0 ? value : undefined }, `${field.id}:step`);
              }}
              placeholder="1"
              step="any"
              value={field.step}
            />
          </Labeled>
          <Pair>
            <Labeled label="Prefix">
              <input
                className={smallInputClass}
                maxLength={12}
                onChange={(event) => {
                  update({ prefix: event.target.value || undefined }, `${field.id}:prefix`);
                }}
                value={field.prefix ?? ""}
              />
            </Labeled>
            <Labeled label="Suffix">
              <input
                className={smallInputClass}
                maxLength={12}
                onChange={(event) => {
                  update({ suffix: event.target.value || undefined }, `${field.id}:suffix`);
                }}
                placeholder="%"
                value={field.suffix ?? ""}
              />
            </Labeled>
          </Pair>
          <ScaleLabels field={field} update={update} />
        </Section>
      );
    case "matrix":
      return (
        <Section title="Matrix">
          <ItemsEditor
            add={() => ({ id: mintId("row", takenIds()), label: "New row" })}
            items={field.rowsList ?? []}
            label="Rows"
            max={FORM_LIMITS.matrixRowsMax}
            onChange={(items, coalesce) => {
              update({ rowsList: items }, coalesce);
            }}
          />
          <ItemsEditor
            add={() => ({ id: mintId("col", takenIds()), label: "New column" })}
            items={field.columnsList ?? []}
            label="Columns"
            max={FORM_LIMITS.matrixColumnsMax}
            onChange={(items, coalesce) => {
              update({ columnsList: items }, coalesce);
            }}
          />
          <Switch
            checked={Boolean(field.matrixMultiple)}
            description="Checkboxes instead of one choice per row."
            label="Several answers per row"
            onChange={(value) => {
              update({ matrixMultiple: value || undefined });
            }}
            size="sm"
          />
        </Section>
      );
    case "date":
    case "datetime":
      return (
        <Section title="Allowed dates">
          <Pair>
            <Labeled label="Earliest">
              <input
                className={smallInputClass}
                onChange={(event) => {
                  update({ minDate: event.target.value || undefined });
                }}
                type="date"
                value={field.minDate ?? ""}
              />
            </Labeled>
            <Labeled label="Latest">
              <input
                className={smallInputClass}
                onChange={(event) => {
                  update({ maxDate: event.target.value || undefined });
                }}
                type="date"
                value={field.maxDate ?? ""}
              />
            </Labeled>
          </Pair>
        </Section>
      );
    case "file_upload":
    case "image_upload":
    case "signature":
      return (
        <Section title="Uploads">
          {field.type === "file_upload" ? (
            <fieldset>
              <legend className={labelText}>Accepted files</legend>
              <div className="grid grid-cols-2 gap-1">
                {FORM_FILE_CATEGORIES.map((category) => {
                  const accept = field.accept ?? [];
                  const checked = accept.includes(category);
                  return (
                    <label
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-[#f2f5fa] dark:hover:bg-white/[0.05]"
                      key={category}
                    >
                      <input
                        checked={checked}
                        className="size-3.5 accent-brand-blue"
                        onChange={() => {
                          const next = checked
                            ? accept.filter((item) => item !== category)
                            : [...accept, category];
                          update({ accept: next.length ? next : undefined });
                        }}
                        type="checkbox"
                      />
                      {FILE_CATEGORY_LABELS[category]}
                    </label>
                  );
                })}
              </div>
              {!field.accept?.length ? (
                <p className="mt-1 text-[11px] text-[#8490a5]">
                  Nothing ticked accepts every listed type.
                </p>
              ) : null}
            </fieldset>
          ) : null}
          {field.type !== "signature" ? (
            <Pair>
              <Labeled label="Max files">
                <NumberInput
                  max={FORM_LIMITS.filesPerFieldMax}
                  min={1}
                  onChange={(value) => {
                    update(
                      {
                        maxFiles:
                          value === undefined
                            ? undefined
                            : Math.min(
                                FORM_LIMITS.filesPerFieldMax,
                                Math.max(1, Math.round(value)),
                              ),
                      },
                      `${field.id}:maxFiles`,
                    );
                  }}
                  placeholder="1"
                  value={field.maxFiles}
                />
              </Labeled>
              <Labeled label="Max size (MB)">
                <NumberInput
                  max={FORM_LIMITS.fileMbMax}
                  min={0.1}
                  onChange={(value) => {
                    update(
                      {
                        maxFileMb:
                          value === undefined
                            ? undefined
                            : Math.min(FORM_LIMITS.fileMbMax, Math.max(0.1, value)),
                      },
                      `${field.id}:maxFileMb`,
                    );
                  }}
                  placeholder="10"
                  step="any"
                  value={field.maxFileMb}
                />
              </Labeled>
            </Pair>
          ) : (
            <p className="text-xs leading-5 text-[#8490a5]">
              The signature is saved as a PNG image with the response.
            </p>
          )}
        </Section>
      );
    case "phone":
      return (
        <Section title="Phone">
          <Labeled label="Default country (ISO code)">
            <input
              className={`${smallInputClass} uppercase`}
              maxLength={2}
              onChange={(event) => {
                update(
                  { defaultCountry: event.target.value.toUpperCase().slice(0, 2) || undefined },
                  `${field.id}:country`,
                );
              }}
              placeholder="ID"
              value={field.defaultCountry ?? ""}
            />
          </Labeled>
        </Section>
      );
    case "consent":
      return (
        <Section title="Consent text">
          <RichTextEditor
            label="Consent text"
            minHeight={80}
            onChange={(value) => {
              update({ consentText: value }, `${field.id}:consent`);
            }}
            placeholder="I agree to…"
            value={field.consentText}
            variant="compact"
          />
        </Section>
      );
    case "heading":
      return (
        <Section title="Heading">
          <Segmented
            label="Heading size"
            onChange={(value) => {
              update({ headingLevel: Number(value) as 1 | 2 | 3 });
            }}
            options={[
              { value: "1", label: "Large" },
              { value: "2", label: "Medium" },
              { value: "3", label: "Small" },
            ]}
            value={String(field.headingLevel ?? 2)}
          />
          <Segmented
            label="Alignment"
            onChange={(value) => {
              update({ align: value });
            }}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
            ]}
            value={field.align ?? "left"}
          />
        </Section>
      );
    case "paragraph":
    case "callout":
    case "quote":
      return (
        <Section
          title={field.type === "quote" ? "Quote" : field.type === "callout" ? "Callout" : "Text"}
        >
          {field.type === "callout" ? (
            <Segmented
              fullWidth
              label="Tone"
              onChange={(value) => {
                update({ calloutTone: value });
              }}
              options={CALLOUT_TONES.map((tone) => ({
                value: tone,
                label: tone[0].toUpperCase() + tone.slice(1),
              }))}
              size="sm"
              value={field.calloutTone ?? "info"}
            />
          ) : null}
          <RichTextEditor
            label={`${field.type} text`}
            minHeight={120}
            onChange={(value) => {
              update({ content: value }, `${field.id}:content`);
            }}
            value={field.content}
            variant={field.type === "paragraph" ? "full" : "compact"}
          />
          {field.type === "quote" ? (
            <p className="text-[11px] text-[#8490a5]">
              The label above is shown as the attribution.
            </p>
          ) : null}
          <Segmented
            label="Alignment"
            onChange={(value) => {
              update({ align: value });
            }}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
            ]}
            value={field.align ?? "left"}
          />
        </Section>
      );
    case "image":
    case "video":
      return (
        <Section title={field.type === "image" ? "Image" : "Video"}>
          <MediaPicker
            accept={field.type === "image" ? ["image"] : ["video", "embed"]}
            focal={field.type === "image"}
            formId={formId}
            label={field.type === "image" ? "Image" : "Video"}
            onChange={(media) => {
              update({ media });
            }}
            value={field.media}
          />
          <Segmented
            label="Alignment"
            onChange={(value) => {
              update({ align: value });
            }}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
            ]}
            value={field.align ?? "left"}
          />
        </Section>
      );
    case "spacer":
      return (
        <Section title="Spacer">
          <Segmented
            fullWidth
            label="Size"
            onChange={(value) => {
              update({ spacerSize: value });
            }}
            options={[
              { value: "sm", label: "S" },
              { value: "md", label: "M" },
              { value: "lg", label: "L" },
              { value: "xl", label: "XL" },
            ]}
            value={field.spacerSize ?? "md"}
          />
        </Section>
      );
    case "page_break":
      return (
        <Section
          title="Page"
          description="Everything below this break, up to the next one, is one page. Jumps are edited in the Logic tab."
        >
          <Labeled label="Page title">
            <input
              className={smallInputClass}
              maxLength={200}
              onChange={(event) => {
                update({ pageTitle: event.target.value || undefined }, `${field.id}:pageTitle`);
              }}
              placeholder="Optional"
              value={field.pageTitle ?? ""}
            />
          </Labeled>
          <div>
            <span className={labelText}>Page intro</span>
            <RichTextEditor
              label="Page intro"
              minHeight={72}
              onChange={(value) => {
                update({ pageDescription: value }, `${field.id}:pageDescription`);
              }}
              value={field.pageDescription}
              variant="compact"
            />
          </div>
        </Section>
      );
    default:
      return null;
  }
}
