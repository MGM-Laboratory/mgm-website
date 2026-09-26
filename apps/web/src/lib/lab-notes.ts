/**
 * Lab notes: the short, friendly asides the homepage says at story moments
 * (a first magnet moved, the reel watched to the end, a visitor who went
 * quiet for a while). Anything can post one; `<LabNotes />` shows them one
 * at a time. A note with an id is said once per visit (per tab session),
 * so the page never repeats itself.
 */

export type LabNoteTone = "blue" | "red" | "yellow" | "green";
export type LabNoteShape = "circle" | "x" | "plus" | "triangle" | "leaf" | "star";

export type LabNote = {
  /** Stable id; a note is shown once per session per id. */
  id: string;
  /** One or two short sentences. Formal, friendly, no em dashes. */
  text: string;
  tone?: LabNoteTone;
  shape?: LabNoteShape;
  /** Milliseconds on screen; defaults to a reading-speed estimate. */
  duration?: number;
  /** Show it again even if it was shown before this session. */
  repeat?: boolean;
};

type Listener = (note: LabNote) => void;

const listeners = new Set<Listener>();
const shown = new Set<string>();
const STORAGE_KEY = "mgm:lab-notes";

function readShown() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) for (const id of JSON.parse(raw) as string[]) shown.add(id);
  } catch {
    // Storage can be unavailable (private mode, blocked site data): notes
    // then just repeat on the next visit, which is harmless.
  }
}

function writeShown() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...shown]));
  } catch {
    // See readShown.
  }
}

let loaded = false;

/** Posts a note. Returns whether it was queued (false when already said). */
export function labNote(note: LabNote) {
  if (typeof window === "undefined") return false;
  if (!loaded) {
    loaded = true;
    readShown();
  }
  if (!note.repeat && shown.has(note.id)) return false;
  shown.add(note.id);
  writeShown();
  for (const listener of [...listeners]) listener(note);
  return true;
}

/** Subscribes the renderer; returns the unsubscribe. */
export function onLabNote(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How long a note stays up: about 70 ms a character, 3.2 s to 7 s. */
export function noteDuration(note: LabNote) {
  return note.duration ?? Math.min(7000, Math.max(3200, note.text.length * 70));
}
