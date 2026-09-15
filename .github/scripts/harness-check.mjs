// Triggers a Harness pipeline for a given commit, polls it to completion,
// and posts the result back as a GitHub commit status — used because
// Harness's own GitHub webhook trigger needs a connector that (as of this
// writing) this account can't get past a schema issue on. This is simpler
// anyway: nothing here needs Harness to have any access to this repo at
// all, since the pipelines themselves `git clone` the public repo URL.
const HARNESS_BASE = "https://app.harness.io";
const ACCOUNT = "zpdJUsWiSYeXsnoCY8whvg";
const ORG = "default";
const PROJECT = "default_project";

const harnessKey = process.env.HARNESS_API_KEY;
const githubToken = process.env.GITHUB_TOKEN;
const repo = process.env.REPO;
const sha = process.env.HEAD_SHA;
const pipelineId = process.env.PIPELINE_ID; // e.g. harness_ci
const context = process.env.STATUS_CONTEXT; // e.g. harness/ci

async function harness(path, opts = {}) {
  const res = await fetch(`${HARNESS_BASE}${path}`, {
    ...opts,
    headers: { "x-api-key": harnessKey, "Content-Type": "application/json", ...opts.headers },
  });
  const json = await res.json();
  if (json.status !== "SUCCESS") {
    throw new Error(`Harness API error: ${JSON.stringify(json)}`);
  }
  return json.data;
}

// The execute endpoint takes the runtime-input YAML shape, not a plain JSON
// object — confirmed against the real API (a JSON body is silently
// misparsed the same way pipeline creation is if sent as JSON).
async function harnessExecuteYaml(path, yamlBody) {
  const res = await fetch(`${HARNESS_BASE}${path}`, {
    method: "POST",
    headers: { "x-api-key": harnessKey, "Content-Type": "application/yaml" },
    body: yamlBody,
  });
  const json = await res.json();
  if (json.status !== "SUCCESS") {
    throw new Error(`Harness API error: ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function postStatus(state, description, targetUrl) {
  await fetch(`https://api.github.com/repos/${repo}/statuses/${sha}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ state, description, context, target_url: targetUrl }),
  });
}

await postStatus("pending", "Running on Harness Cloud...");

const scope = `accountIdentifier=${ACCOUNT}&orgIdentifier=${ORG}&projectIdentifier=${PROJECT}`;
const inputYaml = [
  "pipeline:",
  `  identifier: ${pipelineId}`,
  "  variables:",
  "    - name: commit_sha",
  "      type: String",
  `      value: ${sha}`,
].join("\n");
const execData = await harnessExecuteYaml(
  `/pipeline/api/pipeline/execute/${pipelineId}?${scope}`,
  inputYaml,
);
const planExecutionId = execData.planExecution.uuid;
const executionUrl = `https://app.harness.io/ng/account/${ACCOUNT}/module/ci/orgs/${ORG}/projects/${PROJECT}/pipelines/${pipelineId}/executions/${planExecutionId}/pipeline`;

const terminal = new Set(["Success", "Failed", "Aborted", "Expired", "IgnoreFailed"]);
const deadline = Date.now() + 15 * 60 * 1000;
let status = "Running";
while (Date.now() < deadline) {
  const data = await harness(`/pipeline/api/pipelines/execution/v2/${planExecutionId}?${scope}`);
  status = data.pipelineExecutionSummary.status;
  if (terminal.has(status)) break;
  await new Promise((r) => setTimeout(r, 15_000));
}

if (status === "Success") {
  await postStatus("success", "Passed on Harness Cloud", executionUrl);
} else if (terminal.has(status)) {
  await postStatus("failure", `Harness run ended: ${status}`, executionUrl);
} else {
  await postStatus("error", "Timed out waiting for Harness", executionUrl);
}

console.log(`${pipelineId}: ${status}`);
