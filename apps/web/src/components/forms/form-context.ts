"use client";

import { createContext, useContext } from "react";
import type {
  FieldError,
  FormAnswers,
  FormAnswerValue,
  FormField,
  FormLabelKey,
  FormLanguage,
  PublicFormDocument,
} from "@repo/shared";

import type { FormCopy } from "@/lib/forms/public-copy";
import type { FormProgress } from "@/lib/forms/public-runtime";

import type { SceneBus } from "./scene/bus";

/**
 * What every screen and field of a running form reads: the document, the
 * answers and how to change them, the errors to show, the words in the
 * form's language, and where uploads go.
 */
export type FormController = {
  slug: string;
  document: PublicFormDocument;
  mode: "live" | "preview";
  language: FormLanguage;
  labels: Record<FormLabelKey, string>;
  copy: FormCopy;
  answers: FormAnswers;
  setAnswer: (fieldId: string, value: FormAnswerValue | undefined) => void;
  /** The shown error of a field (after a blur, a Next or the server), or null. */
  errorFor: (fieldId: string) => FieldError | null;
  errorText: (fieldId: string) => string | null;
  touch: (fieldId: string) => void;
  numbers: Map<string, number>;
  progress: FormProgress;
  pipe: (text: string) => string;
  onFieldFocus: (fieldId: string) => void;
  onFieldBlur: (fieldId: string) => void;
  /** Bumped per field when it should shake (a failed Next). */
  shakes: Record<string, number>;
  upload: { sessionId: string; token?: string };
  bus: SceneBus;
  reducedMotion: boolean;
  /** Plays a soft sound when sound is on. */
  sound: (kind: "tick" | "select" | "error" | "page" | "success") => void;
};

export const FormContext = createContext<FormController | null>(null);

export function useFormController() {
  const controller = useContext(FormContext);
  if (!controller) throw new Error("A form field rendered outside its form.");
  return controller;
}

/** Props every question component receives. */
export type FieldProps<T extends FormAnswerValue = FormAnswerValue> = {
  field: FormField;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  /** The id of the element the label points at. */
  inputId: string;
  /** `aria-describedby` for the input: help, error, hints. */
  describedBy?: string;
  invalid: boolean;
  /** Conversational layout: bigger targets, letter keys, auto-advance. */
  conversational?: boolean;
  /** Conversational: the answer is complete and the form may move on. */
  onComplete?: () => void;
};
