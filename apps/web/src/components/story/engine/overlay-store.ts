import type {
  StoryHotspot,
  StoryHotspotSpec,
  StoryOverlay,
  StoryRect,
} from "@/components/story/engine/act";

/**
 * The state behind the story overlay (`story-overlay.tsx`): the hint, the
 * HUD caption, the skip control and the hotspots. Acts write it every
 * frame through `StoryOverlay`; React re-renders only when a value changes.
 * Hotspot positions skip React: `place()` moves the element directly.
 */

export type OverlaySkip = "skip" | "replay" | null;
export type OverlayTone = "light" | "dark";

export type OverlaySnapshot = Readonly<{
  hint: string | null;
  hud: string | null;
  skip: OverlaySkip;
  /** The ink the overlay text needs: light text over a dark scene. */
  tone: OverlayTone;
  hotspots: readonly StoryHotspotSpec[];
  debug: boolean;
}>;

const EMPTY: OverlaySnapshot = {
  hint: null,
  hud: null,
  skip: null,
  tone: "light",
  hotspots: [],
  debug: false,
};

class Hotspot implements StoryHotspot {
  element: HTMLElement | null = null;
  hovered = false;
  focused = false;
  private shown = false;
  private key = "";

  constructor(
    readonly spec: StoryHotspotSpec,
    private readonly origin: () => { x: number; y: number },
    private readonly drop: (id: string) => void,
  ) {}

  place(rect: StoryRect | null) {
    const element = this.element;
    if (!element) return;
    if (!rect || rect.width < 1 || rect.height < 1) {
      if (this.shown) {
        this.shown = false;
        element.hidden = true;
      }
      return;
    }
    const o = this.origin();
    const key = `${Math.round(rect.x + o.x)},${Math.round(rect.y + o.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
    if (!this.shown) {
      this.shown = true;
      element.hidden = false;
    }
    if (key === this.key) return;
    this.key = key;
    element.style.transform = `translate3d(${rect.x + o.x}px, ${rect.y + o.y}px, 0)`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  }

  dispose() {
    this.drop(this.spec.id);
  }
}

export class StoryOverlayStore implements StoryOverlay {
  private snapshot: OverlaySnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly spots = new Map<string, Hotspot>();
  private pendingHint: string | null = null;
  private pendingHud: string | null = null;
  private originX = 0;
  private originY = 0;
  /** The skip control's action (set by the director). */
  onSkip: (mode: "skip" | "replay") => void = () => {};
  /** Where the dev HUD writes its text (set by the overlay when `?storydebug`). */
  debugElement: HTMLElement | null = null;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;

  readonly getServerSnapshot = () => EMPTY;

  private publish(next: Partial<OverlaySnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  setDebugElement(element: HTMLElement | null) {
    this.debugElement = element;
  }

  setDebug(on: boolean) {
    if (this.snapshot.debug !== on) this.publish({ debug: on });
  }

  /** Every frame before the acts: hint and HUD start empty. */
  beginFrame(originX: number, originY: number) {
    this.pendingHint = null;
    this.pendingHud = null;
    this.originX = originX;
    this.originY = originY;
  }

  setHint(text: string | null) {
    this.pendingHint = text;
  }

  setHud(text: string | null) {
    this.pendingHud = text;
  }

  /** After the acts: publishes what changed. */
  endFrame(skip: OverlaySkip, tone: OverlayTone) {
    const s = this.snapshot;
    if (
      s.hint !== this.pendingHint ||
      s.hud !== this.pendingHud ||
      s.skip !== skip ||
      s.tone !== tone
    ) {
      this.publish({ hint: this.pendingHint, hud: this.pendingHud, skip, tone });
    }
  }

  /** Clears everything (the story left the screen). */
  clear() {
    this.pendingHint = null;
    this.pendingHud = null;
    for (const spot of this.spots.values()) spot.place(null);
    const s = this.snapshot;
    if (s.hint !== null || s.hud !== null || s.skip !== null) {
      this.publish({ hint: null, hud: null, skip: null });
    }
  }

  hotspot(spec: StoryHotspotSpec): StoryHotspot {
    const existing = this.spots.get(spec.id);
    if (existing) return existing;
    const spot = new Hotspot(
      spec,
      () => ({ x: this.originX, y: this.originY }),
      (id) => {
        this.spots.delete(id);
        this.publish({ hotspots: [...this.spots.values()].map((one) => one.spec) });
      },
    );
    this.spots.set(spec.id, spot);
    this.publish({ hotspots: [...this.spots.values()].map((one) => one.spec) });
    return spot;
  }

  /** The overlay registers each hotspot's element (a React ref callback). */
  bindHotspot(id: string, element: HTMLElement | null) {
    const spot = this.spots.get(id);
    if (!spot) return;
    spot.element = element;
    if (element) element.hidden = true;
  }

  hotspotState(id: string, state: { hovered?: boolean; focused?: boolean }) {
    const spot = this.spots.get(id);
    if (!spot) return;
    if (state.hovered !== undefined) spot.hovered = state.hovered;
    if (state.focused !== undefined) spot.focused = state.focused;
  }

  activate(id: string) {
    this.spots.get(id)?.spec.onActivate?.();
  }
}
