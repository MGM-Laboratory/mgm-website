// Job D of the preview pipeline. Seeds the freshly deployed preview stack
// with sanitized, published production content, then mints a superadmin and
// comments the preview links + credentials on the PR.
//
// Safety invariants:
//  - Only ever SELECTs from the production database — every write goes to
//    the preview database.
//  - CmsAdmin (password hashes) and CmsJobApplication (applicant PII/CVs)
//    are never touched at all.
//  - The generated superadmin passphrase is never logged — it only ever
//    reaches the PR comment, which is the disclosure channel that was asked
//    for.
import { execFileSync } from "node:child_process";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { railway, PRODUCTION_ENVIRONMENT_ID, API_SERVICE_ID, WEB_SERVICE_ID } from "./railway-api.mjs";
import { ghRequest } from "./gh-api.mjs";

const railwayToken = process.env.RAILWAY_TOKEN;
const botToken = process.env.BOT_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const environmentId = process.env.ENVIRONMENT_ID;
const apiDomain = process.env.API_DOMAIN;
const webDomain = process.env.WEB_DOMAIN;

const WHITELISTED_TABLES = [
  "CmsArticle",
  "CmsPublication",
  "CmsProject",
  "CmsResearchInitiative",
  "CmsMember",
];

async function serviceVars(environmentId, serviceId) {
  const data = await railway(
    railwayToken,
    `query($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId: "810d3a40-d9d2-410c-b117-289d2aff095f", environmentId, serviceId },
  );
  return data.variables;
}

const [prodVars, previewVars] = await Promise.all([
  serviceVars(PRODUCTION_ENVIRONMENT_ID, API_SERVICE_ID),
  serviceVars(environmentId, API_SERVICE_ID),
]);

const prodDb = prodVars.DATABASE_URL;
const previewDb = previewVars.DATABASE_URL;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 256, ...opts });
}

console.log("Running migrations against the preview database...");
run("pnpm", ["--filter", "api", "exec", "prisma", "migrate", "deploy"], {
  cwd: new URL("../..", import.meta.url).pathname,
  env: { ...process.env, DATABASE_URL: previewDb },
});

console.log(`Copying ${WHITELISTED_TABLES.join(", ")} from production (read-only)...`);
const tableArgs = WHITELISTED_TABLES.flatMap((t) => ["--table", `"${t}"`]);
const dump = run(
  "pg_dump",
  [prodDb, "--data-only", "--no-owner", "--no-privileges", "--column-inserts", ...tableArgs],
  { maxBuffer: 1024 * 1024 * 512 },
);
run("psql", [previewDb, "-v", "ON_ERROR_STOP=1"], { input: dump });

console.log("Stripping member phone numbers...");
run("psql", [previewDb, "-c", `UPDATE "CmsMember" SET data = data - 'phone'`]);

console.log("Finding referenced storage objects...");
const selectAll = WHITELISTED_TABLES.map((t) => `SELECT data::text FROM "${t}"`).join(" UNION ALL ");
const rowsText = run("psql", [previewDb, "-t", "-A", "-c", selectAll]);
const storageKeys = new Set();
function collectKeys(value) {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k.endsWith("Key") && typeof v === "string" && v) storageKeys.add(v);
      else collectKeys(v);
    }
  }
}
for (const line of rowsText.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  try {
    collectKeys(JSON.parse(trimmed));
  } catch {
    // not a JSON line (psql formatting noise) — skip
  }
}
console.log(`Found ${storageKeys.size} referenced storage object(s).`);

const prodS3 = new S3Client({
  region: prodVars.AWS_REGION,
  endpoint: prodVars.AWS_ENDPOINT_URL,
  forcePathStyle: prodVars.AWS_S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: prodVars.AWS_ACCESS_KEY_ID,
    secretAccessKey: prodVars.AWS_SECRET_ACCESS_KEY,
  },
});
const previewS3 = new S3Client({
  region: previewVars.AWS_REGION,
  endpoint: previewVars.AWS_ENDPOINT_URL,
  forcePathStyle: previewVars.AWS_S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: previewVars.AWS_ACCESS_KEY_ID,
    secretAccessKey: previewVars.AWS_SECRET_ACCESS_KEY,
  },
});

for (const key of storageKeys) {
  try {
    const obj = await prodS3.send(new GetObjectCommand({ Bucket: prodVars.AWS_S3_BUCKET, Key: key }));
    const bytes = await obj.Body.transformToByteArray();
    await previewS3.send(
      new PutObjectCommand({
        Bucket: previewVars.AWS_S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: obj.ContentType,
      }),
    );
  } catch (err) {
    console.warn(`Skipping object ${key}: ${err.message}`);
  }
}

console.log("Waiting for the preview api to report healthy...");
const apiHealthUrl = `https://${apiDomain}/api/health`;
const deadline = Date.now() + 5 * 60 * 1000;
let healthy = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(apiHealthUrl);
    if (res.ok) {
      healthy = true;
      break;
    }
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 5000));
}
if (!healthy) throw new Error(`api never became healthy at ${apiHealthUrl}`);

console.log("Minting a fresh superadmin...");
const ALL_PAGES = ["articles", "publications", "members", "projects", "research", "careers"];
const adminRes = await fetch(`https://${apiDomain}/api/cms/admins`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-cms-passphrase": previewVars.ADMIN_PASSPHRASE,
  },
  body: JSON.stringify({
    name: `PR #${prNumber} preview`,
    passphrase: "generate",
    permissions: Object.fromEntries(ALL_PAGES.map((p) => [p, ["read", "write", "delete"]])),
  }),
});
if (!adminRes.ok) {
  throw new Error(`Failed to create preview superadmin: ${adminRes.status} ${await adminRes.text()}`);
}
const adminBody = await adminRes.json();
const generatedPassphrase = adminBody.generatedPassphrase;

const commentBody = [
  `**Ren's Automation** — preview for PR #${prNumber} is up:`,
  "",
  `- Site: https://${webDomain}`,
  `- API: https://${apiDomain}/api`,
  "",
  "Superadmin login (this preview only, seeded from sanitized public production content):",
  `- Passphrase: \`${generatedPassphrase}\``,
  "",
  "Torn down automatically when this PR closes.",
].join("\n");

await ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
  method: "POST",
  body: JSON.stringify({ body: commentBody }),
});

console.log("Preview ready, comment posted.");
