import { addFrameCallback } from "@/components/projects/stage/frame-loop";

/**
 * The library's cursor: a thin ring that follows the pointer with a little
 * lag and stretches along its motion (unseen.co's squash, at most 55 %),
 * shrinks to a dot over links and buttons, opens into a soft halo over an
 * article card, and presses in when the button goes down.
 *
 * It is an addition, never a replacement: the native cursor stays (a
 * pointer over links, a caret in the search), the ring is aria-hidden and
 * lets every event through. Only for a fine pointer with motion allowed
 * (world-host.tsx decides). Colours come from CSS (world.css): the world's
 * ink on the list, the article theme's text and highlight on an article.
 *
 * The outer element carries the position and the stretch (written every
 * frame); the inner ring carries the state (CSS transitions), so the two
 * never fight over one transform.
 */

/** unseen's per-frame follow factor, made frame-rate independent. */
const FOLLOW = 0.2;
const STRETCH_PX = 200;
const MAX_STRETCH = 0.55;

type CursorState = "idle" | "link" | "card" | "text";

const LINKS = "a[href], button, [role='button'], summary, label, select";
const TEXT =
  "input:not([type='button']):not([type='submit']):not([type='checkbox']):not([type='radio']), textarea, [contenteditable='true']";

function stateFor(target: EventTarget | null): CursorState {
  if (!(target instanceof Element)) return "idle";
  if (target.closest("[data-article-card]")) return "card";
  if (target.closest(TEXT)) return "text";
  if (target.closest(LINKS)) return "link";
  return "idle";
}

export function mountWorldCursor() {
  const root = document.createElement("div");
  root.className = "world-cursor";
  root.setAttribute("aria-hidden", "true");
  const ring = document.createElement("div");
  ring.className = "world-cursor-ring";
  root.appendChild(ring);
  document.body.appendChild(root);

  const target = { x: 0, y: 0 };
  const position = { x: 0, y: 0 };
  let visible = false;
  let state: CursorState = "idle";

  const show = (on: boolean) => {
    if (visible === on) return;
    visible = on;
    root.dataset.visible = on ? "true" : "false";
  };
  const setState = (next: CursorState) => {
    if (state === next) return;
    state = next;
    root.dataset.state = next;
  };
  root.dataset.state = state;
  root.dataset.visible = "false";

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      show(false);
      return;
    }
    target.x = event.clientX;
    target.y = event.clientY;
    if (!visible) {
      position.x = target.x;
      position.y = target.y;
      show(true);
    }
    setState(stateFor(event.target));
  };
  const onOut = (event: MouseEvent) => {
    if (!event.relatedTarget) show(false);
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") root.dataset.pressed = "true";
  };
  const onUp = () => {
    delete root.dataset.pressed;
  };
  // Scrolling slides a different element under a resting pointer.
  const onScroll = () => {
    if (!visible) return;
    setState(stateFor(document.elementFromPoint(target.x, target.y)));
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onUp, { passive: true });
  window.addEventListener("blur", onUp);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("mouseout", onOut);

  let written = "";
  const offFrame = addFrameCallback("render", (_time, dt) => {
    if (!visible) return;
    const k = 1 - (1 - FOLLOW) ** (dt * 60);
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    position.x += dx * k;
    position.y += dy * k;
    const lag = Math.hypot(dx, dy);
    const s = Math.min(lag / STRETCH_PX, MAX_STRETCH);
    const angle = lag > 0.5 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;
    const next = `translate3d(${position.x.toFixed(1)}px, ${position.y.toFixed(1)}px, 0) rotate(${angle.toFixed(1)}deg) scale(${(1 + s).toFixed(3)}, ${(1 - s).toFixed(3)})`;
    // At rest nothing changes: no style write, no recalc.
    if (next === written) return;
    written = next;
    root.style.transform = next;
  });

  return () => {
    offFrame();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("blur", onUp);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("mouseout", onOut);
    root.remove();
  };
}
