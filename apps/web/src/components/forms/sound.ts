/**
 * Soft generated sounds (no files): a tick when a piece lands, a pair of
 * notes on a pick, a low bump on an error, a small glide between pages and
 * an arpeggio at the end. The context starts only after a user gesture,
 * and only when the form turns sound on and the respondent hasn't muted it.
 */

export type SoundKind = "tick" | "select" | "error" | "page" | "success";

type Note = { frequency: number; at: number; length: number; type?: OscillatorType; gain?: number };

const SOUNDS: Record<SoundKind, Note[]> = {
  tick: [{ frequency: 1320, at: 0, length: 0.07, gain: 0.05 }],
  select: [
    { frequency: 660, at: 0, length: 0.08, gain: 0.05 },
    { frequency: 990, at: 0.06, length: 0.1, gain: 0.045 },
  ],
  error: [{ frequency: 170, at: 0, length: 0.16, type: "triangle", gain: 0.08 }],
  page: [
    { frequency: 440, at: 0, length: 0.09, gain: 0.035 },
    { frequency: 587, at: 0.07, length: 0.12, gain: 0.035 },
  ],
  success: [
    { frequency: 523.25, at: 0, length: 0.22, gain: 0.05 },
    { frequency: 659.25, at: 0.11, length: 0.22, gain: 0.05 },
    { frequency: 783.99, at: 0.22, length: 0.26, gain: 0.05 },
    { frequency: 1046.5, at: 0.36, length: 0.5, gain: 0.045 },
  ],
};

let context: AudioContext | null = null;

function audio() {
  if (context) return context;
  try {
    const Constructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    context = Constructor ? new Constructor() : null;
  } catch {
    context = null;
  }
  return context;
}

export function playSound(kind: SoundKind) {
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  const now = ctx.currentTime + 0.01;
  for (const note of SOUNDS[kind]) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = note.type ?? "sine";
    oscillator.frequency.value = note.frequency;
    const start = now + note.at;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.gain ?? 0.05, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.length);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + note.length + 0.02);
  }
}
