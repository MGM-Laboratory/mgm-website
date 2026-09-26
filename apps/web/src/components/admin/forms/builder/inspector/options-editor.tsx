"use client";

import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  ListBullets,
  Plus,
  TextAlignLeft,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";

import { FORM_LIMITS, isMultiChoiceType, type FormField, type FormOption } from "@repo/shared";

import { mintId } from "@/lib/forms/builder-fields";

import { MediaPicker } from "../media-picker";
import { NumberInput, Segmented, Switch, smallInputClass, textareaClass } from "../ui";

type Update = (patch: Partial<FormField>, coalesce?: string) => void;

/**
 * The options of a choice question: inline rows (label, then optional
 * description, image and points behind a disclosure), move buttons, paste
 * several lines to add several, a bulk text mode, and the choice settings.
 */
export function OptionsEditor({
  field,
  formId,
  scoring,
  takenIds,
  update,
}: {
  field: FormField;
  formId: string;
  scoring: boolean;
  /** Returns the ids in use right now (for minting unique option ids). */
  takenIds: () => Set<string>;
  update: Update;
}) {
  const options = field.options ?? [];
  const [bulk, setBulk] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const multi = isMultiChoiceType(field.type, field) || field.type === "picture_choice";
  const picture = field.type === "picture_choice";

  const setOptions = (next: FormOption[], coalesce?: string) => {
    update({ options: next }, coalesce);
  };
  const patchOption = (id: string, patch: Partial<FormOption>, key: string) => {
    setOptions(
      options.map((option) => (option.id === id ? { ...option, ...patch } : option)),
      `${field.id}:opt:${id}:${key}`,
    );
  };
  const addLabels = (labels: string[], afterIndex = options.length - 1) => {
    const taken = takenIds();
    const room = FORM_LIMITS.optionsMax - options.length;
    const added = labels
      .slice(0, Math.max(0, room))
      .map((label) => ({ id: mintId("opt", taken), label }));
    if (!added.length) return;
    setOptions([...options.slice(0, afterIndex + 1), ...added, ...options.slice(afterIndex + 1)]);
    return added;
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setOptions(next);
  };

  const applyBulk = () => {
    if (bulk === null) return;
    const lines = bulk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, FORM_LIMITS.optionsMax);
    // Keep the id (and any points or image) of options whose label survives,
    // so rules and answers keep pointing at them.
    const pool = [...options];
    const taken = takenIds();
    const next = lines.map((line) => {
      const [label, pointsText = ""] = line.split(/\s*\|\s*/);
      const index = pool.findIndex((option) => option.label === label);
      const existing = index === -1 ? undefined : pool.splice(index, 1)[0];
      const points = pointsText !== "" ? Number(pointsText) : undefined;
      return {
        ...(existing ?? { id: mintId("opt", taken) }),
        label,
        ...(points !== undefined && Number.isFinite(points) ? { points } : {}),
      };
    });
    setOptions(next);
    setBulk(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[#8490a5] dark:text-white/40">
          {options.length} option{options.length === 1 ? "" : "s"}
        </span>
        <button
          aria-pressed={bulk !== null}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#5d687d] transition hover:bg-[#eef1f7] dark:text-white/55 dark:hover:bg-white/[0.07]"
          onClick={() => {
            setBulk((current) =>
              current === null
                ? options
                    .map((option) =>
                      scoring && option.points !== undefined
                        ? `${option.label} | ${option.points}`
                        : option.label,
                    )
                    .join("\n")
                : null,
            );
          }}
          type="button"
        >
          {bulk === null ? <TextAlignLeft size={14} /> : <ListBullets size={14} />}
          {bulk === null ? "Edit as text" : "Edit as list"}
        </button>
      </div>

      {bulk !== null ? (
        <div className="space-y-2">
          <textarea
            aria-label="Options, one per line"
            autoFocus
            className={`${textareaClass} min-h-40 font-mono text-xs`}
            onChange={(event) => {
              setBulk(event.target.value);
            }}
            value={bulk}
          />
          <p className="text-[11px] leading-5 text-[#8490a5]">
            One option per line.{scoring ? " Add points after a bar: Correct answer | 2." : ""}{" "}
            Options that keep their label keep their id, so logic still works.
          </p>
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-lg px-3 text-xs font-semibold text-[#5d687d] hover:bg-[#eef1f7] dark:text-white/55"
              onClick={() => {
                setBulk(null);
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-8 rounded-lg bg-brand-blue px-3 text-xs font-semibold text-white hover:bg-[#2f5eb0]"
              onClick={applyBulk}
              type="button"
            >
              Apply
            </button>
          </div>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {options.map((option, index) => {
            const open = expanded === option.id;
            return (
              <li
                className="rounded-xl border border-[#e3e7f0] bg-white p-1.5 dark:border-white/10 dark:bg-white/[0.03]"
                key={option.id}
              >
                <div className="flex items-center gap-1">
                  <button
                    aria-expanded={open}
                    aria-label={`More settings for ${option.label || "option"}`}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-[#8490a5] hover:bg-[#eef1f7] dark:hover:bg-white/[0.07]"
                    onClick={() => {
                      setExpanded(open ? null : option.id);
                    }}
                    type="button"
                  >
                    {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                  </button>
                  <input
                    aria-invalid={!option.label.trim() || undefined}
                    aria-label={`Option ${index + 1}`}
                    className={`h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-brand-blue focus:bg-white dark:focus:bg-white/[0.05] ${option.label.trim() ? "border-transparent hover:border-[#e3e7f0] dark:hover:border-white/10" : "border-brand-red/60"}`}
                    maxLength={FORM_LIMITS.optionLabelMax}
                    onChange={(event) => {
                      patchOption(option.id, { label: event.target.value }, "label");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const list = event.currentTarget.closest("ol");
                        const added = addLabels([`Option ${options.length + 1}`], index);
                        if (added) {
                          window.requestAnimationFrame(() => {
                            list
                              ?.querySelectorAll<HTMLInputElement>("input[aria-label^='Option']")
                              [index + 1]?.select();
                          });
                        }
                      }
                    }}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData("text");
                      const lines = text
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter(Boolean);
                      if (lines.length < 2) return;
                      event.preventDefault();
                      // The first pasted line replaces this option; the rest follow it.
                      const [first, ...rest] = lines;
                      const next = options.map((item) =>
                        item.id === option.id ? { ...item, label: first } : item,
                      );
                      const taken = takenIds();
                      const added = rest
                        .slice(0, Math.max(0, FORM_LIMITS.optionsMax - next.length))
                        .map((label) => ({ id: mintId("opt", taken), label }));
                      setOptions([...next.slice(0, index + 1), ...added, ...next.slice(index + 1)]);
                    }}
                    value={option.label}
                  />
                  {scoring && !open ? (
                    <span className="w-12 shrink-0">
                      <NumberInput
                        ariaLabel={`Points for ${option.label}`}
                        className="h-8 w-full rounded-md border border-[#e3e7f0] bg-transparent px-1.5 text-center font-mono text-xs outline-none focus:border-brand-blue dark:border-white/10"
                        onChange={(value) => {
                          patchOption(option.id, { points: value }, "points");
                        }}
                        placeholder="pts"
                        value={option.points}
                      />
                    </span>
                  ) : null}
                  <span className="flex shrink-0">
                    <button
                      aria-label={`Move ${option.label} up`}
                      className="grid size-7 place-items-center rounded-md text-[#8490a5] hover:bg-[#eef1f7] disabled:opacity-25 dark:hover:bg-white/[0.07]"
                      disabled={index === 0}
                      onClick={() => {
                        move(index, -1);
                      }}
                      type="button"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      aria-label={`Move ${option.label} down`}
                      className="grid size-7 place-items-center rounded-md text-[#8490a5] hover:bg-[#eef1f7] disabled:opacity-25 dark:hover:bg-white/[0.07]"
                      disabled={index === options.length - 1}
                      onClick={() => {
                        move(index, 1);
                      }}
                      type="button"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      aria-label={`Remove ${option.label}`}
                      className="grid size-7 place-items-center rounded-md text-[#8490a5] hover:bg-brand-red-50 hover:text-brand-red disabled:opacity-25"
                      disabled={options.length <= 1}
                      onClick={() => {
                        setOptions(options.filter((item) => item.id !== option.id));
                      }}
                      title={
                        options.length <= 1
                          ? "A choice question needs at least one option"
                          : "Remove"
                      }
                      type="button"
                    >
                      <X size={13} weight="bold" />
                    </button>
                  </span>
                </div>
                {picture && !open ? (
                  <div className="mt-1.5 px-1">
                    <MediaPicker
                      accept={["image"]}
                      compact
                      formId={formId}
                      label={`Image for ${option.label}`}
                      onChange={(media) => {
                        patchOption(option.id, { image: media }, "image");
                      }}
                      value={option.image}
                    />
                  </div>
                ) : null}
                {open ? (
                  <div className="mt-2 space-y-2.5 border-t border-[#eef1f6] px-1.5 pt-2.5 pb-1 dark:border-white/[0.07]">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45">
                        Description
                      </span>
                      <input
                        className={smallInputClass}
                        maxLength={300}
                        onChange={(event) => {
                          patchOption(
                            option.id,
                            { description: event.target.value || undefined },
                            "description",
                          );
                        }}
                        placeholder="A line under the label"
                        value={option.description ?? ""}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45">
                        Points
                      </span>
                      <NumberInput
                        onChange={(value) => {
                          patchOption(option.id, { points: value }, "points");
                        }}
                        placeholder="0"
                        value={option.points}
                      />
                    </label>
                    <div>
                      <span className="mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45">
                        Image
                      </span>
                      <MediaPicker
                        accept={["image"]}
                        compact
                        formId={formId}
                        label={`Image for ${option.label}`}
                        onChange={(media) => {
                          patchOption(option.id, { image: media }, "image");
                        }}
                        value={option.image}
                      />
                    </div>
                    <p className="font-mono text-[10px] text-[#9ba4b5]">id {option.id}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {bulk === null ? (
        <button
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#c6cedd] text-xs font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue disabled:opacity-40 dark:border-white/15 dark:text-white/55"
          disabled={options.length >= FORM_LIMITS.optionsMax}
          onClick={() => addLabels([`Option ${options.length + 1}`])}
          type="button"
        >
          <Plus size={13} weight="bold" />
          Add option
          <span className="font-normal text-[#9ba4b5]">· or paste several lines</span>
        </button>
      ) : null}

      {field.type !== "ranking" ? (
        <Switch
          checked={Boolean(field.allowOther)}
          description="Adds a last choice with a text box."
          label="Allow “Other”"
          onChange={(value) => {
            update({ allowOther: value || undefined });
          }}
          size="sm"
        />
      ) : null}
      {field.allowOther ? (
        <input
          aria-label="Other option label"
          className={smallInputClass}
          maxLength={100}
          onChange={(event) => {
            update({ otherLabel: event.target.value || undefined }, `${field.id}:otherLabel`);
          }}
          placeholder="Other"
          value={field.otherLabel ?? ""}
        />
      ) : null}
      <Switch
        checked={Boolean(field.randomize)}
        description="Each respondent sees the options in a different order."
        label="Shuffle options"
        onChange={(value) => {
          update({ randomize: value || undefined });
        }}
        size="sm"
      />
      {field.type === "multiple_choice" ||
      field.type === "checkboxes" ||
      field.type === "picture_choice" ? (
        <div>
          <span className="mb-1.5 block text-[11px] font-semibold text-[#687187] dark:text-white/45">
            Layout
          </span>
          <Segmented
            fullWidth
            label="Option layout"
            onChange={(value) => {
              update({ optionLayout: value });
            }}
            options={[
              { value: "list", label: "List" },
              { value: "grid", label: "Grid" },
              { value: "inline", label: "Inline" },
            ]}
            size="sm"
            value={field.optionLayout ?? (picture ? "grid" : "list")}
          />
        </div>
      ) : null}
      {multi && field.type !== "ranking" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45">
              At least
            </span>
            <NumberInput
              min={0}
              onChange={(value) => {
                update(
                  {
                    minSelections: value === undefined ? undefined : Math.max(0, Math.round(value)),
                  },
                  `${field.id}:min`,
                );
              }}
              placeholder="0"
              value={field.minSelections}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45">
              At most
            </span>
            <NumberInput
              min={1}
              onChange={(value) => {
                update(
                  {
                    maxSelections: value === undefined ? undefined : Math.max(1, Math.round(value)),
                  },
                  `${field.id}:max`,
                );
              }}
              placeholder={picture ? "1" : "Any"}
              value={field.maxSelections}
            />
          </label>
          {picture ? (
            <p className="col-span-2 text-[11px] leading-5 text-[#8490a5]">
              Picture choice picks one unless “At most” is 2 or more.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
