// Who has to approve a pull request before /merge will ship it.
//
// The repository's policy (docs/ci-cd.md § Merging): a pull request opened by
// a code owner merges without anyone else's review, and every other author's
// pull request needs an approving review from a code owner on the exact
// commit being merged. GitHub's rulesets can't express "reviews required
// unless the author is a code owner" (and never let authors approve their
// own work), so the main ruleset requires no reviews and /merge, the only
// sanctioned merge path, enforces this instead.

/**
 * @param {{ author: string, owners: string[], reviews: Array<{ user: { login: string } | null, state: string, commit_id: string, submitted_at?: string }>, headSha: string }} input
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function reviewGate({ author, owners, reviews, headSha }) {
  const ownerSet = new Set(owners.map((owner) => owner.toLowerCase()));
  if (!ownerSet.size) return { ok: true };
  if (ownerSet.has(author.toLowerCase())) return { ok: true };

  // Each code owner's latest decisive review counts (a later "changes
  // requested" withdraws an earlier approval); comments don't change it.
  const latest = new Map();
  const ordered = [...reviews].sort((a, b) =>
    String(a.submitted_at ?? "").localeCompare(String(b.submitted_at ?? "")),
  );
  for (const review of ordered) {
    const login = review.user?.login?.toLowerCase();
    if (!login || !ownerSet.has(login)) continue;
    if (
      review.state === "APPROVED" ||
      review.state === "CHANGES_REQUESTED" ||
      review.state === "DISMISSED"
    ) {
      latest.set(login, review);
    }
  }
  const approved = [...latest.values()].some(
    (review) => review.state === "APPROVED" && review.commit_id === headSha,
  );
  if (approved) return { ok: true };
  const handles = [...ownerSet].map((owner) => `@${owner}`).join(", ");
  return {
    ok: false,
    reason: `This pull request needs an approving review from a code owner (${handles}) on its latest commit.`,
  };
}
