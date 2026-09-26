"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  ArrowUpRight,
  Briefcase,
  Check,
  Link2,
  MessageCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import { maxScore, type FormCelebration, type FormEnding } from "@repo/shared";

import { motionAllowed } from "@/lib/reduced-motion";

import { Celebration } from "./celebration";
import { focusAllowed, useFormController } from "./form-context";
import { FormMediaView } from "./media";
import { SplitText, useStageEntrance } from "./motion";
import { RichText } from "./rich-text";

/**
 * The ending: the celebration, the title rising, a warm thank-you, the
 * score counting up, the ending's picture, its button, sharing, "submit
 * another response" and a visible, cancellable redirect.
 */

function ScoreCounter({ score, max }: { score: number; max: number }) {
  const { copy } = useFormController();
  const valueRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = valueRef.current;
    if (!element) return;
    if (!motionAllowed()) {
      element.textContent = String(score);
      return;
    }
    const counter = { value: 0 };
    const tween = gsap.to(counter, {
      value: score,
      duration: 1.6,
      delay: 0.6,
      ease: "power3.out",
      onUpdate: () => {
        element.textContent = String(Math.round(counter.value));
      },
    });
    return () => {
      tween.kill();
    };
  }, [score]);
  const fraction = max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
  return (
    <div
      className="fx-score"
      data-stage-item=""
      style={{ ["--score" as string]: fraction } as React.CSSProperties}
    >
      <p className="fx-eyebrow">{copy.score}</p>
      <p className="fx-score-value" aria-label={`${score} / ${max}`}>
        <span ref={valueRef} aria-hidden>
          {score}
        </span>
        <span className="fx-score-max" aria-hidden>
          {" "}
          / {max}
        </span>
      </p>
      <span className="fx-score-bar" aria-hidden />
    </div>
  );
}

function ShareRow() {
  const { copy, document } = useFormController();
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === "undefined" ? "" : window.location.origin + window.location.pathname;
  const text = document.settings.seo.title || document.title;
  const links = [
    {
      label: "WhatsApp",
      Icon: MessageCircle,
      href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    },
    {
      label: "X",
      Icon: Send,
      href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    },
    {
      label: "LinkedIn",
      Icon: Briefcase,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    },
  ];
  return (
    <div className="fx-share" data-stage-item="" role="group" aria-label={copy.share}>
      <p className="fx-share-title">{copy.share}</p>
      <div className="fx-share-row">
        <button
          type="button"
          className="fx-chip"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2200);
              })
              .catch(() => undefined);
          }}
        >
          {copied ? (
            <Check aria-hidden strokeWidth={2.25} size={16} />
          ) : (
            <Link2 aria-hidden strokeWidth={2.25} size={16} />
          )}
          <span aria-live="polite">{copied ? copy.copied : copy.copyLink}</span>
        </button>
        {links.map(({ label, Icon, href }) => (
          <a key={label} className="fx-chip" href={href} target="_blank" rel="noopener noreferrer">
            <Icon aria-hidden strokeWidth={2.25} size={16} />
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Redirect({ url, seconds }: { url: string; seconds: number }) {
  const { copy, mode } = useFormController();
  const [left, setLeft] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    if (cancelled) return;
    const timer = window.setInterval(() => {
      // Visible time only: a background tab doesn't leave on its own.
      if (!document.hidden) setLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cancelled]);
  useEffect(() => {
    if (!cancelled && left <= 0 && mode === "live") window.location.assign(url);
  }, [cancelled, left, mode, url]);
  if (cancelled) return null;
  return (
    <div className="fx-redirect" data-stage-item="" role="status">
      <span
        className="fx-redirect-ring"
        aria-hidden
        style={{ ["--left" as string]: seconds ? left / seconds : 0 } as React.CSSProperties}
      />
      <span>{copy.redirecting(Math.max(0, left))}</span>
      <button type="button" className="fx-link-button" onClick={() => setCancelled(true)}>
        {copy.cancel}
      </button>
    </div>
  );
}

export function EndingStage({
  ending,
  score,
  onAnother,
  celebration,
}: {
  ending: FormEnding;
  score: number | null;
  onAnother: () => void;
  celebration: FormCelebration;
}) {
  const { document, pipe, copy, mode } = useFormController();
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useStageEntrance(rootRef, document.design.motion.speed, ending.id);
  useEffect(() => {
    if (focusAllowed(mode)) titleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [ending.id, mode]);

  const max = document.settings.scoring.maxScore ?? maxScore(document);
  const showScore = ending.showScore && score !== null;
  const external = ending.buttonUrl ? /^https?:\/\//i.test(ending.buttonUrl) : false;

  return (
    <section ref={rootRef} className="fx-ending" aria-labelledby="fx-ending-title">
      <Celebration kind={celebration} play />
      <div className="fx-ending-content">
        <p className="fx-eyebrow" data-stage-item="">
          {document.title}
        </p>
        <SplitText
          text={pipe(ending.title) || copy.thanks}
          as="h1"
          id="fx-ending-title"
          className="fx-display fx-ending-title"
          speed={document.design.motion.speed}
          delay={0.35}
          tabIndex={-1}
          headingRef={titleRef}
        />
        {ending.body ? (
          <div data-stage-item="">
            <RichText doc={ending.body} transform={pipe} className="fx-ending-body" />
          </div>
        ) : null}
        {showScore ? <ScoreCounter score={score} max={max} /> : null}
        {ending.media ? (
          <div data-stage-item="">
            <FormMediaView media={ending.media} className="fx-ending-media" />
          </div>
        ) : null}
        <div className="fx-ending-actions" data-stage-item="">
          {ending.buttonUrl ? (
            <a
              className="fx-button"
              data-variant="primary"
              href={ending.buttonUrl}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {ending.buttonLabel || copy.thanks}
              <ArrowUpRight aria-hidden strokeWidth={2.25} size={18} />
            </a>
          ) : null}
          {ending.allowAnother ? (
            <button type="button" className="fx-button" data-variant="ghost" onClick={onAnother}>
              <RotateCcw aria-hidden strokeWidth={2.25} size={18} />
              {copy.another}
            </button>
          ) : null}
        </div>
        {ending.redirectUrl ? (
          <Redirect url={ending.redirectUrl} seconds={ending.redirectDelaySeconds ?? 5} />
        ) : null}
        {ending.showShare ? <ShareRow /> : null}
      </div>
    </section>
  );
}
