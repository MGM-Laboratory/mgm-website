// Job C of the preview pipeline — points the preview environment's api/web
// service instances at the images Job B built and this job just pushed, then
// deploys and watches both come up healthy. Runs with secrets, but only ever
// touches images it (or Job B) built — never PR source code directly.
//
// Deployment watching is deliberately strict (asked for after several early
// /preview runs failed silently): check every minute, retry automatically on
// a crash, tell the PR what's happening the whole way, escalate to
// CODEOWNERS after 10 minutes without success (without giving up), and only
// give up for real after a hard 1 hour ceiling or after a service exhausts
// its retries — whichever comes first.
import {
  API_SERVICE_ID,
  WEB_SERVICE_ID,
  deployServiceInstance,
  deploymentLogs,
  railway,
  updateServiceInstance,
} from "./railway-api.mjs";
import { ghRequest } from "./gh-api.mjs";
import { codeowners } from "./codeowners.mjs";
import { collapsible, footer, heading, logExcerpt, mentionAll, statusTable } from "./format.mjs";

const token = process.env.RAILWAY_TOKEN;
const environmentId = process.env.ENVIRONMENT_ID;
const apiImage = process.env.API_IMAGE;
const webImage = process.env.WEB_IMAGE;
const botToken = process.env.BOT_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const runUrl = process.env.RUN_URL;

const MAX_ATTEMPTS = 4; // 1 initial deploy + up to 3 automatic retries
const CHECK_INTERVAL_MS = 60_000;
const ESCALATE_AFTER_MS = 10 * 60 * 1000;
const HARD_TIMEOUT_MS = 60 * 60 * 1000;
const TERMINAL = new Set(["SUCCESS", "FAILED", "CRASHED", "REMOVED", "SKIPPED"]);

const STATUS_MARKER = `<!-- ren-automation:preview-deploy-status-pr-${prNumber} -->`;

const services = [
  {
    id: API_SERVICE_ID,
    label: "api",
    image: apiImage,
    attempt: 1,
    state: "queued",
    lastError: null,
  },
  {
    id: WEB_SERVICE_ID,
    label: "web",
    image: webImage,
    attempt: 1,
    state: "queued",
    lastError: null,
  },
];

async function upsertComment(marker, body) {
  const full = `${marker}\n${body}`;
  const comments = await ghRequest(
    botToken,
    `/repos/${repo}/issues/${prNumber}/comments?per_page=100`,
  );
  const existing = comments.find((c) => c.body?.includes(marker));
  if (existing) {
    await ghRequest(botToken, `/repos/${repo}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: full }),
    });
  } else {
    await ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: full }),
    });
  }
}

async function postComment(body) {
  await ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function deploymentStatus(id) {
  const data = await railway(token, `query($id: String!) { deployment(id: $id) { status } }`, {
    id,
  });
  return data.deployment.status;
}

async function start(service) {
  await updateServiceInstance(token, service.id, environmentId, {
    source: { image: service.image },
  });
  service.deploymentId = await deployServiceInstance(token, service.id, environmentId);
  service.state = "in_progress";
}

function renderStatus(startedAt) {
  const elapsedMin = Math.round((Date.now() - startedAt) / 60000);
  const items = services.map((s) => ({
    label: s.label,
    state: s.state,
    detail:
      s.state === "in_progress" || s.state === "queued"
        ? `attempt ${s.attempt}/${MAX_ATTEMPTS}`
        : (s.lastError ?? ""),
  }));
  return [
    heading(`🚀 Deploying preview — PR #${prNumber}`, 3),
    "",
    statusTable(items),
    "",
    `_Checked every minute · elapsed ${elapsedMin}m of up to 60m · [full run logs](${runUrl})_`,
    "",
    footer(),
  ].join("\n");
}

for (const s of services) await start(s);

const startedAt = Date.now();
let escalated = false;
await upsertComment(STATUS_MARKER, renderStatus(startedAt));

let allDone = false;
while (!allDone && Date.now() - startedAt < HARD_TIMEOUT_MS) {
  await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));

  for (const s of services) {
    if (s.state === "success" || s.state === "failed") continue;

    const status = await deploymentStatus(s.deploymentId);
    if (!TERMINAL.has(status)) continue; // still deploying, nothing to report yet
    if (status === "SUCCESS") {
      s.state = "success";
      continue;
    }

    // Terminal, non-success: a real crash/failure.
    const logs = await deploymentLogs(token, s.deploymentId, 30).catch(() => []);
    s.lastError = `${status} on attempt ${s.attempt}/${MAX_ATTEMPTS}`;

    if (s.attempt < MAX_ATTEMPTS) {
      s.attempt += 1;
      await postComment(
        [
          heading(`⚠️ ${s.label} crashed — retrying (attempt ${s.attempt}/${MAX_ATTEMPTS})`, 3),
          "",
          `The \`${s.label}\` deployment ended in **${status}**. Retrying automatically — no action needed.`,
          "",
          collapsible(`Error detail for ${s.label}`, logExcerpt(logs)),
          "",
          footer(`full run: ${runUrl}`),
        ].join("\n"),
      );
      await start(s);
    } else {
      s.state = "failed";
      await postComment(
        [
          heading(`❌ ${s.label} deployment failed — out of retries`, 3),
          "",
          `Gave up on \`${s.label}\` after ${MAX_ATTEMPTS} attempts. Last status: **${status}**.`,
          "",
          collapsible(`Error detail for ${s.label}`, logExcerpt(logs), { open: true }),
          "",
          `[Full run logs](${runUrl})`,
          "",
          footer(),
        ].join("\n"),
      );
    }
  }

  await upsertComment(STATUS_MARKER, renderStatus(startedAt));

  const elapsed = Date.now() - startedAt;
  const stillGoing = services.some((s) => s.state !== "success" && s.state !== "failed");
  if (!escalated && elapsed >= ESCALATE_AFTER_MS && stillGoing) {
    escalated = true;
    const owners = codeowners();
    await postComment(
      [
        heading("🟡 Still working on it", 3),
        "",
        "This preview has been deploying for over 10 minutes without finishing. I'm not stopping — I'll keep retrying and checking every minute until it either succeeds, a service runs out of retries, or I hit the 1 hour limit.",
        "",
        owners.length
          ? `I've flagged ${mentionAll(owners)} to take a look in case this needs a manual eye. No action needed from you yet — thanks for your patience!`
          : "No CODEOWNERS are configured to notify — continuing to retry on my own.",
        "",
        "A maintainer or CODEOWNERS reviewer can re-run this any time with `/preview`.",
        "",
        footer(),
      ].join("\n"),
    );
  }

  allDone = services.every((s) => s.state === "success" || s.state === "failed");
}

await upsertComment(STATUS_MARKER, renderStatus(startedAt));

if (!allDone) {
  const owners = codeowners();
  await postComment(
    [
      heading("⏰ Preview deploy timed out after 1 hour", 3),
      "",
      `Gave up waiting. ${owners.length ? mentionAll(owners) : "A maintainer"} — this needs a manual look.`,
      "",
      statusTable(
        services.map((s) => ({ label: s.label, state: s.state, detail: s.lastError ?? "" })),
      ),
      "",
      footer(),
    ].join("\n"),
  );
  throw new Error("Preview deploy did not finish within the 1 hour timeout.");
}

const failed = services.filter((s) => s.state === "failed");
if (failed.length) {
  throw new Error(`Preview deploy failed for: ${failed.map((s) => s.label).join(", ")}`);
}

console.log("Both services deployed successfully.");
