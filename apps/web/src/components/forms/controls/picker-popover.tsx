"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

/**
 * The floating panel of the date and time pickers. On wide screens it is a
 * popover anchored to the field (below it, or above when there's no room,
 * always inside the viewport, following scroll and resize). Under 640px it
 * is a bottom sheet with a drag handle, a scrim and the page scroll locked.
 * It portals into the form's themed root (or the body in the admin) because
 * the form's blocks carry GSAP transforms, which would trap a fixed
 * element. The panel is `data-popover-for` its field, so the field's blur
 * accounting treats focus inside it as focus inside the field.
 */

const narrowQuery = "(max-width: 639px)";
function subscribeNarrow(callback: () => void) {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener("change", callback);
  return () => {
    query.removeEventListener("change", callback);
  };
}

/** Whether pickers open as a bottom sheet (phones). */
export function useSheet() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";

type Placement = { top: number; left: number; side: "top" | "bottom"; width?: number };

const GAP = 8;
const EDGE = 8;

function place(anchor: HTMLElement, panel: HTMLElement): Placement {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(panel.offsetWidth, viewportWidth - EDGE * 2);
  const height = panel.offsetHeight;
  const below = viewportHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const side = below >= height || below >= above ? "bottom" : "top";
  const top =
    side === "bottom"
      ? rect.bottom + GAP
      : Math.max(EDGE, rect.top - GAP - Math.min(height, Math.max(above, 0)));
  const left = Math.min(Math.max(rect.left, EDGE), viewportWidth - width - EDGE);
  return { top, left, side, width: width < panel.offsetWidth ? width : undefined };
}

export function PickerPopover({
  open,
  anchorRef,
  ownerId,
  dialogId,
  label,
  closeLabel,
  skin,
  kind,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** The field's input id, for `data-popover-for`. */
  ownerId: string;
  dialogId: string;
  label: string;
  closeLabel: string;
  skin: "form" | "admin";
  /** Sizes the panel: a calendar, time columns, or both side by side. */
  kind: "date" | "time" | "datetime";
  /** `returnFocus`: put focus back on the field (Escape, Done, a pick). */
  onClose: (returnFocus: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const sheet = useSheet();
  const panelRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<{ y: number; time: number } | null>(null);
  const dragged = useRef(false);

  // The portal target, found from the field itself (its root exists by now).
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    setHost(anchor?.closest<HTMLElement>(".fx-root") ?? document.body);
  }, [open, anchorRef]);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel || sheet) return;
    const next = place(anchor, panel);
    setPlacement((current) =>
      current &&
      current.top === next.top &&
      current.left === next.left &&
      current.side === next.side &&
      current.width === next.width
        ? current
        : next,
    );
  }, [anchorRef, sheet]);

  useLayoutEffect(() => {
    if (!open || !host) return;
    reposition();
  });

  useEffect(() => {
    if (!open || sheet) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reposition);
    };
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [open, sheet, reposition]);

  // The sheet holds the page still.
  useEffect(() => {
    if (!open || !sheet) return;
    const owner = `picker-${ownerId}`;
    acquireScrollLock(owner);
    return () => {
      releaseScrollLock(owner);
    };
  }, [open, sheet, ownerId]);

  // A press outside the field and the panel closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !host) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (event.key !== "Tab") return;
    // Tab cycles inside the panel, like a dialog.
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
      (item) => item.offsetParent !== null,
    );
    const first = items.at(0);
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { y: event.clientY, time: performance.now() };
    dragged.current = false;
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const distance = event.clientY - start.y;
    if (Math.abs(distance) > 4) dragged.current = true;
    setDrag(Math.max(0, distance));
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const distance = event.clientY - start.y;
    const speed = distance / Math.max(1, performance.now() - start.time);
    setDrag(0);
    if (dragged.current && (distance > 90 || speed > 0.6)) onClose(true);
  };

  const style = sheet
    ? { translate: drag ? `0 ${drag}px` : undefined, transition: drag ? "none" : undefined }
    : {
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        width: placement?.width,
      };

  return createPortal(
    <>
      {sheet ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={closeLabel}
          className={`pk-scrim pk-skin-${skin}`}
          onClick={() => {
            onClose(true);
          }}
        />
      ) : null}
      <div
        ref={panelRef}
        id={dialogId}
        role="dialog"
        aria-modal={sheet || undefined}
        aria-label={label}
        data-popover-for={ownerId}
        data-side={placement?.side ?? "bottom"}
        data-sheet={sheet ? "" : undefined}
        data-kind={kind}
        className={`pk-pop pk-skin-${skin}`}
        style={style}
        onKeyDown={onKeyDown}
      >
        {sheet ? (
          <button
            type="button"
            className="pk-handle"
            aria-label={closeLabel}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={() => {
              dragStart.current = null;
              setDrag(0);
            }}
            onClick={() => {
              // A drag ends in a click too; only a tap or a key closes here.
              if (!dragged.current) onClose(true);
              dragged.current = false;
            }}
          >
            <span aria-hidden />
          </button>
        ) : null}
        <div className="pk-body">{children}</div>
        {footer ? <div className="pk-foot">{footer}</div> : null}
      </div>
    </>,
    host,
  );
}
