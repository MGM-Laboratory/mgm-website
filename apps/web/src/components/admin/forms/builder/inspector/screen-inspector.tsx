"use client";

import { ArrowDown, ArrowUp, Flag, HandWaving, Trash } from "@phosphor-icons/react";

import {
  SAFE_URL_PATTERN,
  type FormDocument,
  type FormEnding,
  type FormWelcome,
} from "@repo/shared";

import type { DocumentChange } from "@/lib/forms/builder-history";
import { moveEnding, patchEnding, removeEnding } from "@/lib/forms/builder-ops";

import { MediaPicker } from "../media-picker";
import { RichTextEditor } from "../rich-text-editor";
import { RuleBuilder } from "../rule-builder";
import { NumberInput, Section, Switch, smallInputClass } from "../ui";

const labelText = "mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45";

function Header({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#e6eaf2] px-4 py-3.5 dark:border-white/[0.07]">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef1f6] text-[#5d687d] dark:bg-white/10 dark:text-white/60">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-[11px] text-[#8490a5] dark:text-white/40">{description}</p>
      </div>
    </div>
  );
}

export function WelcomeInspector({
  change,
  document,
  formId,
  readOnly,
}: {
  change: DocumentChange;
  document: FormDocument;
  formId: string;
  readOnly: boolean;
}) {
  const welcome = document.welcome;
  const update = (patch: Partial<FormWelcome>, coalesce?: string) => {
    change((current) => ({ ...current, welcome: { ...current.welcome, ...patch } }), coalesce);
  };
  return (
    <fieldset className="min-w-0" disabled={readOnly}>
      <Header
        description="The first thing respondents see."
        icon={<HandWaving size={16} weight="bold" />}
        title="Welcome screen"
      />
      <Section title="Screen">
        <Switch
          checked={welcome.enabled}
          description="Off: the form opens straight on the first question."
          label="Show a welcome screen"
          onChange={(enabled) => {
            update({ enabled });
          }}
          size="sm"
        />
        <label className="block">
          <span className={labelText}>Eyebrow</span>
          <input
            className={smallInputClass}
            maxLength={80}
            onChange={(event) => {
              update({ eyebrow: event.target.value || undefined }, "welcome.eyebrow");
            }}
            placeholder="e.g. MGM Laboratory · 2026"
            value={welcome.eyebrow ?? ""}
          />
        </label>
        <label className="block">
          <span className={labelText}>Title</span>
          <input
            className={smallInputClass}
            maxLength={200}
            onChange={(event) => {
              update({ title: event.target.value }, "welcome.title");
            }}
            placeholder={document.title}
            value={welcome.title}
          />
        </label>
        <div>
          <span className={labelText}>Body</span>
          <RichTextEditor
            label="Welcome text"
            minHeight={110}
            onChange={(body) => {
              update({ body }, "welcome.body");
            }}
            placeholder="What is this form for, and what happens next?"
            value={welcome.body}
          />
        </div>
        <label className="block">
          <span className={labelText}>Button label</span>
          <input
            className={smallInputClass}
            maxLength={40}
            onChange={(event) => {
              update({ buttonLabel: event.target.value }, "welcome.button");
            }}
            placeholder="Start"
            value={welcome.buttonLabel}
          />
        </label>
        <Switch
          checked={welcome.showDuration}
          label="Show “takes about N minutes”"
          onChange={(showDuration) => {
            update({ showDuration });
          }}
          size="sm"
        />
        <Switch
          checked={welcome.showQuestionCount}
          label="Show the number of questions"
          onChange={(showQuestionCount) => {
            update({ showQuestionCount });
          }}
          size="sm"
        />
      </Section>
      <Section title="Media">
        <MediaPicker
          focal
          formId={formId}
          label="Welcome media"
          onChange={(media) => {
            update({ media });
          }}
          value={welcome.media}
        />
      </Section>
    </fieldset>
  );
}

function urlError(value: string | undefined) {
  if (!value) return undefined;
  return SAFE_URL_PATTERN.test(value.trim())
    ? undefined
    : "Use a full https:// link or a site path like /events.";
}

export function EndingInspector({
  change,
  document,
  ending,
  formId,
  onRemoved,
  readOnly,
}: {
  change: DocumentChange;
  document: FormDocument;
  ending: FormEnding;
  formId: string;
  onRemoved: () => void;
  readOnly: boolean;
}) {
  const index = document.endings.findIndex((item) => item.id === ending.id);
  const defaultIndex = document.endings.findIndex((item) => !item.when?.rules.length);
  const isDefault = index === defaultIndex;
  const update = (patch: Partial<FormEnding>, coalesce?: string) => {
    change((current) => patchEnding(current, ending.id, patch), coalesce);
  };
  const buttonError = urlError(ending.buttonUrl);
  const redirectError = urlError(ending.redirectUrl);

  return (
    <fieldset className="min-w-0" disabled={readOnly}>
      <Header
        description={
          isDefault
            ? "The default ending: shown when no other ending's rules match."
            : ending.when?.rules.length
              ? "Shown when its rules match."
              : "Never reached: an earlier ending without rules is the default."
        }
        icon={<Flag size={16} weight="bold" />}
        title={`Ending ${index + 1}`}
      />
      <div className="flex items-center gap-1 px-4 pt-3">
        <button
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#5d687d] hover:bg-[#eef1f7] disabled:opacity-30 dark:text-white/55 dark:hover:bg-white/[0.07]"
          disabled={index === 0}
          onClick={() => {
            change((current) => moveEnding(current, ending.id, -1));
          }}
          type="button"
        >
          <ArrowUp size={13} /> Earlier
        </button>
        <button
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#5d687d] hover:bg-[#eef1f7] disabled:opacity-30 dark:text-white/55 dark:hover:bg-white/[0.07]"
          disabled={index === document.endings.length - 1}
          onClick={() => {
            change((current) => moveEnding(current, ending.id, 1));
          }}
          type="button"
        >
          <ArrowDown size={13} /> Later
        </button>
        <button
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-red hover:bg-brand-red-50 disabled:opacity-30 dark:hover:bg-brand-red/15"
          disabled={document.endings.length <= 1}
          onClick={() => {
            change((current) => removeEnding(current, ending.id));
            onRemoved();
          }}
          title={
            document.endings.length <= 1 ? "A form needs at least one ending" : "Delete this ending"
          }
          type="button"
        >
          <Trash size={13} /> Delete
        </button>
      </div>
      <Section title="Content">
        <label className="block">
          <span className={labelText}>Title</span>
          <input
            className={smallInputClass}
            maxLength={200}
            onChange={(event) => {
              update({ title: event.target.value }, `${ending.id}:title`);
            }}
            placeholder="Thank you"
            value={ending.title}
          />
        </label>
        <div>
          <span className={labelText}>Body</span>
          <RichTextEditor
            label="Ending text"
            minHeight={110}
            onChange={(body) => {
              update({ body }, `${ending.id}:body`);
            }}
            placeholder="What happens next?"
            value={ending.body}
          />
        </div>
        <MediaPicker
          formId={formId}
          label="Ending media"
          onChange={(media) => {
            update({ media });
          }}
          value={ending.media}
        />
        <Switch
          checked={ending.showScore}
          description={
            document.settings.scoring.enabled
              ? undefined
              : "Turn scoring on in Logic or Settings first."
          }
          label="Show the score"
          onChange={(showScore) => {
            update({ showScore });
          }}
          size="sm"
        />
        <Switch
          checked={ending.showShare}
          label="Show share buttons"
          onChange={(showShare) => {
            update({ showShare });
          }}
          size="sm"
        />
        <Switch
          checked={ending.allowAnother}
          label="Offer “Submit another response”"
          onChange={(allowAnother) => {
            update({ allowAnother });
          }}
          size="sm"
        />
      </Section>
      <Section title="Button and redirect">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelText}>Button label</span>
            <input
              className={smallInputClass}
              maxLength={40}
              onChange={(event) => {
                update(
                  { buttonLabel: event.target.value || undefined },
                  `${ending.id}:buttonLabel`,
                );
              }}
              placeholder="Back to the site"
              value={ending.buttonLabel ?? ""}
            />
          </label>
          <label className="block">
            <span className={labelText}>Button link</span>
            <input
              aria-invalid={Boolean(buttonError) || undefined}
              className={smallInputClass}
              maxLength={2000}
              onChange={(event) => {
                update(
                  { buttonUrl: event.target.value.trim() || undefined },
                  `${ending.id}:buttonUrl`,
                );
              }}
              placeholder="https:// or /path"
              value={ending.buttonUrl ?? ""}
            />
          </label>
        </div>
        {buttonError ? (
          <p className="text-[11px] font-semibold text-brand-red" role="alert">
            {buttonError}
          </p>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className="block">
            <span className={labelText}>Redirect to</span>
            <input
              aria-invalid={Boolean(redirectError) || undefined}
              className={smallInputClass}
              maxLength={2000}
              onChange={(event) => {
                update(
                  { redirectUrl: event.target.value.trim() || undefined },
                  `${ending.id}:redirect`,
                );
              }}
              placeholder="Optional"
              value={ending.redirectUrl ?? ""}
            />
          </label>
          <label className="block">
            <span className={labelText}>After (s)</span>
            <NumberInput
              max={60}
              min={0}
              onChange={(value) => {
                update(
                  {
                    redirectDelaySeconds:
                      value === undefined
                        ? undefined
                        : Math.min(60, Math.max(0, Math.round(value))),
                  },
                  `${ending.id}:delay`,
                );
              }}
              placeholder="5"
              value={ending.redirectDelaySeconds}
            />
          </label>
        </div>
        {redirectError ? (
          <p className="text-[11px] font-semibold text-brand-red" role="alert">
            {redirectError}
          </p>
        ) : null}
      </Section>
      <Section
        title="When"
        description="Endings are checked in order; the first whose rules match is shown. The first ending without rules is the default."
      >
        <RuleBuilder
          allowScore={document.settings.scoring.enabled}
          document={document}
          emptyHint="No rules: this can be the default ending."
          label="Show this ending when"
          onChange={(when) => {
            update({ when });
          }}
          readOnly={readOnly}
          value={ending.when}
        />
      </Section>
    </fieldset>
  );
}

export function FormInspector({
  change,
  document,
  readOnly,
}: {
  change: DocumentChange;
  document: FormDocument;
  readOnly: boolean;
}) {
  return (
    <fieldset className="min-w-0" disabled={readOnly}>
      <Header
        description="Select a block to edit it, or edit the form here."
        icon={<Flag size={16} weight="bold" />}
        title="Form"
      />
      <Section title="Form">
        <label className="block">
          <span className={labelText}>Title</span>
          <input
            className={smallInputClass}
            maxLength={200}
            onChange={(event) => {
              change((current) => ({ ...current, title: event.target.value }), "form.title");
            }}
            value={document.title}
          />
        </label>
        <div>
          <span className={labelText}>Description</span>
          <RichTextEditor
            label="Form description"
            minHeight={90}
            onChange={(description) => {
              change((current) => ({ ...current, description }), "form.description");
            }}
            placeholder="Shown above the questions in the classic layout"
            value={document.description}
          />
        </div>
      </Section>
      <Section title="Tips">
        <ul className="list-disc space-y-1.5 pl-4 text-xs leading-5 text-[#69748a] dark:text-white/50">
          <li>Click a block, or press Enter on it, to edit it here.</li>
          <li>
            Alt+↑ / Alt+↓ moves the focused block; drag the handle on its left edge with a mouse.
          </li>
          <li>Shift or Cmd/Ctrl click selects several blocks for bulk actions.</li>
          <li>Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z redoes, Cmd/Ctrl+S saves now.</li>
        </ul>
      </Section>
    </fieldset>
  );
}
