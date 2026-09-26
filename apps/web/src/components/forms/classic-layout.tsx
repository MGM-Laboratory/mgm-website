"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ArrowLeft, ArrowRight, History, LoaderCircle, Send } from "lucide-react";
import { buildPages, isInputType, logicContext, isFieldVisible } from "@repo/shared";

import { routePages } from "@/lib/forms/public-runtime";
import { motionAllowed } from "@/lib/reduced-motion";

import { Collapse } from "./collapse";
import { FieldBlock } from "./field-block";
import { focusAllowed, useFormController } from "./form-context";
import { SPEED, SplitText, useReveal } from "./motion";
import { RichText } from "./rich-text";

export type LayoutProps = {
  trail: string[];
  setTrail: (trail: string[]) => void;
  /** Validates these field ids; returns the ones that fail. */
  check: (ids: string[]) => string[];
  submit: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  restored: boolean;
  onStartOver: () => void;
  focusFieldId?: string;
  focusNonce?: string;
};

export function RestoredNote({ onStartOver }: { onStartOver: () => void }) {
  const { copy, labels } = useFormController();
  return (
    <div className="fx-restored" role="status">
      <History aria-hidden strokeWidth={2.25} size={18} />
      <span>{copy.restoredNote}</span>
      <button type="button" className="fx-link-button" onClick={onStartOver}>
        {labels.startOver}
      </button>
    </div>
  );
}

/**
 * The classic layout: the form as pages (split at page breaks, following
 * jumps forward only), each a column of blocks that emerge as they scroll
 * into view. Half-width questions pair up on wide screens. Next checks the
 * page and moves on (the old page leaves, the new one arrives, focus goes
 * to its first question); the last page submits.
 */
export function ClassicLayout({
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
  const { document, answers, labels, copy, pipe, sound, mode } = useFormController();
  const { design } = document;
  const allPages = useMemo(() => buildPages(document.fields), [document.fields]);
  const route = routePages(document, answers);
  const currentId = trail[trail.length - 1] ?? route[0]?.id ?? "start";
  const page = allPages.find((candidate) => candidate.id === currentId) ?? route[0] ?? allPages[0];
  const index = Math.max(
    0,
    route.findIndex((candidate) => candidate.id === page.id),
  );
  const isLast = index >= route.length - 1;
  const context = logicContext(document, answers);
  const rootRef = useRef<HTMLFormElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const leaving = useRef(false);
  const arrived = useRef(false);

  const fields = page.fields.filter((field) => field.type !== "hidden");
  const visibleIds = fields
    .filter((field) => isFieldVisible(field, context))
    .map((field) => field.id);
  useReveal(
    pageRef,
    design.motion.entrance,
    design.motion.speed,
    `${page.id}:${visibleIds.join(",")}`,
  );

  // A new page: back to the top, announce it, focus its first question.
  useLayoutEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    const element = pageRef.current;
    if (element && motionAllowed()) {
      gsap.fromTo(
        element,
        { opacity: 0, y: 48 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7 * SPEED[design.motion.speed],
          ease: "expo.out",
          immediateRender: true,
        },
      );
    }
    const first = element?.querySelector<HTMLElement>(
      ".fx-field input:not([type=hidden]):not([tabindex='-1']), .fx-field textarea, .fx-field select, .fx-rank-row",
    );
    if (focusAllowed(mode)) (first ?? headingRef.current)?.focus({ preventScroll: true });
  }, [page.id, design.motion.speed, mode]);

  // The admin preview asks to see one field: go to its page (done by the
  // runner), then scroll it into view and focus it.
  useEffect(() => {
    if (!focusFieldId) return;
    const frame = requestAnimationFrame(() => {
      const block = rootRef.current?.querySelector<HTMLElement>(
        `[data-field-id="${CSS.escape(focusFieldId)}"]`,
      );
      if (!block) return;
      block.closest<HTMLElement>("[data-reveal]")?.style.setProperty("opacity", "1");
      block.scrollIntoView({ block: "center", behavior: motionAllowed() ? "smooth" : "auto" });
      if (!focusAllowed(mode)) return;
      block
        .querySelector<HTMLElement>("input, textarea, [tabindex='0']")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusFieldId, focusNonce, mode]);

  const go = (nextTrail: string[]) => {
    const element = pageRef.current;
    if (!element || !motionAllowed() || leaving.current) {
      setTrail(nextTrail);
      return;
    }
    leaving.current = true;
    gsap.to(element, {
      opacity: 0,
      y: -32,
      duration: 0.32 * SPEED[design.motion.speed],
      ease: "power2.in",
      onComplete: () => {
        leaving.current = false;
        setTrail(nextTrail);
      },
    });
  };

  const next = () => {
    if (submitting) return;
    const ids = fields
      .filter((field) => isInputType(field.type) && visibleIds.includes(field.id))
      .map((field) => field.id);
    const failing = check(ids);
    if (failing.length) {
      const target = rootRef.current?.querySelector<HTMLElement>(
        `[data-field-id="${CSS.escape(failing[0])}"]`,
      );
      target?.scrollIntoView({ block: "center", behavior: motionAllowed() ? "smooth" : "auto" });
      target
        ?.querySelector<HTMLElement>("input:not([tabindex='-1']), textarea, select, [tabindex='0']")
        ?.focus({ preventScroll: true });
      return;
    }
    // Recompute the route with the answers as they are now.
    const nextRoute = routePages(document, answers);
    const at = nextRoute.findIndex((candidate) => candidate.id === page.id);
    const following = nextRoute[at + 1];
    if (!following) {
      void submit();
      return;
    }
    sound("page");
    const base = trail.length ? trail : [page.id];
    go([...base, following.id]);
  };

  const back = () => {
    if (trail.length <= 1) return;
    go(trail.slice(0, -1));
  };

  const isFirst = index === 0;
  const title = isFirst ? document.title : page.opener?.pageTitle || document.title;
  const description = isFirst
    ? document.welcome.enabled
      ? undefined
      : document.description
    : page.opener?.pageDescription;

  let revealIndex = 0;
  return (
    <form
      ref={rootRef}
      className="fx-classic"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        next();
      }}
      aria-labelledby="fx-page-title"
    >
      <p className="fx-sr-only" aria-live="polite">
        {route.length > 1 ? copy.pageOf(index + 1, route.length) : ""}
      </p>
      <div ref={pageRef} className="fx-page" key={page.id}>
        <header className="fx-page-head">
          {route.length > 1 ? (
            <p className="fx-eyebrow">{copy.pageOf(index + 1, route.length)}</p>
          ) : null}
          {isFirst && !document.welcome.enabled ? (
            <SplitText
              text={pipe(title)}
              as="h1"
              id="fx-page-title"
              className="fx-title fx-page-title"
              speed={design.motion.speed}
              tabIndex={-1}
              headingRef={headingRef}
            />
          ) : (
            <h1
              id="fx-page-title"
              ref={headingRef}
              tabIndex={-1}
              className="fx-title fx-page-title"
            >
              {pipe(title)}
            </h1>
          )}
          {description ? (
            <RichText doc={description} transform={pipe} className="fx-page-description" />
          ) : null}
          {restored && isFirst ? <RestoredNote onStartOver={onStartOver} /> : null}
        </header>

        <div className="fx-blocks">
          {fields.map((field) => {
            const open = visibleIds.includes(field.id);
            const width = field.width === "half" && isInputType(field.type) ? "half" : "full";
            return (
              <Collapse key={field.id} open={open} width={width}>
                <div className="fx-block" data-reveal="" data-reveal-index={revealIndex++}>
                  <FieldBlock field={field} />
                </div>
              </Collapse>
            );
          })}
        </div>

        <footer className="fx-nav">
          {trail.length > 1 && !isFirst ? (
            <button type="button" className="fx-button" data-variant="ghost" onClick={back}>
              <ArrowLeft aria-hidden strokeWidth={2.25} size={18} />
              {labels.back}
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="fx-button fx-button-next"
            data-variant="primary"
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
            ) : (
              <>
                {labels.next}
                <ArrowRight aria-hidden strokeWidth={2.25} size={18} />
              </>
            )}
          </button>
        </footer>
        <p
          className="fx-error fx-submit-error"
          role={submitError ? "alert" : undefined}
          aria-live="assertive"
        >
          {submitError ?? ""}
        </p>
        {mode === "preview" ? <p className="fx-preview-note">{copy.preview}</p> : null}
      </div>
    </form>
  );
}
