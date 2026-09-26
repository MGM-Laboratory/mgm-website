/**
 * Tilt and shake for the toy box. Gravity follows the phone's tilt and a
 * shake throws everything up. iOS asks for permission first, and only from a
 * user gesture, so `requestMotionAccess()` is called straight from the first
 * tap on a shape (inside the touch handler, never after an await). The answer
 * never blocks anything: without it the box keeps its ordinary gravity.
 */

type PermissionRequest = () => Promise<"granted" | "denied">;

type WithPermission = { requestPermission?: PermissionRequest };

let asked = false;
let granted = false;
const onGrant = new Set<() => void>();

function needsPermission() {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  return (
    typeof (DeviceOrientationEvent as unknown as WithPermission).requestPermission === "function"
  );
}

/** Whether tilt events can arrive without asking first (Android, most browsers). */
function openByDefault() {
  return typeof DeviceOrientationEvent !== "undefined" && !needsPermission();
}

/** Call from inside a tap handler. Asks once per page load, silently. */
export function requestMotionAccess() {
  if (asked || !needsPermission()) return;
  asked = true;
  const orientation = (DeviceOrientationEvent as unknown as WithPermission).requestPermission!;
  const motion =
    typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as unknown as WithPermission).requestPermission
      : undefined;
  // Both calls start inside the gesture; iOS shows one prompt for the two.
  const answers = [orientation.call(DeviceOrientationEvent)];
  if (motion) answers.push(motion.call(DeviceMotionEvent));
  Promise.all(answers)
    .then(([answer]) => {
      if (answer !== "granted") return;
      granted = true;
      for (const listener of [...onGrant]) listener();
    })
    .catch(() => {
      // Refused or unsupported: the box simply keeps its usual gravity.
    });
}

function screenAngle() {
  const angle = screen.orientation?.angle;
  if (typeof angle === "number") return angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}

const RAD = Math.PI / 180;
// A phone held at an ordinary reading angle leans a little all the time;
// inside this band gravity stays straight down.
const DEAD_ZONE = 8 * RAD;
const MAX_LEAN = 80 * RAD;
const SHAKE_THRESHOLD = 17; // m/s², with gravity removed
const SHAKE_COOLDOWN_MS = 900;

export type SensorHandlers = {
  /** A unit gravity direction in screen space (x right, y down). */
  onGravity: (x: number, y: number) => void;
  onShake: () => void;
};

/** Starts listening; returns the stop. Safe to call before permission. */
export function watchMotion({ onGravity, onShake }: SensorHandlers) {
  let lean = 0;
  let applied = 0;
  let lastShake = 0;
  let listening = false;

  function onOrientation(event: DeviceOrientationEvent) {
    if (event.beta === null || event.gamma === null) return;
    const beta = event.beta * RAD;
    const gamma = event.gamma * RAD;
    // Gravity in the device's frame (x right, y toward the top, z out of the
    // screen), from the full rotation, so it stays right near upright.
    const dx = Math.sin(gamma) * Math.cos(beta);
    const dy = -Math.sin(beta);
    // Into screen space for portrait (y down), then turned with the screen.
    const px = dx;
    const py = -dy;
    const turn = screenAngle() * RAD;
    const sx = px * Math.cos(turn) + py * Math.sin(turn);
    const sy = -px * Math.sin(turn) + py * Math.cos(turn);
    // Never up: a box held upside down keeps its shapes on the shelves.
    const down = Math.max(sy, 0);
    const inPlane = Math.hypot(sx, down);
    // Lying flat gives no direction in the screen's plane: blend to down.
    const weight = Math.min(1, inPlane / 0.35);
    let target = inPlane > 0.001 ? Math.atan2(sx, down) * weight : 0;
    if (Math.abs(target) < DEAD_ZONE) target = 0;
    else target -= Math.sign(target) * DEAD_ZONE;
    target = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, target));
    lean += (target - lean) * 0.25;
    if (Math.abs(lean - applied) < 1.5 * RAD) return;
    applied = lean;
    onGravity(Math.sin(lean), Math.cos(lean));
  }

  function onMotion(event: DeviceMotionEvent) {
    const a = event.acceleration;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const force = Math.hypot(a.x, a.y, a.z);
    const now = performance.now();
    if (force > SHAKE_THRESHOLD && now - lastShake > SHAKE_COOLDOWN_MS) {
      lastShake = now;
      onShake();
    }
  }

  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("devicemotion", onMotion);
  }

  if (granted || openByDefault()) listen();
  else onGrant.add(listen);

  return () => {
    onGrant.delete(listen);
    if (!listening) return;
    listening = false;
    window.removeEventListener("deviceorientation", onOrientation);
    window.removeEventListener("devicemotion", onMotion);
    if (applied !== 0) onGravity(0, 1);
  };
}
