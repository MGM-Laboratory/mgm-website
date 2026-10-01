import {
  Raycaster,
  Vector2,
  type Intersection,
  type Object3D,
  type PerspectiveCamera,
} from "three";

import type { StoryPointer, StoryPointerEvent, StoryRect } from "@/components/story/engine/act";

/**
 * The pointer over the story canvas: NDC and px relative to the canvas as
 * it sits this frame, a smoothed velocity, the pressed state, raycasts from
 * the stage camera, and events routed to the active act. The canvas itself
 * never takes pointer events (`pointer-events: none`), so this listens on
 * the window and decides what counts as "inside": over the story section,
 * not over the header, the overlay or an interactive DOM control. The
 * overlay's hotspots are the exception: they sit over GL objects, so the
 * pointer over one is inside (hover and raycasts keep working on the object
 * under it), but a press there belongs to the hotspot's own link or button
 * and is not routed to the act.
 *
 * Taps follow gotcha #29: a mouse or pen taps on `pointerdown`, a finger on
 * a `pointerup` that moved under 12 px and was never cancelled.
 */

const TAP_SLOP_PX = 12;
const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [role='button'], [contenteditable='true']";
/** The overlay's DOM controls over GL objects. */
const HOTSPOT = "[data-story-overlay] .story-hotspot";

type PointerKind = "mouse" | "pen" | "touch";

function kindOf(event: PointerEvent): PointerKind {
  return event.pointerType === "touch" ? "touch" : event.pointerType === "pen" ? "pen" : "mouse";
}

export class StoryPointerImpl implements StoryPointer {
  readonly ndc = { x: 0, y: 0 };
  readonly px = { x: 0, y: 0 };
  readonly velocity = { x: 0, y: 0 };
  down = false;
  inside = false;
  type: StoryPointer["type"] = "none";
  private readonly raycaster = new Raycaster();
  private readonly ray = new Vector2();
  private client = { x: -1, y: -1, valid: false };
  private lastMoveAt = 0;
  private press: { id: number; x: number; y: number; cancelled: boolean } | null = null;
  private overTarget = false;
  /** Over one of the overlay's hotspots: inside, but presses are the hotspot's. */
  private overHotspot = false;
  private section: HTMLElement | null = null;
  private cursor: string | null = null;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly canvasRect: () => StoryRect,
    private readonly emit: (event: StoryPointerEvent) => void,
  ) {}

  attach(section: HTMLElement) {
    this.detach();
    this.section = section;
    const listen = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
    ) => {
      window.addEventListener(type, handler, { passive: true });
      this.offs.push(() => {
        window.removeEventListener(type, handler);
      });
    };
    listen("pointermove", (event) => {
      this.onMove(event);
    });
    listen("pointerdown", (event) => {
      this.onDown(event);
    });
    listen("pointerup", (event) => {
      this.onUp(event);
    });
    listen("pointercancel", (event) => {
      this.onCancel(event);
    });
    listen("blur", () => {
      this.release();
    });
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      this.client.valid = false;
      this.refresh();
      this.emitAt("leave", this.type === "none" ? "mouse" : this.type);
    };
    document.documentElement.addEventListener("pointerleave", leave);
    this.offs.push(() => {
      document.documentElement.removeEventListener("pointerleave", leave);
    });
  }

  detach() {
    for (const off of this.offs.splice(0)) off();
    this.setCursor(null);
    this.release();
    this.section = null;
  }

  /** Recomputes NDC and px from the last client position against the canvas as it sits now. */
  refresh() {
    const rect = this.canvasRect();
    if (!this.client.valid || rect.width <= 0 || rect.height <= 0) {
      this.inside = false;
      return;
    }
    this.px.x = this.client.x - rect.x;
    this.px.y = this.client.y - rect.y;
    this.ndc.x = (this.px.x / rect.width) * 2 - 1;
    this.ndc.y = 1 - (this.px.y / rect.height) * 2;
    const within =
      this.px.x >= 0 && this.px.y >= 0 && this.px.x <= rect.width && this.px.y <= rect.height;
    this.inside = within && this.overTarget;
  }

  /** Once a frame: velocity decays when the pointer rests. */
  tick(dt: number) {
    if (performance.now() - this.lastMoveAt > 40) {
      const k = Math.exp(-12 * dt);
      this.velocity.x *= k;
      this.velocity.y *= k;
    }
    this.refresh();
    this.applyCursor();
  }

  raycast(objects: readonly Object3D[], recursive = true): Intersection[] {
    if (!this.inside || objects.length === 0) return [];
    this.ray.set(this.ndc.x, this.ndc.y);
    this.raycaster.setFromCamera(this.ray, this.camera);
    return this.raycaster.intersectObjects(objects as Object3D[], recursive);
  }

  setCursor(cursor: string | null) {
    this.cursor = cursor;
    this.applyCursor();
  }

  private applyCursor() {
    const section = this.section;
    if (!section) return;
    const next = this.inside && this.cursor ? this.cursor : "";
    if (section.style.cursor !== next) section.style.cursor = next;
  }

  /** Whether the event lands on the story itself (not the header, an overlay control or a link). */
  private targets(event: PointerEvent) {
    const section = this.section;
    const target = event.target;
    this.overHotspot = false;
    if (!section || !(target instanceof Element)) return false;
    if (target.closest(HOTSPOT)) {
      this.overHotspot = true;
      return true;
    }
    if (!section.contains(target)) return false;
    return target.closest(INTERACTIVE) === null;
  }

  private track(event: PointerEvent) {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveAt) / 1000;
    if (this.client.valid && now - this.lastMoveAt < 100) {
      const k = 0.35;
      this.velocity.x += ((event.clientX - this.client.x) / dt - this.velocity.x) * k;
      this.velocity.y += ((event.clientY - this.client.y) / dt - this.velocity.y) * k;
    }
    this.lastMoveAt = now;
    this.client = { x: event.clientX, y: event.clientY, valid: true };
    this.type = kindOf(event);
    this.overTarget = this.targets(event);
    this.refresh();
  }

  private onMove(event: PointerEvent) {
    this.track(event);
    const press = this.press;
    if (press && press.id === event.pointerId) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (moved > TAP_SLOP_PX) press.cancelled = true;
    }
    if (this.inside) this.emitAt("move", kindOf(event));
  }

  private onDown(event: PointerEvent) {
    this.track(event);
    this.down = true;
    const kind = kindOf(event);
    this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false };
    if (!this.inside || this.overHotspot) return;
    this.emitAt("down", kind);
    if (kind !== "touch") this.emitAt("tap", kind);
  }

  private onUp(event: PointerEvent) {
    this.track(event);
    this.down = false;
    const kind = kindOf(event);
    const press = this.press;
    this.press = null;
    if (!this.inside || this.overHotspot) return;
    this.emitAt("up", kind);
    if (kind === "touch" && press && press.id === event.pointerId && !press.cancelled) {
      this.emitAt("tap", kind);
    }
  }

  private onCancel(event: PointerEvent) {
    if (this.press && this.press.id === event.pointerId) this.press.cancelled = true;
    this.release();
  }

  private release() {
    this.down = false;
    this.press = null;
  }

  private emitAt(type: StoryPointerEvent["type"], pointerType: PointerKind) {
    this.emit({
      type,
      pointerType,
      ndc: { x: this.ndc.x, y: this.ndc.y },
      px: { x: this.px.x, y: this.px.y },
      raycast: (objects, recursive) => this.raycast(objects, recursive),
    });
  }
}
