import { isScrollLocked, onScrollLockChange } from "@/lib/scroll-lock";

/**
 * What the visitor asked the page to do, for the story's auto-advance: the
 * reel's arming rules (gotcha #31, `reel/reel-controller.ts`), as a module
 * the story owns.
 *
 * - Armed only by real input: a wheel (not a pinch, `ctrlKey`), a key that
 *   scrolls (arrows, Page Up and Down, Home and End, Space off a button or
 *   link), a touch drag, or a drag on the classic scrollbar (a mouse press
 *   at `clientX >= clientWidth`). Escape and lone modifiers are neutral;
 *   any other key (Tab) stands it down, and so does keyboard focus.
 * - A scroll nobody asked for (a script, `scrollIntoView`, an anchor, an
 *   e2e spec) disarms it once 600 ms have passed since the last real input.
 *   Scroll events within 400 ms of a scroll lock change are ignored.
 * - `held`: a pointer or a finger is down (press and hold freezes the
 *   story and pauses auto-advance).
 */

const NEUTRAL_KEYS = new Set(["Escape", "Shift", "Control", "Alt", "Meta", "CapsLock"]);
const KEY_DIRECTION = new Map<string, 1 | -1>([
  ["ArrowDown", 1],
  ["PageDown", 1],
  ["End", 1],
  ["ArrowUp", -1],
  ["PageUp", -1],
  ["Home", -1],
]);
const DISARM_AFTER_MS = 600;
const LOCK_GRACE_MS = 400;

function isHtmlEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    /*safe*/ target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export class ScrollIntent {
  /** Auto-advance may run (real input asked for movement). */
  armed = false;
  /** The last input direction: 1 down the page, -1 up. */
  direction: 1 | -1 = 1;
  /** A pointer or finger is down. */
  held = false;
  /** A finger is on the screen. */
  touching = false;
  /** Input arrived since the last `consume()`. */
  private inputFlag = false;
  private lastInputAt = 0;
  private lastTouchEndAt = 0;
  private lastScrollAt = 0;
  private lockChangedAt = 0;
  private scrollbarDrag = false;
  private lastNativeY = 0;
  private lastTouchY = 0;
  private writtenY = Number.NaN;
  private readonly offs: Array<() => void> = [];

  attach() {
    this.detach();
    this.lastNativeY = window.scrollY;
    const listen = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
      passive = true,
    ) => {
      window.addEventListener(type, handler, { passive });
      this.offs.push(() => {
        window.removeEventListener(type, handler);
      });
    };
    listen("wheel", (event) => {
      if (event.ctrlKey || !event.deltaY) return;
      this.arm(event.deltaY > 0 ? 1 : -1);
    });
    listen("keydown", (event) => {
      this.onKey(event);
    });
    listen("touchstart", (event) => {
      this.touching = true;
      this.held = true;
      this.lastTouchY = event.touches.item(0)?.clientY ?? 0;
      this.mark();
    });
    listen("touchmove", (event) => {
      const y = event.touches.item(0)?.clientY ?? this.lastTouchY;
      const dy = this.lastTouchY - y;
      this.lastTouchY = y;
      if (Math.abs(dy) > 0.5) this.arm(dy > 0 ? 1 : -1);
      else this.mark();
    });
    const touchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      this.touching = false;
      this.held = false;
      this.lastTouchEndAt = performance.now();
      this.mark();
    };
    listen("touchend", touchEnd);
    listen("touchcancel", touchEnd);
    listen("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.clientX >= document.documentElement.clientWidth) {
        this.scrollbarDrag = true;
        this.mark();
        return;
      }
      if (event.pointerType !== "touch") this.held = true;
    });
    const pointerUp = () => {
      if (this.scrollbarDrag) {
        this.scrollbarDrag = false;
        this.mark();
      }
      if (!this.touching) this.held = false;
    };
    listen("pointerup", pointerUp);
    listen("pointercancel", pointerUp);
    listen("blur", () => {
      this.held = false;
      this.touching = false;
      this.scrollbarDrag = false;
    });
    listen("scroll", () => {
      this.onScroll();
    });
    const handleHtmlFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches(":focus-visible")) {
        // Focus scrolls the page to the control; never carry that scroll on.
        this.armed = false;
        this.mark();
      }
    };
    document.addEventListener("focusin", /*safe*/ handleHtmlFocusIn);
    this.offs.push(
      () => {
        document.removeEventListener("focusin", /*safe*/ handleHtmlFocusIn);
      },
      onScrollLockChange(() => {
        this.lockChangedAt = performance.now();
      }),
    );
  }

  detach() {
    for (const off of this.offs.splice(0)) off();
    this.armed = false;
    this.held = false;
    this.touching = false;
    this.scrollbarDrag = false;
  }

  /** Input since the last call (and resets the flag). */
  consume() {
    const had = this.inputFlag || this.touching || this.scrollbarDrag;
    this.inputFlag = false;
    return had;
  }

  /** Milliseconds since native scroll events last fired. */
  sinceScroll(now = performance.now()) {
    return now - this.lastScrollAt;
  }

  /** Milliseconds since the last touch ended (momentum may still be running). */
  sinceTouchEnd(now = performance.now()) {
    return now - this.lastTouchEndAt;
  }

  /** Real input asked to move in `direction` (the skip button, "watch again"). */
  arm(direction: 1 | -1) {
    this.direction = direction;
    this.armed = true;
    this.mark();
  }

  /** Stands auto-advance down until the next real input. */
  disarm() {
    this.armed = false;
  }

  /** The position auto-advance wrote, so its own scroll events are not mistaken for a script. */
  wrote(y: number) {
    this.writtenY = y;
    this.lastNativeY = y;
  }

  private mark() {
    this.inputFlag = true;
    this.lastInputAt = performance.now();
  }

  private onKey(event: KeyboardEvent) {
    if (isHtmlEditableTarget(event.target) || event.metaKey || event.altKey || event.ctrlKey)
      return;
    if (NEUTRAL_KEYS.has(event.key)) return;
    let direction: 0 | 1 | -1 = KEY_DIRECTION.get(event.key) ?? 0;
    if (event.key === " " || event.key === "Spacebar") {
      const target = event.target;
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
      direction = event.shiftKey ? -1 : 1;
    }
    if (direction) {
      this.arm(direction);
      return;
    }
    // Tab and the like: input with no direction.
    this.armed = false;
    this.mark();
  }

  private onScroll() {
    const now = performance.now();
    this.lastScrollAt = now;
    const y = window.scrollY;
    if (this.scrollbarDrag) {
      const dy = y - this.lastNativeY;
      this.lastNativeY = y;
      if (Math.abs(dy) > 0.5) this.arm(dy > 0 ? 1 : -1);
      else this.mark();
      return;
    }
    this.lastNativeY = y;
    if (isScrollLocked() || now - this.lockChangedAt < LOCK_GRACE_MS) return;
    const ours = Number.isFinite(this.writtenY) && Math.abs(y - this.writtenY) < 1.5;
    if (!ours && now - this.lastInputAt > DISARM_AFTER_MS) this.armed = false;
  }
}
