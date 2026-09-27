/**
 * Where the visitor left the magnets, kept in this browser only. Each
 * magnet is stored by its word as an offset from its home plus its resting
 * angle, so a changed layout (a narrower window, a new row) still puts it
 * somewhere sensible; the board clamps whatever it reads into view.
 * Storage can be unavailable (private windows, blocked site data), in
 * which case the board simply starts at home every visit.
 */

export type SavedMagnet = { x: number; y: number; a: number };
export type Arrangement = Map<string, SavedMagnet>;

const KEY = "mgm:process-magnets:v1";
const LIMIT = 6000;

function finite(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

export function loadArrangement(): Arrangement {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return new Map();
    const out: Arrangement = new Map();
    for (const [word, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<SavedMagnet> | null;
      if (v && finite(v.x, LIMIT) && finite(v.y, LIMIT) && finite(v.a, 8)) {
        out.set(word, { x: v.x, y: v.y, a: v.a });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

export function saveArrangement(arrangement: Arrangement) {
  try {
    if (arrangement.size) {
      window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(arrangement)));
    } else {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    // See the note above: the arrangement just won't outlive the visit.
  }
}
