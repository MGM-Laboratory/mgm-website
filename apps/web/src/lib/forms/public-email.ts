/**
 * A gentle nudge for mistyped email domains (gmial.com, yaho.co.id,
 * hotmail.con): the closest common domain within two edits.
 */

const DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.id",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "gmx.com",
  "ymail.com",
  "student.ub.ac.id",
  "ub.ac.id",
];

function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const bChars = b.split("");
  // One row of the edit-distance table at a time: `above`, `left` and
  // `diagonal` are the three neighbours of the cell being filled.
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (const [i, charA] of a.split("").entries()) {
    const next = [i + 1];
    let diagonal = i;
    let left = i + 1;
    for (const [j, above] of row.slice(1).entries()) {
      left = Math.min(above + 1, left + 1, diagonal + (charA === bChars.at(j) ? 0 : 1));
      next.push(left);
      diagonal = above;
    }
    row = next;
  }
  return row.at(-1) ?? 0;
}

/** The corrected address, or null when the domain looks fine. */
export function emailSuggestion(value: string): string | null {
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const domain = value
    .slice(at + 1)
    .trim()
    .toLowerCase();
  if (!domain.includes(".") || DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of DOMAINS) {
    const d = distance(domain, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best && bestDistance <= 2 ? `${value.slice(0, at)}@${best}` : null;
}
