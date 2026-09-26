"use client";

import { useEffect, useRef, type FocusEvent } from "react";
import { isInputType, type FormAnswerValue, type FormField } from "@repo/shared";

import { useFormController } from "./form-context";
import { ContentBlock, FIELD_REGISTRY } from "./fields/registry";
import { FormMediaView } from "./media";
import { RichText } from "./rich-text";

/**
 * One question: its number, label (with `{{fieldId}}` piping), description,
 * picture, help, the control and its error. Groups of controls (choices,
 * scales, several inputs) are a fieldset with the label as its legend;
 * single inputs get a real <label>.
 */
export function FieldBlock({
  field,
  conversational = false,
  onComplete,
  headingLevel = 2,
}: {
  field: FormField;
  conversational?: boolean;
  onComplete?: () => void;
  headingLevel?: 2 | 3;
}) {
  const controller = useFormController();
  const { answers, setAnswer, errorText, numbers, pipe, labels, shakes } = controller;
  const shakeRef = useRef<HTMLDivElement>(null);
  const shake = shakes.get(field.id) ?? 0;

  useEffect(() => {
    if (!shake || !shakeRef.current || controller.reducedMotion) return;
    shakeRef.current.animate(
      [
        { translate: "0 0" },
        { translate: "-9px 0" },
        { translate: "8px 0" },
        { translate: "-5px 0" },
        { translate: "3px 0" },
        { translate: "0 0" },
      ],
      { duration: 420, easing: "ease-out" },
    );
  }, [shake, controller.reducedMotion]);

  if (!isInputType(field.type)) {
    return <ContentBlock field={field} conversational={conversational} />;
  }
  if (field.type === "hidden") return null;

  const entry = FIELD_REGISTRY[field.type];
  const Control = entry.component;
  const inputId = `fx-q-${field.id}`;
  const labelId = `${inputId}-label`;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;
  const descriptionId = `${inputId}-description`;
  const error = errorText(field.id);
  const describedBy =
    [field.description ? descriptionId : null, field.help ? helpId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const number = numbers.get(field.id);
  const Heading = conversational ? "h2" : headingLevel === 3 ? "h3" : "h2";

  const label = (
    <>
      {number !== undefined ? (
        <span className="fx-qnum" aria-hidden>
          {String(number).padStart(2, "0")}
        </span>
      ) : null}
      <span className="fx-qlabel-text" data-type-target="">
        {pipe(field.label) || labels.other}
        {field.required ? (
          <span className="fx-required" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </span>
      {field.required ? <span className="fx-sr-only">, {labels.required}</span> : null}
    </>
  );

  const onFocus = () => {
    controller.onFieldFocus(field.id);
  };
  const staysInField = (root: HTMLElement, next: Node | null) => {
    if (next && root.contains(next)) return true;
    // A picker's panel is portaled out of the field but still part of it.
    return next instanceof Element && next.closest(`[data-popover-for="${inputId}"]`) !== null;
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const root = event.currentTarget;
    const next = event.relatedTarget as Node | null;
    if (staysInField(root, next)) return;
    if (next) {
      controller.onFieldBlur(field.id);
      return;
    }
    // Focus can pass through the body for a frame while a picker's panel
    // mounts; judge by where it lands, so opening a panel never counts as
    // leaving the question (which would show "needs an answer" at once).
    requestAnimationFrame(() => {
      if (!staysInField(root, document.activeElement)) controller.onFieldBlur(field.id);
    });
  };

  const control = (
    <div className="fx-control" ref={shakeRef}>
      <Control
        field={field}
        value={answers[field.id] as never}
        onChange={(value: FormAnswerValue | undefined) => {
          setAnswer(field.id, value);
        }}
        inputId={inputId}
        describedBy={describedBy}
        invalid={Boolean(error)}
        conversational={conversational}
        onComplete={onComplete}
      />
    </div>
  );

  const extras = (
    <>
      {field.description ? (
        <div id={descriptionId} className="fx-qdesc">
          <RichText doc={field.description} transform={pipe} />
        </div>
      ) : null}
      {field.media ? <FormMediaView media={field.media} className="fx-qmedia" /> : null}
    </>
  );

  const footer = (
    <>
      {field.help ? (
        <p id={helpId} className="fx-help">
          {pipe(field.help)}
        </p>
      ) : null}
      <p id={errorId} className="fx-error" role={error ? "alert" : undefined} aria-live="polite">
        {error ?? ""}
      </p>
    </>
  );

  if (entry.group) {
    return (
      <fieldset
        className="fx-field"
        data-type={field.type}
        data-invalid={error ? "" : undefined}
        data-field-id={field.id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <legend className="fx-qlabel" id={labelId}>
          <Heading className="fx-qheading">{label}</Heading>
        </legend>
        {extras}
        {control}
        {footer}
      </fieldset>
    );
  }
  return (
    <div
      className="fx-field"
      data-type={field.type}
      data-invalid={error ? "" : undefined}
      data-field-id={field.id}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <Heading className="fx-qheading">
        <label className="fx-qlabel" htmlFor={inputId} id={labelId}>
          {label}
        </label>
      </Heading>
      {extras}
      {control}
      {footer}
    </div>
  );
}
