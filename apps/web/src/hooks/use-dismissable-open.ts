import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

/**
 * Closes an open popover/menu/dropdown when the user clicks outside `ref`'s
 * subtree or presses Escape. Shared by every trigger-and-panel UI in the app
 * (contact info reveals, the calendar-add menu, the CMS listbox) so the
 * dismiss behavior can't drift between them. Takes the raw `setOpen` setter
 * (stable across renders) rather than a callback, so callers don't need to
 * memoize anything to avoid re-subscribing on every render.
 */
export function useDismissableOpen(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!open) return undefined;
    const close = (target: EventTarget | null) => {
      if (target instanceof Node && !ref.current?.contains(target)) setOpen(false);
    };
    const onClick = (event: MouseEvent) => close(event.target);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, setOpen]);
}
