/**
 * One shared reading of the pointer for every effect that follows it (the
 * cursor distortion, magnetic buttons, the hero's proximity reactions). A
 * single set of window listeners serves every subscriber, so ten effects
 * following the cursor cost one pointermove handler, not ten.
 *
 * Coordinates are viewport (client) pixels. Velocity is in pixels per
 * second, smoothed over the last few events so a single jittery event
 * doesn't read as a flick.
 */

export type PointerState = {
  /** Viewport x in CSS pixels. */
  x: number;
  /** Viewport y in CSS pixels. */
  y: number;
  /** Smoothed velocity, px/s. */
  vx: number;
  vy: number;
  /** Smoothed speed, px/s. */
  speed: number;
  /** A button or finger is down. */
  down: boolean;
  /** The last input's pointer type ("mouse", "pen", "touch"), "" before any. */
  type: string;
  /** performance.now() of the last move, 0 before any. */
  lastMove: number;
  /** Whether the pointer is over the page (a mouse left the window: false). */
  inside: boolean;
};

type Listener = (state: Readonly<PointerState>, event: PointerEvent | null) => void;

const state: PointerState = {
  x: -1,
  y: -1,
  vx: 0,
  vy: 0,
  speed: 0,
  down: false,
  type: "",
  lastMove: 0,
  inside: false,
};

// What pointer() hands out: the raw state with the idle decay applied, so
// reading it any number of times a frame never compounds the decay.
const view: PointerState = { ...state };

const listeners = new Set<Listener>();
let attached = false;

function emit(event: PointerEvent | null) {
  for (const listener of [...listeners]) listener(state, event);
}

function onMove(event: PointerEvent) {
  const now = event.timeStamp || performance.now();
  if (state.lastMove > 0 && state.x >= 0) {
    // A move after a pause starts from rest, not from the speed it had
    // before the pause.
    if (now - state.lastMove > 120) {
      state.vx = 0;
      state.vy = 0;
    }
    const dt = Math.max(1, now - state.lastMove) / 1000;
    const k = 0.35;
    state.vx += ((event.clientX - state.x) / dt - state.vx) * k;
    state.vy += ((event.clientY - state.y) / dt - state.vy) * k;
    state.speed = Math.hypot(state.vx, state.vy);
  }
  state.x = event.clientX;
  state.y = event.clientY;
  state.type = event.pointerType;
  state.lastMove = now;
  state.inside = true;
  emit(event);
}

function onDown(event: PointerEvent) {
  state.down = true;
  state.type = event.pointerType;
  state.x = event.clientX;
  state.y = event.clientY;
  state.inside = true;
  emit(event);
}

function onUp(event: PointerEvent) {
  state.down = false;
  emit(event);
}

function onLeave() {
  state.inside = false;
  state.vx = 0;
  state.vy = 0;
  state.speed = 0;
  emit(null);
}

function attach() {
  if (attached) return;
  attached = true;
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onUp, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
}

function detach() {
  if (!attached) return;
  attached = false;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerdown", onDown);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", onUp);
  document.documentElement.removeEventListener("pointerleave", onLeave);
}

/**
 * The live pointer state. Read it every frame; don't keep a copy. The
 * velocity decays toward zero once moves stop arriving, so a cursor that
 * has come to rest reads as still, not as moving at its last speed forever.
 */
export function pointer(): Readonly<PointerState> {
  Object.assign(view, state);
  if (state.lastMove > 0) {
    const idle = performance.now() - state.lastMove;
    if (idle > 40) {
      const decay = Math.exp(-(idle - 40) / 90);
      view.vx = state.vx * decay;
      view.vy = state.vy * decay;
      view.speed = state.speed * decay;
      if (view.speed < 1) {
        view.vx = 0;
        view.vy = 0;
        view.speed = 0;
      }
    }
  }
  return view;
}

/** Calls `listener` on every pointer move, press, release and leave. */
export function onPointer(listener: Listener) {
  listeners.add(listener);
  attach();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) detach();
  };
}

/** Whether the primary input can hover (a mouse or trackpad). Browser only. */
export function finePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
