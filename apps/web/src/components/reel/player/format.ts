/** Timecodes for the reel player: `mm:ss` on screen, words for screen readers. */

function parts(seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `01:23`, or `1:02:03` past an hour. */
export function timecode(seconds: number) {
  const { h, m, s } = parts(seconds);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const unit = (value: number, word: string) => `${value} ${word}${value === 1 ? "" : "s"}`;

/** `1 minute 23 seconds`, the way a screen reader should say a position. */
export function spokenTime(seconds: number) {
  const { h, m, s } = parts(seconds);
  const words: string[] = [];
  if (h) words.push(unit(h, "hour"));
  if (m) words.push(unit(m, "minute"));
  if (s || !words.length) words.push(unit(s, "second"));
  return words.join(" ");
}
