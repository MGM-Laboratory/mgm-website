// Backstop for missed preview-teardown runs: deletes any preview-pr-<n>
// environment whose PR is no longer open, or that has simply existed too
// long even if the PR is still open (cost control for abandoned previews).
import { ghRequest } from "./gh-api.mjs";
import { deleteEnvironment, listPreviewEnvironments } from "./railway-api.mjs";

const railwayToken = process.env.RAILWAY_TOKEN;
const repo = process.env.REPO;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, regardless of PR state

const environments = await listPreviewEnvironments(railwayToken);
console.log(`Found ${environments.length} preview environment(s).`);

for (const env of environments) {
  const match = env.name.match(/^preview-pr-(\d+)$/);
  if (!match) continue;
  const prNumber = match[1];
  const ageMs = Date.now() - new Date(env.createdAt).getTime();

  let stillOpen = false;
  try {
    const pr = await ghRequest(process.env.GITHUB_TOKEN, `/repos/${repo}/pulls/${prNumber}`);
    stillOpen = pr.state === "open";
  } catch {
    stillOpen = false; // PR not found — safe to treat as closed
  }

  const tooOld = ageMs > MAX_AGE_MS;
  if (!stillOpen || tooOld) {
    console.log(
      `Reaping ${env.name} (${env.id}) — stillOpen=${stillOpen}, ageDays=${(ageMs / 86_400_000).toFixed(1)}`,
    );
    await deleteEnvironment(railwayToken, env.id);
  }
}
