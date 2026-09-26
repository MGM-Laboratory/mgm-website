"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  computeScore,
  formErrorMessage,
  formLabels,
  isAnswered,
  isInputType,
  otherKey,
  pickEnding,
  pipeText,
  validateFieldAnswer,
  validateSubmission,
  type FieldError,
  type FormAnswers,
  type FormAnswerValue,
  type FormEnding,
  type PublicFormDocument,
} from "@repo/shared";

import {
  clearAutosave,
  clientContext,
  formDeviceId,
  formSessionId,
  hasResponded,
  loadAutosave,
  markResponded,
  resetFormSession,
  saveAutosave,
  sendFormEvent,
  submitFormResponse,
  type FormAutosave,
} from "@/lib/forms/public-client";
import { formCopy } from "@/lib/forms/public-copy";
import {
  conversationalSteps,
  forcedEnding,
  formProgress,
  initialAnswers,
  isDone,
  questionNumbers,
  routePages,
  sanitizeDraft,
} from "@/lib/forms/public-runtime";
import type { ProjectColorScheme } from "@/lib/project-themes";
import { useMotionPreference } from "@/lib/reduced-motion";

import { ClassicLayout } from "./classic-layout";
import { ConversationalLayout } from "./conversational-layout";
import { EndingStage } from "./ending";
import { FormContext, type FormController } from "./form-context";
import { FormShell } from "./form-shell";
import { FormProgressBar } from "./progress";
import { SceneBus } from "./scene/bus";
import { playSound, type SoundKind } from "./sound";
import { SoundToggle } from "./sound-toggle";
import { StatusCard } from "./status-screens";
import { WelcomeStage } from "./welcome";

export type PreviewStage = "welcome" | "form" | "ending";

/** The admin preview's remote control (SPEC section 6). */
export type PreviewControl = {
  stage: PreviewStage;
  endingId?: string;
  focusFieldId?: string;
  /** Changes on every render message, so a repeated jump replays. */
  nonce: number;
  onStage: (stage: PreviewStage, fieldId?: string) => void;
};

type Stage = "welcome" | "form" | "ending" | "already" | "conflict";

type State = {
  booted: boolean;
  sessionId: string;
  stage: Stage;
  answers: FormAnswers;
  touched: ReadonlySet<string>;
  serverErrors: ReadonlyMap<string, FieldError>;
  /** Classic: page ids visited; conversational: step ids visited. */
  trail: string[];
  startedAt?: string;
  ending?: { ending: FormEnding; score: number | null };
  conflict?: "closed" | "limit_reached" | "already" | "not_open_yet";
  draft?: FormAutosave;
  restored: boolean;
  shakes: ReadonlyMap<string, number>;
};

type Action =
  | {
      type: "boot";
      answers: FormAnswers;
      draft?: FormAutosave;
      already: boolean;
      restore: boolean;
      sessionId: string;
    }
  | { type: "session"; sessionId: string }
  | { type: "answer"; fieldId: string; value: FormAnswerValue | undefined }
  | { type: "touch"; ids: string[] }
  | { type: "shake"; ids: string[] }
  | { type: "start"; resume: boolean }
  | { type: "discardDraft" }
  | { type: "trail"; trail: string[] }
  | { type: "serverErrors"; errors: Record<string, FieldError>; trail?: string[] }
  | { type: "ending"; ending: FormEnding; score: number | null }
  | { type: "conflict"; reason: NonNullable<State["conflict"]> }
  | { type: "stage"; stage: Stage; trail?: string[] }
  | { type: "reset"; answers: FormAnswers };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "session":
      return { ...state, sessionId: action.sessionId };
    case "boot": {
      if (action.already) {
        return { ...state, booted: true, sessionId: action.sessionId, stage: "already" };
      }
      const restore = action.restore ? action.draft : undefined;
      return {
        ...state,
        booted: true,
        sessionId: action.sessionId,
        answers: restore ? { ...action.answers, ...restore.answers } : action.answers,
        trail: restore?.trail.length ? restore.trail : state.trail,
        startedAt: restore ? restore.startedAt : state.startedAt,
        draft: restore ? undefined : action.draft,
        restored: Boolean(restore),
      };
    }
    case "answer": {
      const answers = new Map(Object.entries(state.answers));
      if (action.value === undefined) answers.delete(action.fieldId);
      else answers.set(action.fieldId, action.value);
      const serverErrors = new Map(state.serverErrors);
      serverErrors.delete(action.fieldId);
      // Without a welcome screen the first answer is the start.
      return {
        ...state,
        answers: Object.fromEntries(answers),
        serverErrors,
        startedAt: state.startedAt ?? new Date().toISOString(),
      };
    }
    case "touch": {
      return { ...state, touched: new Set([...state.touched, ...action.ids]) };
    }
    case "shake": {
      const shakes = new Map(state.shakes);
      for (const id of action.ids) shakes.set(id, (shakes.get(id) ?? 0) + 1);
      return { ...state, shakes };
    }
    case "start": {
      const draft = action.resume ? state.draft : undefined;
      return {
        ...state,
        stage: "form",
        answers: draft ? { ...state.answers, ...draft.answers } : state.answers,
        trail: draft?.trail.length ? draft.trail : state.trail,
        startedAt: draft?.startedAt ?? state.startedAt ?? new Date().toISOString(),
        draft: undefined,
        restored: Boolean(draft),
      };
    }
    case "discardDraft":
      return { ...state, draft: undefined, restored: false };
    case "trail":
      return { ...state, trail: action.trail };
    case "serverErrors": {
      return {
        ...state,
        serverErrors: new Map(Object.entries(action.errors)),
        touched: new Set([...state.touched, ...Object.keys(action.errors)]),
        stage: "form",
        trail: action.trail ?? state.trail,
      };
    }
    case "ending":
      return { ...state, stage: "ending", ending: { ending: action.ending, score: action.score } };
    case "conflict":
      return { ...state, stage: "conflict", conflict: action.reason };
    case "stage":
      return { ...state, stage: action.stage, trail: action.trail ?? state.trail };
    case "reset":
      return {
        ...state,
        stage: "form",
        answers: action.answers,
        touched: new Set(),
        serverErrors: new Map(),
        trail: [],
        ending: undefined,
        startedAt: new Date().toISOString(),
        restored: false,
      };
    default:
      return state;
  }
}

/** The first page (classic) or step (conversational) holding one of these fields. */
function trailTo(document: PublicFormDocument, answers: FormAnswers, fieldIds: string[]) {
  const wanted = new Set(fieldIds);
  if (document.design.layout === "conversational") {
    const steps = conversationalSteps(document, answers);
    const index = steps.findIndex((step) => wanted.has(step.id));
    return index >= 0 ? steps.slice(0, index + 1).map((step) => step.id) : undefined;
  }
  const pages = routePages(document, answers);
  const index = pages.findIndex((page) => page.fields.some((field) => wanted.has(field.id)));
  return index >= 0 ? pages.slice(0, index + 1).map((page) => page.id) : undefined;
}

export function FormRun({
  slug,
  document,
  token,
  mode,
  forced,
  preview,
}: {
  slug: string;
  document: PublicFormDocument;
  token?: string;
  mode: "live" | "preview";
  forced?: ProjectColorScheme;
  preview?: PreviewControl;
}) {
  const live = mode === "live";
  const { settings, design, welcome } = document;
  const language = settings.language;
  const labels = useMemo(() => formLabels(language, settings.labels), [language, settings.labels]);
  const copy = formCopy(language);
  const motion = useMotionPreference();
  const [bus] = useState(() => new SceneBus());

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    booted: false,
    sessionId: "",
    stage: preview?.stage ?? (welcome.enabled ? "welcome" : "form"),
    answers: initialAnswers(document, null),
    touched: new Set<string>(),
    serverErrors: new Map<string, FieldError>(),
    trail: [],
    restored: false,
    shakes: new Map<string, number>(),
  }));
  const { answers } = state;
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const [soundOn, setSoundOn] = useState(true);
  const soundAllowed = design.motion.sound && soundOn;

  // --------------------------------------------------------------- boot
  // Browser-only state after hydration: URL prefills, the autosaved
  // draft, the one-per-device mark.
  useEffect(() => {
    if (!live) {
      dispatch({
        type: "boot",
        answers: initialAnswers(document, null),
        already: false,
        restore: false,
        sessionId: "preview",
      });
      return;
    }
    const sessionId = formSessionId(slug);
    const params = new URLSearchParams(window.location.search);
    const draft = settings.autosave ? loadAutosave(slug) : null;
    const cleanDraft = draft
      ? { ...draft, answers: sanitizeDraft(document, draft.answers) }
      : undefined;
    dispatch({
      type: "boot",
      answers: initialAnswers(document, params),
      draft: cleanDraft && Object.keys(cleanDraft.answers).length ? cleanDraft : undefined,
      already: settings.onePerDevice && hasResponded(slug),
      // Without a welcome screen there is nobody to ask: bring the draft back.
      restore: !welcome.enabled,
      sessionId,
    });
    // One boot per form; the document identity is stable for a live page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, slug]);

  // -------------------------------------------------------------- events
  const startedSent = useRef(false);
  const viewSent = useRef(false);
  const progressSent = useRef(new Set<string>());
  const event = useCallback(
    (type: "view" | "start" | "progress", fieldId?: string) => {
      if (!live) return;
      sendFormEvent(slug, {
        sessionId: formSessionId(slug),
        type,
        fieldId,
        context: type === "progress" ? undefined : clientContext(),
        token,
      });
    },
    [live, slug, token],
  );
  useEffect(() => {
    if (!state.booted || viewSent.current || state.stage === "already") return;
    viewSent.current = true;
    event("view");
  }, [state.booted, state.stage, event]);

  const markStarted = useCallback(() => {
    if (startedSent.current) return;
    startedSent.current = true;
    event("start");
  }, [event]);

  // Progress: a question's first valid answer, debounced so typing doesn't count.
  const progressTimers = useRef(new Map<string, number>());
  useEffect(() => {
    if (!live || state.stage !== "form") return;
    const timers = progressTimers.current;
    for (const field of document.fields) {
      if (!isInputType(field.type) || field.type === "hidden") continue;
      if (progressSent.current.has(field.id) || timers.has(field.id)) continue;
      if (!isDone(field, answers)) continue;
      const timer = window.setTimeout(() => {
        timers.delete(field.id);
        if (progressSent.current.has(field.id)) return;
        if (!isDone(field, answersRef.current)) return;
        progressSent.current.add(field.id);
        event("progress", field.id);
      }, 900);
      timers.set(field.id, timer);
    }
  }, [answers, document.fields, event, live, state.stage]);
  useEffect(() => {
    const timers = progressTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
  // ------------------------------------------------------------ autosave
  useEffect(() => {
    if (!live || !settings.autosave || !state.booted || state.stage !== "form") return;
    const timer = window.setTimeout(() => {
      const kept: FormAnswers = {};
      const given = new Map(Object.entries(answers));
      for (const field of document.fields) {
        if (field.type === "hidden") continue;
        const answer = given.get(field.id);
        if (answer !== undefined) kept[field.id] = answer;
        const other = given.get(otherKey(field.id));
        if (other !== undefined) kept[otherKey(field.id)] = other;
      }
      if (!Object.keys(kept).length) return;
      saveAutosave(slug, { answers: kept, trail: state.trail, startedAt: state.startedAt });
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    answers,
    document.fields,
    live,
    settings.autosave,
    slug,
    state.booted,
    state.stage,
    state.startedAt,
    state.trail,
  ]);

  // --------------------------------------------------------- derived
  const progress = useMemo(() => formProgress(document, answers), [document, answers]);
  const numbers = useMemo(
    () => (settings.showQuestionNumbers ? questionNumbers(document, answers) : new Map()),
    [document, answers, settings.showQuestionNumbers],
  );
  const pipe = useCallback(
    (text: string) => pipeText(text, document.fields, answers),
    [document.fields, answers],
  );

  // Sounds wait for the respondent's first gesture (a prefill or a restored
  // draft landing pieces at load must stay silent, and audio needs one).
  const gestured = useRef(false);
  useEffect(() => {
    const mark = () => {
      gestured.current = true;
    };
    window.addEventListener("pointerdown", mark, { once: true, capture: true });
    window.addEventListener("keydown", mark, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", mark, { capture: true });
      window.removeEventListener("keydown", mark, { capture: true });
    };
  }, []);
  const sound = useCallback(
    (kind: SoundKind) => {
      if (soundAllowed && gestured.current) playSound(kind);
    },
    [soundAllowed],
  );

  // A landed piece: when the count of valid answers grows.
  const lastDone = useRef(progress.done);
  useEffect(() => {
    if (progress.done > lastDone.current) {
      bus.emit({ type: "land" });
      sound("tick");
    }
    lastDone.current = progress.done;
  }, [progress.done, bus, sound]);

  const fieldById = useMemo(
    () => new Map(document.fields.map((field) => [field.id, field])),
    [document.fields],
  );

  const errorFor = useCallback(
    (fieldId: string): FieldError | null => {
      const server = state.serverErrors.get(fieldId);
      if (server) return server;
      if (!state.touched.has(fieldId)) return null;
      const field = fieldById.get(fieldId);
      return field ? validateFieldAnswer(field, answers[field.id], answers) : null;
    },
    [answers, fieldById, state.serverErrors, state.touched],
  );
  const errorText = useCallback(
    (fieldId: string) => {
      const error = errorFor(fieldId);
      if (!error) return null;
      const field = fieldById.get(fieldId);
      if (error.code === "pattern" && field?.patternMessage) return field.patternMessage;
      return formErrorMessage(error.code, { min: error.min, max: error.max }, language);
    },
    [errorFor, fieldById, language],
  );

  const setAnswer = useCallback(
    (fieldId: string, value: FormAnswerValue | undefined) => {
      markStarted();
      dispatch({ type: "answer", fieldId, value });
    },
    [markStarted],
  );
  const touch = useCallback((fieldId: string) => {
    dispatch({ type: "touch", ids: [fieldId] });
  }, []);
  const onFieldFocus = useCallback(
    (fieldId: string) => {
      bus.emit({ type: "focus", fieldId });
      if (preview) preview.onStage("form", fieldId);
    },
    [bus, preview],
  );
  const onFieldBlur = useCallback(
    (fieldId: string) => {
      bus.emit({ type: "blur" });
      const field = fieldById.get(fieldId);
      // Only complain on blur once something was typed; empty required
      // questions speak up on Next.
      if (field && isAnswered(answersRef.current[field.id])) touch(fieldId);
    },
    [bus, fieldById, touch],
  );

  /** Validates fields; returns the ids that fail (and makes them show and shake). */
  const check = useCallback(
    (ids: string[]) => {
      const failing = ids.filter((id) => {
        const field = fieldById.get(id);
        return field && isInputType(field.type)
          ? Boolean(validateFieldAnswer(field, answersRef.current[field.id], answersRef.current))
          : false;
      });
      dispatch({ type: "touch", ids });
      if (failing.length) {
        dispatch({ type: "shake", ids: failing });
        bus.emit({ type: "error" });
        sound("error");
      }
      return failing;
    },
    [bus, fieldById, sound],
  );

  // -------------------------------------------------------------- submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const finish = useCallback(
    (ending: FormEnding, score: number | null) => {
      dispatch({ type: "ending", ending, score });
      bus.emit({ type: "celebrate" });
      sound("success");
    },
    [bus, sound],
  );

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    const current = answersRef.current;
    const result = validateSubmission(document, current);
    if (!result.ok) {
      const ids = Object.keys(result.errors);
      dispatch({ type: "serverErrors", errors: {}, trail: trailTo(document, current, ids) });
      dispatch({ type: "touch", ids });
      dispatch({ type: "shake", ids });
      bus.emit({ type: "error" });
      setSubmitError(copy.fixErrors(ids.length));
      return;
    }
    const scoring = settings.scoring.enabled;
    const localEnding = () => pickEnding(document, current, forcedEnding(document, current));
    if (!live) {
      finish(localEnding(), scoring ? computeScore(document, current) : null);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const outcome = await submitFormResponse(slug, {
      sessionId: state.sessionId || formSessionId(slug),
      answers: result.answers,
      startedAt: state.startedAt,
      context: clientContext(),
      deviceId: formDeviceId(),
      website: honeypotRef.current?.value ?? "",
      token,
    });
    submittingRef.current = false;
    setSubmitting(false);
    if (outcome.kind === "ok") {
      if (settings.autosave) clearAutosave(slug);
      markResponded(slug);
      const ending =
        document.endings.find((candidate) => candidate.id === outcome.result.endingId) ??
        localEnding();
      finish(ending, outcome.result.score ?? (scoring ? computeScore(document, current) : null));
      return;
    }
    if (outcome.kind === "invalid") {
      const ids = Object.keys(outcome.errors);
      dispatch({
        type: "serverErrors",
        errors: outcome.errors,
        trail: trailTo(document, current, ids),
      });
      dispatch({ type: "shake", ids });
      bus.emit({ type: "error" });
      setSubmitError(copy.fixErrors(ids.length));
      return;
    }
    if (outcome.kind === "conflict") {
      if (outcome.reason === "already") markResponded(slug);
      dispatch({ type: "conflict", reason: outcome.reason });
      return;
    }
    setSubmitError(outcome.message ? `${outcome.message} ${copy.retry}.` : copy.submitFailed);
  }, [
    bus,
    copy,
    document,
    finish,
    live,
    settings.autosave,
    settings.scoring.enabled,
    slug,
    state.sessionId,
    state.startedAt,
    token,
  ]);

  const another = useCallback(() => {
    if (live) {
      resetFormSession(slug);
      dispatch({ type: "session", sessionId: formSessionId(slug) });
      startedSent.current = false;
      progressSent.current.clear();
      viewSent.current = false;
    }
    dispatch({
      type: "reset",
      answers: initialAnswers(document, live ? new URLSearchParams(window.location.search) : null),
    });
  }, [document, live, slug]);

  // -------------------------------------------------------------- preview
  const previewStage = preview?.stage;
  const previewEnding = preview?.endingId;
  const previewFocus = preview?.focusFieldId;
  // Jump only when the builder asks for somewhere new: every edit resends
  // the document, and re-jumping on each would yank the respondent side
  // (and focus) around while the admin types.
  const jumpKey = previewStage
    ? `${previewStage}|${previewEnding ?? ""}|${previewFocus ?? ""}`
    : "";
  const lastJump = useRef("");
  useEffect(() => {
    if (!previewStage || jumpKey === lastJump.current) return;
    lastJump.current = jumpKey;
    const current = answersRef.current;
    if (previewStage === "ending") {
      const ending =
        document.endings.find((candidate) => candidate.id === previewEnding) ??
        pickEnding(document, current, forcedEnding(document, current));
      dispatch({
        type: "ending",
        ending,
        score: settings.scoring.enabled ? computeScore(document, current) : null,
      });
      return;
    }
    if (previewStage === "form" && previewFocus) {
      dispatch({ type: "stage", stage: "form", trail: trailTo(document, current, [previewFocus]) });
      return;
    }
    dispatch({ type: "stage", stage: previewStage });
  }, [document, jumpKey, previewEnding, previewFocus, previewStage, settings.scoring.enabled]);

  const onPreviewStage = preview?.onStage;
  useEffect(() => {
    if (!onPreviewStage) return;
    if (state.stage === "welcome" || state.stage === "form" || state.stage === "ending") {
      onPreviewStage(state.stage);
    }
  }, [onPreviewStage, state.stage]);

  // -------------------------------------------------------------- render
  const controller: FormController = {
    slug,
    document,
    mode,
    language,
    labels,
    copy,
    answers,
    setAnswer,
    errorFor,
    errorText,
    touch,
    numbers,
    progress,
    pipe,
    onFieldFocus,
    onFieldBlur,
    shakes: state.shakes,
    upload: { sessionId: state.sessionId, token },
    bus,
    reducedMotion: !motion,
    sound,
  };

  const start = (resume: boolean) => {
    markStarted();
    sound("page");
    dispatch({ type: "start", resume });
    if (!resume && state.draft && live) clearAutosave(slug);
  };

  const stage = state.stage;
  const shellStage =
    stage === "welcome"
      ? "welcome"
      : stage === "ending"
        ? "ending"
        : stage === "form"
          ? "form"
          : "status";
  const complete = stage === "ending";

  return (
    <FormContext.Provider value={controller}>
      <FormShell
        slug={slug}
        design={design}
        forced={forced}
        stage={shellStage}
        progress={progress.fraction}
        complete={complete}
        bus={bus}
        preview={!live}
        topbar={
          <div className="fx-topbar-end">
            {stage === "form" && design.progress !== "none" ? (
              <FormProgressBar style={design.progress} progress={progress} copy={copy} />
            ) : null}
            {design.motion.sound ? (
              <SoundToggle
                on={soundOn}
                onToggle={() => {
                  setSoundOn((value) => !value);
                }}
                copy={copy}
              />
            ) : null}
          </div>
        }
      >
        {stage === "welcome" ? (
          <WelcomeStage
            document={document}
            draft={state.draft}
            onStart={start}
            onDiscard={() => {
              clearAutosave(slug);
              dispatch({ type: "discardDraft" });
            }}
          />
        ) : null}
        {stage === "form" ? (
          <>
            {design.layout === "conversational" ? (
              <ConversationalLayout
                trail={state.trail}
                setTrail={(trail) => {
                  dispatch({ type: "trail", trail });
                }}
                check={check}
                submit={submit}
                submitting={submitting}
                submitError={submitError}
                restored={state.restored}
                onStartOver={() => {
                  clearAutosave(slug);
                  another();
                }}
                focusFieldId={previewFocus}
                focusNonce={jumpKey}
              />
            ) : (
              <ClassicLayout
                trail={state.trail}
                setTrail={(trail) => {
                  dispatch({ type: "trail", trail });
                }}
                check={check}
                submit={submit}
                submitting={submitting}
                submitError={submitError}
                restored={state.restored}
                onStartOver={() => {
                  clearAutosave(slug);
                  another();
                }}
                focusFieldId={previewFocus}
                focusNonce={jumpKey}
              />
            )}
            <div className="fx-trap" aria-hidden>
              <label htmlFor="fx-website">Website</label>
              <input
                ref={honeypotRef}
                id="fx-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                defaultValue=""
              />
            </div>
          </>
        ) : null}
        {stage === "ending" && state.ending ? (
          <EndingStage
            ending={
              document.endings.find((candidate) => candidate.id === state.ending?.ending.id) ??
              state.ending.ending
            }
            score={state.ending.score}
            onAnother={another}
            celebration={design.motion.celebration}
          />
        ) : null}
        {stage === "already" ? (
          <div className="fx-center">
            <StatusCard glyph="done" eyebrow={document.title} title={copy.alreadyTitle}>
              <p className="fx-status-body">{copy.alreadyBody}</p>
            </StatusCard>
          </div>
        ) : null}
        {stage === "conflict" ? (
          <div className="fx-center">
            {state.conflict === "already" ? (
              <StatusCard glyph="done" eyebrow={document.title} title={copy.alreadyTitle}>
                <p className="fx-status-body">{copy.alreadyBody}</p>
              </StatusCard>
            ) : state.conflict === "limit_reached" ? (
              <StatusCard
                glyph="full"
                eyebrow={document.title}
                title={settings.closedTitle || copy.fullTitle}
              >
                <p className="fx-status-body">{settings.closedMessage || copy.fullBody}</p>
              </StatusCard>
            ) : (
              <StatusCard
                glyph={state.conflict === "not_open_yet" ? "soon" : "closed"}
                eyebrow={document.title}
                title={
                  state.conflict === "not_open_yet"
                    ? copy.notOpenTitle
                    : settings.closedTitle || labels.closed
                }
              >
                <p className="fx-status-body">
                  {state.conflict === "not_open_yet"
                    ? copy.notOpenBody
                    : settings.closedMessage || copy.closedBody}
                </p>
              </StatusCard>
            )}
          </div>
        ) : null}
      </FormShell>
    </FormContext.Provider>
  );
}
