"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  LoaderCircle,
  Send,
} from "lucide-react";

import { conversationalSteps, type FormStep } from "@/lib/forms/public-runtime";
import { motionAllowed } from "@/lib/reduced-motion";

import { RestoredNote, type LayoutProps } from "./classic-layout";
import { FieldBlock } from "./field-block";
import { focusAllowed, useFormController } from "./form-context";
import { SPEED } from "./motion";
import { RichText } from "./rich-text";

/** How long a single-choice pick waits before moving on (any input cancels it). */
const AUTO_ADVANCE_MS = 700;

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  if (element.tagName === "INPUT") {
    const type = (element as HTMLInputElement).type;
    return !["radio", "checkbox", "range", "button", "submit", "color", "file"].includes(type);
  }
  return element.getAttribute("role") === "combobox";
}

function Statement({ step }: { step: FormStep }) {
  const { pipe } = useFormController();
  if (step.field) return <FieldBlock field={step.field} conversational />;
  const opener = step.page.opener;
  return (
    <div className="fx-statement">
      <h2 className="fx-title" data-type-target="">
        {pipe(opener?.pageTitle ?? "")}
      </h2>
      {opener?.pageDescription ? (
        <RichText doc={opener.pageDescription} transform={pipe} className="fx-page-description" />
      ) : null}
    </div>
  );
}

/**
 * One question at a time, full screen, big type. Enter continues (Shift+Enter
 * makes a new line in long answers), letters pick choices, digits pick on a
 * scale, arrows move between options, and a single-choice pick moves on by
 * itself after a moment. Up and down buttons step through the questions.
 */
export function ConversationalLayout({
  trail,
  setTrail,
  check,
  submit,
  submitting,
  submitError,
  restored,
  onStartOver,
  focusFieldId,
  focusNonce,
}: LayoutProps) {
  const { document, answers, labels, copy, sound, mode } = useFormController();
  const { design } = document;
  const steps = conversationalSteps(document, answers);

  // The current step: the last one visited that still exists on the route.
  let index = -1;
  for (let at = trail.length - 1; at >= 0 && index < 0; at -= 1) {
    index = steps.findIndex((step) => step.id === trail[at]);
  }
  if (index < 0) index = 0;
  const step = steps[index];
  const isLast = index >= steps.length - 1;
  const questionSteps = steps.filter((candidate) => candidate.kind === "question");
  const questionIndex =
    step?.kind === "question"
      ? questionSteps.findIndex((candidate) => candidate.id === step.id)
      : -1;

  const stepRef = useRef<HTMLDivElement>(null);
  const direction = useRef<1 | -1>(1);
  const busy = useRef(false);
  const autoTimer = useRef(0);
  const [pending, setPending] = useState(false);
  const arrived = useRef(false);

  const cancelAuto = useCallback(() => {
    window.clearTimeout(autoTimer.current);
    autoTimer.current = 0;
    setPending(false);
  }, []);

  const go = (target: number, dir: 1 | -1) => {
    const nextStep = steps[target];
    if (!nextStep) return;
    const base = trail.length ? trail : [step.id];
    let nextTrail: string[];
    if (dir > 0) {
      const at = base.lastIndexOf(step.id);
      nextTrail = [...(at >= 0 ? base.slice(0, at + 1) : base), nextStep.id];
    } else {
      const at = base.lastIndexOf(nextStep.id);
      nextTrail = at >= 0 ? base.slice(0, at + 1) : [nextStep.id];
    }
    const element = stepRef.current;
    direction.current = dir;
    if (!element || !motionAllowed()) {
      setTrail(nextTrail);
      return;
    }
    busy.current = true;
    gsap.to(element, {
      opacity: 0,
      y: -56 * dir,
      duration: 0.3 * SPEED[design.motion.speed],
      ease: "power2.in",
      onComplete: () => {
        busy.current = false;
        setTrail(nextTrail);
      },
    });
  };

  const next = () => {
    cancelAuto();
    if (busy.current || submitting || !step) return;
    if (step.kind === "question" && check([step.id]).length) {
      stepRef.current
        ?.querySelector<HTMLElement>("input:not([tabindex='-1']), textarea, [tabindex='0']")
        ?.focus();
      return;
    }
    // The route may have changed with this answer.
    const fresh = conversationalSteps(document, answers);
    const at = fresh.findIndex((candidate) => candidate.id === step.id);
    const following = fresh[at + 1];
    if (!following) {
      void submit();
      return;
    }
    sound("page");
    go(
      steps.findIndex((candidate) => candidate.id === following.id),
      1,
    );
  };

  const previous = () => {
    cancelAuto();
    if (busy.current || index === 0) return;
    go(index - 1, -1);
  };

  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });

  const onComplete = useCallback(() => {
    window.clearTimeout(autoTimer.current);
    setPending(true);
    autoTimer.current = window.setTimeout(() => {
      autoTimer.current = 0;
      setPending(false);
      nextRef.current();
    }, AUTO_ADVANCE_MS);
  }, []);

  // Entering a step: slide in, announce it, focus its control.
  useLayoutEffect(() => {
    const element = stepRef.current;
    if (!element) return;
    const first = !arrived.current;
    arrived.current = true;
    if (motionAllowed()) {
      gsap.fromTo(
        element,
        { opacity: 0, y: 64 * direction.current },
        {
          opacity: 1,
          y: 0,
          duration: 0.75 * SPEED[design.motion.speed],
          ease: "expo.out",
          immediateRender: true,
          delay: first ? 0.1 : 0,
        },
      );
      const label = element.querySelector<HTMLElement>("[data-type-target]");
      if (label && design.motion.entrance === "type") {
        gsap.fromTo(
          label,
          { clipPath: "inset(0 100% 0 0)" },
          {
            clipPath: "inset(0 0% 0 0)",
            duration: 0.9,
            ease: "steps(32)",
            clearProps: "clipPath",
            immediateRender: true,
          },
        );
      }
    }
    // On the very first step without a welcome, only desktop pointers get focus
    // (a phone would throw its keyboard up over the question).
    if (!first || document.welcome.enabled || window.matchMedia("(pointer: fine)").matches) {
      const control = element.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([tabindex='-1']):not([type=radio]):not([type=checkbox]), textarea, [role=combobox], .fx-rank-row",
      );
      const choice = element.querySelector<HTMLElement>(
        "input[type=radio]:checked, input[type=radio], input[type=checkbox]",
      );
      const heading = element.querySelector<HTMLElement>("h2");
      if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      if (focusAllowed(mode)) (control ?? choice ?? heading)?.focus({ preventScroll: true });
    }
    // Only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // Any other input cancels a pending auto-advance.
  useEffect(() => {
    if (!pending) return;
    const cancel = () => cancelAuto();
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", cancel, { once: true, capture: true });
    }, 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", cancel, { capture: true });
    };
  }, [pending, cancelAuto]);
  useEffect(() => () => window.clearTimeout(autoTimer.current), []);

  // Keyboard: Enter, letters, digits, arrows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const root = stepRef.current;
      if (!root) return;
      const target = event.target as HTMLElement | null;
      const typing = isTyping(target);
      if (event.key === "Enter") {
        if (target?.closest("button, a, [role=option]")) return;
        if (target?.tagName === "TEXTAREA") return;
        event.preventDefault();
        nextRef.current();
        return;
      }
      if (typing) return;
      if (event.key === "Escape") {
        cancelAuto();
        return;
      }
      const key = event.key.length === 1 ? event.key.toUpperCase() : "";
      if (key) {
        const option = root.querySelector<HTMLLabelElement>(
          `[data-choice-key="${CSS.escape(key)}"]`,
        );
        const input = option?.querySelector<HTMLInputElement>("input");
        if (input && !input.disabled) {
          event.preventDefault();
          input.focus();
          input.click();
          return;
        }
      }
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        !target?.closest(".fx-control")
      ) {
        const first = root.querySelector<HTMLElement>(
          "input[type=radio], input[type=checkbox], .fx-rank-row",
        );
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelAuto]);

  // The admin preview asks for one field: jump straight to it (the runner set the trail).
  useEffect(() => {
    if (!focusFieldId || !focusAllowed(mode)) return;
    const frame = requestAnimationFrame(() => {
      stepRef.current
        ?.querySelector<HTMLElement>("input, textarea, [tabindex='0']")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusFieldId, focusNonce, mode]);

  if (!step) return null;
  const withKeys =
    step.kind === "question" &&
    ["multiple_choice", "checkboxes", "picture_choice", "yes_no"].includes(step.field.type);

  return (
    <div className="fx-convo">
      <p className="fx-sr-only" aria-live="polite">
        {questionIndex >= 0 ? copy.questionOf(questionIndex + 1, questionSteps.length) : ""}
      </p>
      <div className="fx-convo-stage">
        <div ref={stepRef} className="fx-step" key={step.id} data-kind={step.kind}>
          {restored && index === 0 ? <RestoredNote onStartOver={onStartOver} /> : null}
          {step.kind === "question" ? (
            <FieldBlock field={step.field} conversational onComplete={onComplete} />
          ) : (
            <Statement step={step} />
          )}
          <div className="fx-step-actions">
            <button
              type="button"
              className="fx-button fx-button-next"
              data-variant="primary"
              data-pending={pending ? "" : undefined}
              onClick={next}
              disabled={submitting}
              aria-busy={submitting || undefined}
            >
              {submitting ? (
                <>
                  <LoaderCircle aria-hidden className="fx-spin" strokeWidth={2.25} size={18} />
                  {copy.submitting}
                </>
              ) : isLast ? (
                <>
                  {labels.submit}
                  <Send aria-hidden strokeWidth={2.25} size={18} />
                </>
              ) : step.kind === "statement" ? (
                <>
                  {labels.next}
                  <ArrowRight aria-hidden strokeWidth={2.25} size={18} />
                </>
              ) : (
                <>
                  {labels.next}
                  <Check aria-hidden strokeWidth={2.5} size={18} />
                </>
              )}
              <span className="fx-pending-ring" aria-hidden />
            </button>
            <span className="fx-key-hint" aria-hidden>
              <CornerDownLeft strokeWidth={2.25} size={14} /> {labels.pressEnter}
              {withKeys ? <> · {copy.keyHint}</> : null}
            </span>
          </div>
          <p
            className="fx-error fx-submit-error"
            role={submitError ? "alert" : undefined}
            aria-live="assertive"
          >
            {submitError ?? ""}
          </p>
          {pending ? (
            <p className="fx-sr-only" aria-live="polite">
              {copy.autoAdvance}
            </p>
          ) : null}
        </div>
      </div>
      <nav className="fx-convo-nav" aria-label={copy.progressLabel}>
        <button
          type="button"
          className="fx-icon-button"
          onClick={previous}
          disabled={index === 0}
          aria-label={copy.previous}
        >
          <ChevronUp aria-hidden strokeWidth={2.25} size={20} />
        </button>
        <button
          type="button"
          className="fx-icon-button"
          onClick={next}
          disabled={isLast || submitting}
          aria-label={copy.nextQuestion}
        >
          <ChevronDown aria-hidden strokeWidth={2.25} size={20} />
        </button>
      </nav>
      {mode === "preview" ? <p className="fx-preview-note">{copy.preview}</p> : null}
    </div>
  );
}
