"use client";

/**
 * The builder's live preview: an iframe of `/admin/forms/preview` (owned by
 * the public experience) driven over postMessage (SPEC section 6). The
 * parent sends the last valid document on every `ready` and on every
 * change (debounced), and hears back which stage the respondent side is on.
 */

import {
  ArrowClockwise,
  Desktop,
  DeviceMobile,
  DeviceTablet,
  Moon,
  Sun,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { FormDocument, FormEnding } from "@repo/shared";

import type { PreviewDevice, PreviewStage } from "./types";
import { Segmented, Switch, iconButtonClass, secondaryButtonClass, useFocusTrap } from "./ui";

export const PREVIEW_PATH = "/admin/forms/preview";
const READY_TIMEOUT_MS = 8000;
const SEND_DEBOUNCE_MS = 150;

export const DEVICE_SIZES: Record<PreviewDevice, { width: number; height: number; label: string }> =
  {
    phone: { width: 390, height: 844, label: "Phone" },
    tablet: { width: 820, height: 1180, label: "Tablet" },
    desktop: { width: 1280, height: 800, label: "Desktop" },
  };

export type PreviewFrameProps = {
  /** The last valid parsed document (undefined keeps showing the last one sent). */
  document: FormDocument | undefined;
  slug: string;
  scheme: "light" | "dark";
  stage: PreviewStage;
  endingId?: string;
  focusFieldId?: string;
  device: PreviewDevice;
  onStage?: (stage: PreviewStage, fieldId?: string) => void;
  className?: string;
};

type LoadState = "loading" | "ready" | "unavailable";

function Skeleton() {
  return (
    <div aria-hidden="true" className="absolute inset-0 flex flex-col gap-4 p-[8%]">
      <div className="builder-skeleton h-3 w-1/4 rounded-full" />
      <div className="builder-skeleton h-7 w-3/4 rounded-lg" />
      <div className="builder-skeleton h-3 w-2/3 rounded-full" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((index) => (
          <div className="space-y-2" key={index}>
            <div className="builder-skeleton h-3 w-1/2 rounded-full" />
            <div className="builder-skeleton h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
      <div className="builder-skeleton mt-auto h-10 w-32 rounded-full" />
    </div>
  );
}

export function PreviewFrame({
  className = "",
  device,
  document,
  endingId,
  focusFieldId,
  onStage,
  scheme,
  slug,
  stage,
}: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string>();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [shown, setShown] = useState<FormDocument | undefined>(document);
  const message = useRef<Record<string, unknown> | null>(null);
  const onStageRef = useRef(onStage);
  useLayoutEffect(() => {
    onStageRef.current = onStage;
  });

  // Keep showing the last valid document while the current one has errors.
  if (document && document !== shown) setShown(document);

  const post = useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target || !message.current) return;
    target.postMessage(message.current, window.location.origin);
  }, []);

  // The listener goes on before the src is set, so a fast `ready` is never missed.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; stage?: PreviewStage; fieldId?: string } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "mgm-form-preview:ready") {
        setState("ready");
        post();
      } else if (data.type === "mgm-form-preview:stage" && data.stage) {
        onStageRef.current?.(data.stage, data.fieldId);
      }
    };
    window.addEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(`${PREVIEW_PATH}?attempt=${attempt}`);
    setState("loading");
    const timer = window.setTimeout(() => {
      setState((current) => (current === "ready" ? current : "unavailable"));
    }, READY_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [attempt, post]);

  useEffect(() => {
    if (!shown) return;
    message.current = {
      type: "mgm-form-preview:render",
      document: shown,
      slug,
      scheme,
      stage,
      endingId,
      focusFieldId,
    };
    if (state !== "ready") return;
    const timer = window.setTimeout(post, SEND_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [endingId, focusFieldId, post, scheme, shown, slug, stage, state]);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width, height });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const size = DEVICE_SIZES[device];
  const bezel = device === "desktop" ? 0 : device === "phone" ? 12 : 14;
  const bar = device === "desktop" ? 28 : 0;
  const availableWidth = Math.max(0, box.width - bezel * 2);
  const availableHeight = Math.max(0, box.height - bezel * 2 - bar);
  // Fit the width, and let the virtual viewport grow or shrink in height so
  // the frame fills the container at that scale.
  const scale = availableWidth ? Math.min(1, availableWidth / size.width) : 0;
  const minHeight = device === "desktop" ? 560 : 640;
  const virtualHeight = scale
    ? Math.max(minHeight, Math.round(availableHeight / scale))
    : size.height;
  const fitScale =
    scale && virtualHeight * scale > availableHeight && availableHeight
      ? availableHeight / virtualHeight
      : scale;
  const outerWidth = size.width * fitScale + bezel * 2;
  const outerHeight = virtualHeight * fitScale + bezel * 2 + bar;
  const statusText =
    state === "ready"
      ? "Preview ready"
      : state === "unavailable"
        ? "The preview is not available"
        : "Loading the preview";

  return (
    <div className={`relative min-h-0 min-w-0 ${className}`} ref={boxRef}>
      <p aria-live="polite" className="sr-only" role="status">
        {statusText}
      </p>
      {fitScale ? (
        <div
          className={`absolute top-0 left-1/2 overflow-hidden -translate-x-1/2 ${device === "desktop" ? "rounded-xl border border-[#d9dfeb] bg-white shadow-[0_24px_60px_-36px_rgba(20,32,58,0.6)] dark:border-white/10 dark:bg-[#0f1117]" : "rounded-[2.2rem] bg-[#171b25] shadow-[0_30px_70px_-40px_rgba(20,32,58,0.8)] ring-1 ring-black/10 dark:bg-black dark:ring-white/10"}`}
          style={{ width: outerWidth, height: outerHeight, padding: bezel }}
        >
          {device === "desktop" ? (
            <div
              aria-hidden="true"
              className="flex items-center gap-1.5 border-b border-[#e3e7f0] px-3 dark:border-white/10"
              style={{ height: bar }}
            >
              <span className="size-2.5 rounded-full bg-[#d5dbe7] dark:bg-white/15" />
              <span className="size-2.5 rounded-full bg-[#d5dbe7] dark:bg-white/15" />
              <span className="size-2.5 rounded-full bg-[#d5dbe7] dark:bg-white/15" />
              <span className="mx-auto truncate font-mono text-[10px] text-[#8490a5] dark:text-white/35">
                /forms/{slug}
              </span>
            </div>
          ) : null}
          <div
            className={`relative overflow-hidden bg-[#f5f7fb] dark:bg-[#131720] ${device === "desktop" ? "" : "rounded-[1.6rem]"}`}
            style={{ width: size.width * fitScale, height: virtualHeight * fitScale }}
          >
            {src ? (
              <iframe
                className={`absolute top-0 left-0 origin-top-left border-0 transition-opacity duration-300 ${state === "ready" ? "opacity-100" : "pointer-events-none opacity-0"}`}
                key={attempt}
                ref={frameRef}
                src={src}
                style={{
                  width: size.width,
                  height: virtualHeight,
                  transform: `scale(${fitScale})`,
                }}
                tabIndex={state === "ready" ? 0 : -1}
                title="Form preview"
              />
            ) : null}
            {state === "loading" ? <Skeleton /> : null}
            {state === "unavailable" ? (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div className="max-w-xs">
                  <p className="font-display text-base font-semibold tracking-[-0.02em] text-[#171b25] dark:text-white">
                    The preview isn&rsquo;t available yet
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[#69748a] dark:text-white/50">
                    The preview page didn&rsquo;t answer. Your edits are still saved; try again in a
                    moment.
                  </p>
                  <button
                    className={`${secondaryButtonClass} mt-4 h-9`}
                    onClick={() => {
                      setAttempt((current) => current + 1);
                    }}
                    type="button"
                  >
                    <ArrowClockwise size={15} weight="bold" />
                    Retry
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PreviewToolbar({
  device,
  endingId,
  endings,
  follow,
  onDevice,
  onFollow,
  onScheme,
  onStage,
  scheme,
  stage,
}: {
  device: PreviewDevice;
  onDevice: (device: PreviewDevice) => void;
  scheme: "light" | "dark";
  onScheme: (scheme: "light" | "dark") => void;
  stage: PreviewStage;
  endingId?: string;
  onStage: (stage: PreviewStage, endingId?: string) => void;
  endings: FormEnding[];
  follow?: boolean;
  onFollow?: (value: boolean) => void;
}) {
  const stageValue = stage === "ending" ? `ending:${endingId ?? endings[0]?.id ?? ""}` : stage;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<PreviewDevice>
        label="Preview device"
        onChange={onDevice}
        options={[
          {
            value: "phone",
            label: <DeviceMobile aria-label="Phone" size={16} />,
            title: "Phone (390 px)",
          },
          {
            value: "tablet",
            label: <DeviceTablet aria-label="Tablet" size={16} />,
            title: "Tablet (820 px)",
          },
          {
            value: "desktop",
            label: <Desktop aria-label="Desktop" size={16} />,
            title: "Desktop (1280 px)",
          },
        ]}
        size="sm"
        value={device}
      />
      <Segmented<"light" | "dark">
        label="Preview colour scheme"
        onChange={onScheme}
        options={[
          { value: "light", label: <Sun aria-label="Light" size={15} />, title: "Light" },
          { value: "dark", label: <Moon aria-label="Dark" size={15} />, title: "Dark" },
        ]}
        size="sm"
        value={scheme}
      />
      <label className="sr-only" htmlFor="preview-stage">
        Preview stage
      </label>
      <select
        className="h-8 min-w-0 max-w-[12rem] rounded-lg border border-[#d9dfeb] bg-white px-2 text-xs font-semibold text-[#3c4659] outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white/80"
        id="preview-stage"
        onChange={(event) => {
          const value = event.target.value;
          if (value.startsWith("ending:")) onStage("ending", value.slice(7));
          else onStage(value as PreviewStage);
        }}
        value={stageValue}
      >
        <option value="welcome">Welcome</option>
        <option value="form">Form</option>
        {endings.map((ending, index) => (
          <option key={ending.id} value={`ending:${ending.id}`}>
            Ending {index + 1}: {ending.title || "Untitled"}
          </option>
        ))}
      </select>
      {onFollow ? (
        <div className="ml-auto min-w-40">
          <Switch
            checked={Boolean(follow)}
            label="Follow selection"
            onChange={onFollow}
            size="sm"
          />
        </div>
      ) : null}
    </div>
  );
}

/** A full-screen preview over the builder. */
export function PreviewOverlay({
  document,
  focusFieldId,
  onClose,
  slug,
}: {
  document: FormDocument | undefined;
  slug: string;
  onClose: () => void;
  focusFieldId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  const [device, setDevice] = useState<PreviewDevice>(() =>
    typeof window !== "undefined" && window.innerWidth < 900 ? "phone" : "desktop",
  );
  const [scheme, setScheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const [stage, setStage] = useState<{ stage: PreviewStage; endingId?: string }>({
    stage: focusFieldId ? "form" : "welcome",
  });

  useEffect(() => {
    const previous = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => {
      window.document.body.style.overflow = previous;
    };
  }, []);

  if (typeof window === "undefined") return null;
  return createPortal(
    <div
      aria-label="Form preview"
      aria-modal="true"
      className="builder-fade-in fixed inset-0 z-[85] flex flex-col bg-[#eef1f6] dark:bg-[#0b0e14]"
      data-builder-dialog=""
      ref={ref}
      role="dialog"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#dfe4ee] bg-white/80 px-4 py-2.5 backdrop-blur dark:border-white/10 dark:bg-[#131720]/80">
        <p className="font-display text-base font-semibold tracking-[-0.02em]">Preview</p>
        <div className="min-w-0 flex-1">
          <PreviewToolbar
            device={device}
            endingId={stage.endingId}
            endings={document?.endings ?? []}
            onDevice={setDevice}
            onScheme={setScheme}
            onStage={(next, endingId) => {
              setStage({ stage: next, endingId });
            }}
            scheme={scheme}
            stage={stage.stage}
          />
        </div>
        <button
          aria-label="Close preview"
          className={iconButtonClass}
          onClick={onClose}
          type="button"
        >
          <X size={18} weight="bold" />
        </button>
      </div>
      <PreviewFrame
        className="m-4 flex-1 sm:m-6"
        device={device}
        document={document}
        endingId={stage.endingId}
        focusFieldId={focusFieldId}
        onStage={(next) => {
          setStage((current) => ({ ...current, stage: next }));
        }}
        scheme={scheme}
        slug={slug}
        stage={stage.stage}
      />
    </div>,
    window.document.body,
  );
}
