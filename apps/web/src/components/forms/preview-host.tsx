"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formDocumentSchema, toPublicFormDocument, type PublicFormDocument } from "@repo/shared";

import type { ProjectColorScheme } from "@/lib/project-themes";

import { FormExperience } from "./form-experience";
import type { PreviewStage } from "./form-run";

/**
 * The iframe side of the builder's preview (SPEC section 6): says it is
 * ready, renders every document the builder posts (a half-edited one that
 * doesn't parse keeps the last good render), jumps to the requested stage
 * or field, and reports where the respondent side moves.
 */

const READY = "mgm-form-preview:ready";
const RENDER = "mgm-form-preview:render";
const STAGE = "mgm-form-preview:stage";

type RenderMessage = {
  type: typeof RENDER;
  document: unknown;
  slug?: string;
  scheme?: ProjectColorScheme;
  stage?: PreviewStage;
  endingId?: string;
  focusFieldId?: string;
};

type Shown = {
  document: PublicFormDocument;
  slug: string;
  scheme: ProjectColorScheme;
  stage: PreviewStage;
  endingId?: string;
  focusFieldId?: string;
  nonce: number;
};

function isRender(data: unknown): data is RenderMessage {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === RENDER;
}

/** The embedding editor; null once this frame's browsing context is gone. */
function parentWindow(): Window | null {
  return window.parent;
}

export function FormPreviewHost() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [invalid, setInvalid] = useState(false);
  const nonce = useRef(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isRender(event.data)) return;
      const message = event.data;
      const parsed = formDocumentSchema.safeParse(message.document);
      if (!parsed.success) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      nonce.current += 1;
      setShown({
        document: toPublicFormDocument(parsed.data),
        slug: message.slug || "preview",
        scheme: message.scheme === "dark" ? "dark" : "light",
        stage: message.stage === "form" || message.stage === "ending" ? message.stage : "welcome",
        endingId: message.endingId,
        focusFieldId: message.focusFieldId,
        nonce: nonce.current,
      });
    };
    window.addEventListener("message", onMessage);
    parentWindow()?.postMessage({ type: READY }, window.location.origin);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const onStage = useCallback((stage: PreviewStage, fieldId?: string) => {
    parentWindow()?.postMessage({ type: STAGE, stage, fieldId }, window.location.origin);
  }, []);

  const preview = useMemo(
    () =>
      shown
        ? {
            stage: shown.stage,
            endingId: shown.endingId,
            focusFieldId: shown.focusFieldId,
            nonce: shown.nonce,
            onStage,
          }
        : undefined,
    [shown, onStage],
  );

  if (!shown || !preview) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center p-6 text-sm text-[#6b7280]">
        {invalid ? "The form has an error the preview can't show yet." : "Waiting for the editor"}
      </div>
    );
  }
  return (
    <FormExperience
      key={shown.slug}
      payload={{ state: "open", slug: shown.slug, document: shown.document }}
      mode="preview"
      forced={shown.scheme}
      preview={preview}
    />
  );
}
