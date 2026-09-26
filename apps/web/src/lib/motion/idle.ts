/**
 * "The visitor has stopped doing anything" as a shared signal, for the
 * little waiting moments (a shape that dozes off, a note that says take your
 * time). Any pointer, key, wheel, touch or scroll input counts as activity.
 * One set of listeners serves every subscriber.
 */

type IdleListener = (idle: boolean) => void;

type Subscription = { ms: number; listener: IdleListener; idle: boolean; timer: number };

const subscriptions = new Set<Subscription>();
const EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
let attached = false;

function arm(sub: Subscription) {
  window.clearTimeout(sub.timer);
  sub.timer = window.setTimeout(() => {
    // A hidden tab isn't an idle visitor; wait for it to come back.
    if (document.hidden) {
      arm(sub);
      return;
    }
    sub.idle = true;
    sub.listener(true);
  }, sub.ms);
}

function onActivity() {
  for (const sub of subscriptions) {
    if (sub.idle) {
      sub.idle = false;
      sub.listener(false);
    }
    arm(sub);
  }
}

function attach() {
  if (attached) return;
  attached = true;
  for (const type of EVENTS) window.addEventListener(type, onActivity, { passive: true });
}

function detach() {
  if (!attached) return;
  attached = false;
  for (const type of EVENTS) window.removeEventListener(type, onActivity);
}

/**
 * Calls `listener(true)` once the visitor has done nothing for `ms`, and
 * `listener(false)` on their next input. Returns the unsubscribe.
 */
export function onIdle(ms: number, listener: IdleListener) {
  const sub: Subscription = { ms, listener, idle: false, timer: 0 };
  subscriptions.add(sub);
  attach();
  arm(sub);
  return () => {
    window.clearTimeout(sub.timer);
    subscriptions.delete(sub);
    if (!subscriptions.size) detach();
  };
}
