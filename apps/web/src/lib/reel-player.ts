/**
 * The contract between the homepage reel (the section that plays the
 * company profile video in the page) and the full-screen player that opens
 * from its Play button. The reel asks for the player through
 * `openReelPlayer()`; the player host, mounted once on the page, answers
 * and reports back when it closes so the reel can take over again (resume
 * its muted loop, land the close transition on its frame).
 */

export type ReelPlayerRequest = {
  /** The playable video URL (same-origin, range-seekable). */
  src: string;
  /** Where the in-page video sits right now, for the open transition. */
  originRect?: DOMRect | null;
  /** Where to start, in seconds (the in-page loop's current time, or 0). */
  startTime?: number;
  /** The element to give focus back to on close (the Play button). */
  returnFocus?: HTMLElement | null;
};

export type ReelPlayerClosed = {
  /** Where playback stopped, in seconds. */
  currentTime: number;
  /** Whether the visitor watched to the end. */
  finished: boolean;
};

type OpenListener = (request: ReelPlayerRequest) => void;
type CloseListener = (result: ReelPlayerClosed) => void;

const openListeners = new Set<OpenListener>();
const closeListeners = new Set<CloseListener>();
let open = false;

/** Asks the player host to open. Returns false when no host is mounted. */
export function openReelPlayer(request: ReelPlayerRequest) {
  if (!openListeners.size || open) return false;
  open = true;
  for (const listener of [...openListeners]) listener(request);
  return true;
}

/** Whether the full-screen player is showing. */
export function isReelPlayerOpen() {
  return open;
}

/** The player host subscribes here; returns the unsubscribe. */
export function onReelPlayerRequest(listener: OpenListener) {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

/** Called by the player host once it has fully closed. */
export function reportReelPlayerClosed(result: ReelPlayerClosed) {
  open = false;
  for (const listener of [...closeListeners]) listener(result);
}

/** The reel subscribes here to hear the player close; returns the unsubscribe. */
export function onReelPlayerClosed(listener: CloseListener) {
  closeListeners.add(listener);
  return () => {
    closeListeners.delete(listener);
  };
}
