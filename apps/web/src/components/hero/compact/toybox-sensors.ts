/**
 * Tilt and shake for the toy box. Gravity follows the phone's tilt and a
 * shake throws everything up. Browsers that gate these sensors behind a
 * permission get asked twice at most: once quietly when the box starts
 * (Chrome answers without a prompt, and iOS remembers an earlier yes), and
 * once from the first tap on a shape, since iOS only asks from a user
 * gesture (so that call is made straight from the touch handler, never after
 * an await). The answer never blocks anything: without it the box keeps its
 * ordinary gravity.
 */

type PermissionAnswer = "granted" | "denied" | "default";
type WithPermission = { requestPermission?: () => Promise<PermissionAnswer> };

let asked = false;
let probed = false;
let granted = false;
const onGrant = new Set<() => void>();

function gate() {
  if (typeof DeviceOrientationEvent === "undefined") return null;
  const request = (DeviceOrientationEvent as unknown as WithPermission).requestPermission;
  return typeof request === "function" ? request : null;
}

function ask() {
  const orientation = gate();
  if (!orientation) return Promise.resolve<PermissionAnswer>("granted");
  const motion =
    typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as unknown as WithPermission).requestPermission
      : undefined;
  // Both calls start in the same turn; iOS shows one prompt for the two.
  const answers = [orientation.call(DeviceOrientationEvent)];
  if (typeof motion === "function") answers.push(motion.call(DeviceMotionEvent));
  return Promise.all(answers).then(([answer]) => answer);
}

function answered(answer: PermissionAnswer) {
  if (answer !== "granted" || granted) return;
  granted = true;
  for (const listener of [...onGrant]) listener();
}

/** Asks without a gesture; a browser that needs one simply refuses. */
function probe() {
  if (probed || granted) return;
  probed = true;
  ask()
    .then(answered)
    .catch(() => {
      // Needs a gesture (iOS): the first tap on a shape asks instead.
    });
}

/** Call from inside a tap handler. Asks once per page load, silently. */
export function requestMotionAccess() {
  if (asked || granted || !gate()) return;
  asked = true;
  ask()
    .then(answered)
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
    // Past the dead zone the lean is a little exaggerated: a toy box that
    // answers a small tilt feels alive.
    else target = (target - Math.sign(target) * DEAD_ZONE) * 1.5;
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

  if (granted || (typeof DeviceOrientationEvent !== "undefined" && !gate())) listen();
  else {
    onGrant.add(listen);
    probe();
  }

  return () => {
    onGrant.delete(listen);
    if (!listening) return;
    listening = false;
    window.removeEventListener("deviceorientation", onOrientation);
    window.removeEventListener("devicemotion", onMotion);
    if (applied !== 0) onGravity(0, 1);
  };
}
