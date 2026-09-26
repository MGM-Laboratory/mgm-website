"use client";

import type { CSSProperties } from "react";
import type { FormDesign } from "@repo/shared";

import type { FormCopy } from "@/lib/forms/public-copy";
import type { FormProgress } from "@/lib/forms/public-runtime";

import { ShapeSvg } from "./scene/scene-dom";
import { SHAPE_KINDS } from "./scene/vocabulary";

/**
 * The respondent's progress along the visible route only (skipped pages and
 * hidden questions never count): a bar with a travelling disc, a row of
 * shapes that fill as questions are answered, or a plain fraction.
 */
export function FormProgressBar({
  style,
  progress,
  copy,
}: {
  style: Exclude<FormDesign["progress"], "none">;
  progress: FormProgress;
  copy: FormCopy;
}) {
  const { done, total, fraction } = progress;
  const label = copy.answered(done, total);
  if (style === "fraction") {
    return (
      <p className="fx-progress-fraction" aria-label={label}>
        <span aria-hidden>
          <b>{String(done).padStart(2, "0")}</b> / {String(total).padStart(2, "0")}
        </span>
      </p>
    );
  }
  if (style === "steps" && total <= 24) {
    return (
      <div className="fx-progress-steps" role="img" aria-label={label}>
        {progress.questions.map((field, index) => (
          <span
            key={field.id}
            data-done={index < done ? "" : undefined}
            style={{ color: `var(--fx-piece-${index % 5})` } as CSSProperties}
          >
            <ShapeSvg kind={SHAPE_KINDS[index % SHAPE_KINDS.length]} />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div
      className="fx-progress-bar"
      role="progressbar"
      aria-label={copy.progressLabel}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={label}
      style={{ ["--fx-progress" as string]: fraction } as CSSProperties}
    >
      <span className="fx-progress-fill" />
      <span className="fx-progress-knob" />
    </div>
  );
}
