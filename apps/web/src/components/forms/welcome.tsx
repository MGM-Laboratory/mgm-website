"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowRight, Clock3, History, ListChecks } from "lucide-react";
import { estimateMinutes, visibleQuestions, type PublicFormDocument } from "@repo/shared";

import type { FormAutosave } from "@/lib/forms/public-client";

import { useFormController } from "./form-context";
import { MagneticButton } from "./magnetic-button";
import { FormMediaView } from "./media";
import { SplitText, useStageEntrance } from "./motion";
import { RichText } from "./rich-text";

/**
 * The first screen: the greeting. The cover (banner, hero or split), the
 * title rising letter by letter, the invitation, how long it takes, and the
 * Start button (Enter starts too). A returning respondent is offered their
 * earlier answers.
 */
export function WelcomeStage({
  document,
  draft,
  onStart,
  onDiscard,
}: {
  document: PublicFormDocument;
  draft?: FormAutosave;
  onStart: (resume: boolean) => void;
  onDiscard: () => void;
}) {
  const { copy, labels, answers } = useFormController();
  const { welcome, design } = document;
  const rootRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  useStageEntrance(rootRef, design.motion.speed, draft ? "welcome:draft" : "welcome");

  const questions = visibleQuestions(document, answers).length;
  const minutes = estimateMinutes(document.fields);
  const title = welcome.title || document.title;
  const body = welcome.body ?? document.description;
  const coverStyle = design.cover.style;
  const coverMedia = design.cover.media ?? (coverStyle !== "none" ? welcome.media : undefined);
  const inlineMedia = coverStyle === "none" ? welcome.media : undefined;

  // Enter starts (or resumes), unless the respondent is in a control.
  const startRefCallback = useRef(onStart);
  useEffect(() => {
    startRefCallback.current = onStart;
  }, [onStart]);
  const hasDraft = Boolean(draft);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && target.closest("button, a, input, textarea, select")) return;
      event.preventDefault();
      startRefCallback.current(hasDraft);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasDraft]);

  const meta = (
    <ul className="fx-welcome-meta" data-stage-item="">
      {welcome.showDuration ? (
        <li>
          <Clock3 aria-hidden strokeWidth={2.25} size={16} />
          {copy.minutes(minutes)}
        </li>
      ) : null}
      {welcome.showQuestionCount && questions ? (
        <li>
          <ListChecks aria-hidden strokeWidth={2.25} size={16} />
          {copy.questions(questions)}
        </li>
      ) : null}
    </ul>
  );

  const content = (
    <div className="fx-welcome-content">
      {welcome.eyebrow ? (
        <p className="fx-eyebrow" data-stage-item="">
          {welcome.eyebrow}
        </p>
      ) : null}
      <SplitText
        text={title}
        as="h1"
        className="fx-display fx-welcome-title"
        id="fx-welcome-title"
        speed={design.motion.speed}
      />
      {body ? (
        <div data-stage-item="">
          <RichText doc={body} className="fx-welcome-body" />
        </div>
      ) : null}
      {inlineMedia ? (
        <div data-stage-item="">
          <FormMediaView media={inlineMedia} className="fx-welcome-media" eager />
        </div>
      ) : null}
      {welcome.showDuration || welcome.showQuestionCount ? meta : null}
      {draft ? (
        <div
          className="fx-resume"
          data-stage-item=""
          role="group"
          aria-labelledby="fx-resume-title"
        >
          <History aria-hidden strokeWidth={2.25} size={20} />
          <div>
            <p id="fx-resume-title" className="fx-resume-title">
              {copy.resumeTitle}
            </p>
            <p className="fx-muted">{copy.resumeBody}</p>
          </div>
        </div>
      ) : null}
      <div className="fx-welcome-actions" data-stage-item="">
        <MagneticButton
          buttonRef={startRef}
          onClick={() => onStart(Boolean(draft))}
          aria-describedby="fx-start-hint"
        >
          <span>{draft ? labels.resume : welcome.buttonLabel || labels.start}</span>
          <span className="fx-button-orb" aria-hidden>
            <ArrowRight strokeWidth={2.25} size={18} />
          </span>
        </MagneticButton>
        {draft ? (
          <button
            type="button"
            className="fx-button"
            data-variant="ghost"
            onClick={() => {
              onDiscard();
              onStart(false);
            }}
          >
            {labels.startOver}
          </button>
        ) : null}
        <span id="fx-start-hint" className="fx-key-hint">
          {copy.startHint}
        </span>
      </div>
    </div>
  );

  return (
    <section
      ref={rootRef}
      className="fx-welcome"
      data-cover={coverMedia ? coverStyle : "none"}
      aria-labelledby="fx-welcome-title"
      style={{ ["--fx-overlay" as string]: design.cover.overlay / 100 } as CSSProperties}
    >
      {coverMedia && coverStyle !== "none" ? (
        <div className="fx-welcome-cover" data-stage-item="">
          <FormMediaView media={coverMedia} cover eager />
        </div>
      ) : null}
      {content}
    </section>
  );
}
