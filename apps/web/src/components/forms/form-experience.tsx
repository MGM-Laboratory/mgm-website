"use client";

import { useState } from "react";
import { formLabels, type PublicFormPayload } from "@repo/shared";

import type { ProjectColorScheme } from "@/lib/project-themes";

import { FormRun, type PreviewControl } from "./form-run";
import { FormShell } from "./form-shell";
import { LockedGate, UnavailableScreen } from "./status-screens";

/**
 * The public form, whatever state the API reported: the form itself, the
 * passphrase gate (which turns into the form without a reload), or the
 * not-open, closed and full screens.
 */
export function FormExperience({
  payload,
  mode = "live",
  forced,
  preview,
}: {
  payload: PublicFormPayload;
  mode?: "live" | "preview";
  forced?: ProjectColorScheme;
  preview?: PreviewControl;
}) {
  const [current, setCurrent] = useState(payload);

  if (current.state === "open") {
    return (
      <FormRun
        slug={current.slug}
        document={current.document}
        token={current.token}
        mode={mode}
        forced={forced}
        preview={preview}
      />
    );
  }

  const design = current.design;
  return (
    <FormShell slug={current.slug} design={design} forced={forced} stage="status">
      <div className="fx-center">
        {current.state === "locked" ? (
          <LockedGate
            slug={current.slug}
            title={current.title}
            language={current.language}
            onUnlocked={setCurrent}
          />
        ) : (
          <UnavailableScreen
            reason={current.reason}
            title={current.title}
            closedTitle={current.closedTitle}
            closedMessage={current.closedMessage}
            opensAt={current.opensAt}
            language={current.language}
            closedLabel={formLabels(current.language).closed}
          />
        )}
      </div>
    </FormShell>
  );
}
