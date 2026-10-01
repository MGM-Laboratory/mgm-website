import { isScrollLocked, onScrollLockChange } from "@/lib/scroll-lock";

/**
 * What the visitor asked the page to do, for the story's auto-advance: the
 * reel's arming rules (gotcha #31, `reel/reel-controller.ts`), as a module
 * the story owns.
 *
 * - Armed only by real input: a wheel (not a pinch, `ctrlKey`), a key that
 *   scrolls (arrows, Page Up and Down, Home and End, Space off a button or
 *   link), a touch drag, or a drag on the classic scrollbar (a mouse press
 *   at `clientX >= clientWidth`). Escape and lone modifiers are neutral,
 *   and so are Enter and Space on a button or a link (that activates the
 *   control: "Watch again" must set off, not count as input); any other
 *   key (Tab) stands it down, and so does keyboard focus.
 * - A scroll nobody asked for (a script, `scrollIntoView`, an anchor, an
 *   e2e spec) disarms it once 600 ms have passed since the last real input.
 *   Scroll events within 400 ms of a scroll lock change are ignored.
 * - `pressed`: a pointer button or a finger is down (pauses auto-advance).
 * - `held`: press and hold (freezes the story's time): a press kept down
 *   for 180 ms, where a finger must also stay within 10 px. A finger that
 *   scrolls the page, or a quick click, is never a hold.
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
/** How long a press must stay down before it is a hold, and how far a finger may drift. */
const HOLD_DELAY_MS = 180;
const HOLD_SLOP_PX = 10;
/** Controls whose Enter and Space activate them rather than scroll the page. */
const CONTROL = "a[href], button, [role='button'], summary";
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
  /** A pointer button or a finger is down. */
  pressed = false;
  /** A finger is on the screen. */
  touching = false;
  private pressAt = 0;
  private pressX = 0;
  private pressY = 0;
  /** The press stopped being a hold (a finger scrolled, a second finger came down). */
  private pressMoved = false;
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
      const touch = event.touches.item(0);
      if (this.touching) {
        // A second finger: a pinch or a two-finger gesture, never a hold.
        this.pressMoved = true;
      } else {
        this.press(touch?.clientX ?? 0, touch?.clientY ?? 0);
      }
      this.touching = true;
      this.lastTouchY = touch?.clientY ?? 0;
      this.mark();
    });
    listen("touchmove", (event) => {
      const touch = event.touches.item(0);
      const y = touch?.clientY ?? this.lastTouchY;
      if (
        touch &&
        Math.hypot(touch.clientX - this.pressX, touch.clientY - this.pressY) > HOLD_SLOP_PX
      ) {
        this.pressMoved = true;
      }
      const dy = this.lastTouchY - y;
      this.lastTouchY = y;
      if (Math.abs(dy) > 0.5) this.arm(dy > 0 ? 1 : -1);
      else this.mark();
    });
    const touchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      this.touching = false;
      this.pressed = false;
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
      if (event.pointerType !== "touch") this.press(event.clientX, event.clientY);
    });
    const pointerUp = () => {
      if (this.scrollbarDrag) {
        this.scrollbarDrag = false;
        this.mark();
      }
      if (!this.touching) this.pressed = false;
    };
    listen("pointerup", pointerUp);
    listen("pointercancel", pointerUp);
    listen("blur", () => {
      this.pressed = false;
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
    this.pressed = false;
    this.touching = false;
    this.scrollbarDrag = false;
  }

  /** Press and hold: down for a moment, and (for a finger) not scrolling. */
  get held() {
    return this.pressed && !this.pressMoved && performance.now() - this.pressAt >= HOLD_DELAY_MS;
  }

  private press(x: number, y: number) {
    this.pressed = true;
    this.pressMoved = false;
    this.pressAt = performance.now();
    this.pressX = x;
    this.pressY = y;
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

  /**
   * Arms toward `direction` for a control the visitor pressed (skip, watch
   * again) without counting as scroll input, so the advance sets off at once.
   */
  launch(direction: 1 | -1) {
    this.direction = direction;
    this.armed = true;
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
    const space = event.key === " " || event.key === "Spacebar";
    if (space || event.key === "Enter") {
      const target = event.target;
      if (target instanceof Element && target.closest(CONTROL)) return;
    }
    let direction: 0 | 1 | -1 = KEY_DIRECTION.get(event.key) ?? 0;
    if (space) direction = event.shiftKey ? -1 : 1;
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
