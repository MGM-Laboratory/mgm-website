// Minimal GitHub REST API helper shared by the PR automation scripts.
// Deliberately dependency-free (plain fetch) so these scripts don't need an
// `npm install` step in CI.
export async function ghRequest(token, path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${opts.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Shared by the status comment and the /merge readiness check: every check
// reported against a commit, whether it arrived as a Check Run (workflow
// jobs, CodeQL, SonarCloud's own App) or a legacy commit Status, deduplicated
// by name.
export async function collectChecks(token, repo, sha) {
  const [checkRuns, combinedStatus] = await Promise.all([
    ghRequest(token, `/repos/${repo}/commits/${sha}/check-runs?per_page=100`),
    ghRequest(token, `/repos/${repo}/commits/${sha}/status`),
  ]);

  const seen = new Set();
  const items = [];
  for (const c of checkRuns.check_runs) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    const state = c.status === "completed" ? (c.conclusion ?? "neutral") : c.status;
    items.push({ name: c.name, state, url: c.html_url ?? c.details_url ?? null });
  }
  for (const s of combinedStatus.statuses) {
    if (seen.has(s.context)) continue;
    seen.add(s.context);
    items.push({ name: s.context, state: s.state, url: s.target_url ?? null });
  }
  return items;
}
