// Minimal GitHub REST API helper shared by the PR automation scripts.
// Deliberately dependency-free (plain fetch) so these scripts don't need an
// `npm install` step in CI.
export async function ghRequest(token, path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    signal: AbortSignal.timeout(30_000),
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

export async function ghPaginate(token, path, key) {
  const items = [];
  for (let page = 1; ; page++) {
    const response = await ghRequest(
      token,
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    const batch = key ? response[key] : response;
    if (!Array.isArray(batch)) throw new Error(`Expected an array from ${path}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

// Shared by the status comment and the /merge readiness check: every check
// reported against a commit, whether it arrived as a Check Run (workflow
// jobs, CodeQL, SonarCloud's own App) or a legacy commit Status, deduplicated
// by name.
export async function collectChecks(token, repo, sha) {
  const [checkRuns, combinedStatus] = await Promise.all([
    ghPaginate(token, `/repos/${repo}/commits/${sha}/check-runs`, "check_runs"),
    ghPaginate(token, `/repos/${repo}/commits/${sha}/statuses`),
  ]);

  const seen = new Set();
  const items = [];
  for (const c of checkRuns.sort((a, b) => b.id - a.id)) {
    const key = `${c.app.id}:${c.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const state = c.status === "completed" ? (c.conclusion ?? "neutral") : c.status;
    items.push({ name: c.name, appId: c.app.id, state, url: c.html_url ?? c.details_url ?? null });
  }
  for (const s of combinedStatus.sort((a, b) => b.id - a.id)) {
    if (seen.has(`status:${s.context}`)) continue;
    seen.add(`status:${s.context}`);
    items.push({ name: s.context, state: s.state, url: s.target_url ?? null });
  }
  return items;
}

// GitHub links a commit's author and committer independently. A PR can have
// several people contributing commits, so use both identities and retain the
// PR author as a fallback for contributions made with an unlinked email.
// Bot accounts are deliberately omitted from the human thank-you message.
export function collectPullRequestContributorLogins(commits, prAuthorLogin) {
  const logins = new Map();
  const add = (login) => {
    if (!login || /\[bot\]$/i.test(login) || login === "web-flow") return;
    logins.set(login.toLowerCase(), login);
  };

  for (const commit of commits) {
    add(commit.author?.login);
    add(commit.committer?.login);
    for (const author of commit.coauthors ?? []) add(author.user?.login);
  }
  add(prAuthorLogin);
  return [...logins.values()];
}
