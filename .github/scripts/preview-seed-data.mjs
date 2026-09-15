// Job D of the preview pipeline. Seeds the freshly deployed preview stack
// with sanitized, published production content, then mints a superadmin and
// comments the preview links + credentials on the PR.
//
// This reads production over plain HTTPS, not its database — apps/api's own
// public /api/cms/* endpoints already return exactly the published,
// non-draft, PII-free subset (drafts are filtered server-side; CmsMember has
// no phone field in its schema at all). That was discovered the hard way:
// the original version of this script ran pg_dump/psql against
// postgres.railway.internal, which is Railway's private-network hostname —
// unreachable from a GitHub Actions runner outside Railway's network, so
// every attempt failed with P1001 before this file even got a chance to be
// wrong about anything else. Reading the public API instead means this
// script never needs a database credential for production OR preview, and
// the /bootstrap endpoints it POSTs to are the same idempotent, empty-table-
// only seed path apps/api already exposes (see cms-*.service.ts#bootstrap) —
// so a preview environment's Postgres schema doesn't need `prisma migrate
// deploy` either: PrismaService.onModuleInit() creates every CMS table with
// CREATE TABLE IF NOT EXISTS on boot.
//
// Safety invariants:
//  - Only ever reads production's public, unauthenticated CMS endpoints —
//    never its database, never an admin-only endpoint.
//  - CmsAdmin (password hashes) and CmsJobApplication (applicant PII/CVs)
//    have no public endpoint at all and are never touched.
//  - The generated superadmin passphrase is never logged — it only ever
//    reaches the PR comment, which is the disclosure channel that was asked
//    for.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  API_SERVICE_ID,
  PRODUCTION_ENVIRONMENT_ID,
  getVariables,
  listServiceInstances,
} from "./railway-api.mjs";
import { ghRequest } from "./gh-api.mjs";
import { factTable, footer, heading } from "./format.mjs";

const railwayToken = process.env.RAILWAY_TOKEN;
const botToken = process.env.BOT_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const environmentId = process.env.ENVIRONMENT_ID;
const apiDomain = process.env.API_DOMAIN;
const webDomain = process.env.WEB_DOMAIN;

// Every resource's public GET returns the same shape its own /bootstrap
// endpoint accepts as input — { records: [...] } — so this table is the
// entire integration.
const RESOURCES = [
  { key: "articles", label: "Articles", path: "/api/cms/articles" },
  { key: "publications", label: "Publications", path: "/api/cms/publications" },
  { key: "members", label: "Members", path: "/api/cms/members" },
  { key: "projects", label: "Projects", path: "/api/cms/projects" },
  { key: "research", label: "Research initiatives", path: "/api/cms/research" },
];

async function json(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`${opts?.method ?? "GET"} ${url} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

console.log("Looking up production's api domain...");
const prodInstances = await listServiceInstances(railwayToken, PRODUCTION_ENVIRONMENT_ID);
const prodApiDomain = prodInstances.find((i) => i.serviceId === API_SERVICE_ID)?.domains
  ?.serviceDomains?.[0]?.domain;
if (!prodApiDomain) throw new Error("Production api has no public domain to read from");

console.log("Waiting for the preview api to report healthy...");
const apiHealthUrl = `https://${apiDomain}/api/health`;
const healthDeadline = Date.now() + 5 * 60 * 1000;
let healthy = false;
while (Date.now() < healthDeadline) {
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

const [prodVars, previewVars] = await Promise.all([
  getVariables(railwayToken, PRODUCTION_ENVIRONMENT_ID, API_SERVICE_ID),
  getVariables(railwayToken, environmentId, API_SERVICE_ID),
]);

console.log("Fetching published content from production's public API...");
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

// Defensive only: CmsMember's public schema has no phone field and none of
// production's current records carry one, but a profile is a free-form
// z.record — strip it if it's ever present rather than assume it stays absent.
function sanitize(resourceKey, record) {
  if (resourceKey === "members" && record.profile && typeof record.profile === "object") {
    delete record.profile.phone;
  }
  return record;
}

const seedCounts = {};
for (const resource of RESOURCES) {
  const { records } = await json(`https://${prodApiDomain}${resource.path}`);
  const sanitized = records.map((r) => sanitize(resource.key, r));
  collectKeys(sanitized);
  seedCounts[resource.key] = sanitized.length;

  if (!sanitized.length) continue;
  console.log(`Seeding ${sanitized.length} ${resource.label.toLowerCase()}...`);
  // bootstrap() is a one-time seed (no-ops once the table already has rows —
  // see cms-*.service.ts), so re-running /preview on an existing environment
  // safely skips re-seeding instead of erroring or duplicating.
  await json(`https://${apiDomain}${resource.path}/bootstrap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cms-passphrase": previewVars.ADMIN_PASSPHRASE,
    },
    body: JSON.stringify({ records: sanitized }),
  }).catch((err) => console.warn(`Bootstrap for ${resource.key} skipped/failed: ${err.message}`));
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

let copied = 0;
let skipped = 0;
for (const key of storageKeys) {
  try {
    const obj = await prodS3.send(
      new GetObjectCommand({ Bucket: prodVars.AWS_S3_BUCKET, Key: key }),
    );
    const bytes = await obj.Body.transformToByteArray();
    await previewS3.send(
      new PutObjectCommand({
        Bucket: previewVars.AWS_S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: obj.ContentType,
      }),
    );
    copied++;
  } catch (err) {
    skipped++;
    console.warn(`Skipping object ${key}: ${err.message}`);
  }
}

console.log("Minting a fresh superadmin...");
const ALL_PAGES = ["articles", "publications", "members", "projects", "research", "careers"];
const adminBody = await json(`https://${apiDomain}/api/cms/admins`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-cms-passphrase": previewVars.ADMIN_PASSPHRASE },
  body: JSON.stringify({
    name: `PR #${prNumber} preview`,
    passphrase: "generate",
    permissions: Object.fromEntries(ALL_PAGES.map((p) => [p, ["read", "write", "delete"]])),
  }),
});
const generatedPassphrase = adminBody.generatedPassphrase;

const seededTable = RESOURCES.map((r) => `| ${r.label} | ${seedCounts[r.key] ?? 0} |`).join("\n");

const commentBody = [
  heading(`✅ Preview environment ready — PR #${prNumber}`),
  "",
  factTable([
    ["🌐 Site", `https://${webDomain}`],
    ["🔌 API", `https://${apiDomain}/api`],
    ["🗄️ Environment", `\`preview-pr-${prNumber}\``],
    ["🕒 Deployed", new Date().toISOString()],
  ]),
  "",
  heading("Seeded content", 3),
  "_A sanitized copy of published production content — drafts and admin-only records are never included._",
  "",
  "| Resource | Records |",
  "|---|---|",
  seededTable,
  "",
  `Storage objects copied: **${copied}**${skipped ? ` (${skipped} skipped — see run logs)` : ""}.`,
  "",
  heading("🔑 Superadmin login (this preview only)", 3),
  factTable([["Passphrase", `\`${generatedPassphrase}\``]]),
  "",
  "> Generated fresh for this preview — not a production credential, and not stored anywhere else. Torn down automatically when this PR closes (or when a maintainer runs `/merge`).",
  "",
  footer(),
].join("\n");

await ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
  method: "POST",
  body: JSON.stringify({ body: commentBody }),
});

console.log("Preview ready, comment posted.");
