// Job A of the preview pipeline — no PR code involved, safe to hold secrets.
// Creates a topology-only fork of production, then replaces every runtime
// credential and connection with preview-owned values before deploying code.
// Environment duplication carries service topology/settings, not database or
// Redis data; the copied production variables are replaced before app deploy.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { invalidatePreviewAnnouncement } from "./preview-credentials.mjs";
import {
  API_SERVICE_ID,
  assertPreviewEnvironment,
  POSTGRES_SERVICE_ID,
  REDIS_SERVICE_ID,
  WEB_SERVICE_ID,
  bucketS3Credentials,
  createBucket,
  createPreviewEnvironment,
  createVolume,
  deleteEnvironment,
  deployServiceInstance,
  findEnvironmentByName,
  generateServiceDomain,
  getVariables,
  listServiceInstances,
  listVolumeInstances,
  previewEnvironmentName,
  setVariables,
  updateServiceInstance,
} from "./railway-api.mjs";

const token = process.env.RAILWAY_TOKEN;
const prNumber = process.env.PR_NUMBER;
const outputFile = process.env.GITHUB_OUTPUT;

const name = previewEnvironmentName(prNumber);
await invalidatePreviewAnnouncement(process.env.BOT_TOKEN, process.env.REPO, prNumber);
// This is the actual superadmin secret used by both applications. Rotate it
// for every /preview invocation, including a re-run against an existing
// environment, so a preview credential cannot be reused indefinitely.
const superadminPassphrase = randomBytes(18).toString("base64url");

let environment = await findEnvironmentByName(token, name);
let isNew = !environment;
if (isNew) {
  console.log(`Creating environment ${name}...`);
  environment = await createPreviewEnvironment(token, name);
} else {
  console.log(`Reusing existing environment ${name} (${environment.id})`);
}
await assertPreviewEnvironment(token, prNumber, environment.id);

const oldApiVars = await getVariables(token, environment.id, API_SERVICE_ID);
// A failed attempt can leave stale variables behind even when the service
// topology was never created. Check topology first, before trusting the
// marker, and recover only the exact PR-named environment. Never delete an
// environment with the production id (the assertion above guards this).
const existingInstances = await listServiceInstances(token, environment.id);
const requiredServiceIds = new Set([
  API_SERVICE_ID,
  WEB_SERVICE_ID,
  POSTGRES_SERVICE_ID,
  REDIS_SERVICE_ID,
]);
const hasTopology =
  requiredServiceIds.size ===
  existingInstances.filter((instance) => requiredServiceIds.has(instance.serviceId)).length;
if (!isNew && !hasTopology) {
  console.log(`Removing incomplete preview environment ${name} before recreation...`);
  await deleteEnvironment(token, environment.id);
  environment = await createPreviewEnvironment(token, name);
  await assertPreviewEnvironment(token, prNumber, environment.id);
  isNew = true;
} else if (!isNew && oldApiVars.PREVIEW_ISOLATION_VERSION !== "2") {
  throw new Error(
    "This legacy preview predates isolation v2. Close its PR to tear it down before recreating the preview.",
  );
}

// Replace the cloned database/cache credentials before either application is
// deployed. These references resolve only inside this Railway environment;
// they cannot point at production's private host or credentials.
const postgresPassword = randomBytes(24).toString("base64url");
const redisPassword = randomBytes(24).toString("base64url");
await setVariables(
  token,
  environment.id,
  POSTGRES_SERVICE_ID,
  {
    POSTGRES_USER: "postgres",
    POSTGRES_DB: "preview",
    POSTGRES_PASSWORD: postgresPassword,
    PGUSER: "postgres",
    PGDATABASE: "preview",
    PGPASSWORD: postgresPassword,
    PGPORT: "5432",
    PGDATA: "/var/lib/postgresql/data/pgdata",
    PGHOST: "${{RAILWAY_PRIVATE_DOMAIN}}",
    DATABASE_URL:
      "postgresql://postgres:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/preview",
  },
  true,
  true,
);
await setVariables(
  token,
  environment.id,
  REDIS_SERVICE_ID,
  {
    REDIS_PASSWORD: redisPassword,
    REDISPASSWORD: redisPassword,
    REDISUSER: "default",
    REDISPORT: "6379",
    REDISHOST: "${{RAILWAY_PRIVATE_DOMAIN}}",
    REDIS_URL: "redis://default:${{REDIS_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:6379",
  },
  true,
  true,
);

let instances = await listServiceInstances(token, environment.id);
const apiInstance = instances.find((i) => i.serviceId === API_SERVICE_ID);
const webInstance = instances.find((i) => i.serviceId === WEB_SERVICE_ID);
const postgresInstance = instances.find((i) => i.serviceId === POSTGRES_SERVICE_ID);
const redisInstance = instances.find((i) => i.serviceId === REDIS_SERVICE_ID);
if (!apiInstance || !webInstance || !postgresInstance || !redisInstance) {
  throw new Error(
    "Expected api/web/Postgres/Redis service instances in the duplicated environment",
  );
}

// Duplication copies web/api's source as-is: repo main, same as production.
// skipInitialDeploys only skips the deploy at creation time — it does NOT
// unsubscribe the instance from GitHub's push-triggered auto-deploy, so
// every push to main between here and push-and-deploy pointing these at the
// real PR image was re-deploying *main's own source* into this preview.
// Confirmed live: both had already deployed from repo/main, successfully,
// before push-and-deploy ever got a chance to run. Switching to a neutral
// placeholder image now (scoped to this environment only, via
// environmentId — verified earlier this never touches production) closes
// that window; push-and-deploy overwrites it with the real image shortly.
const PLACEHOLDER_IMAGE = "busybox:latest";
if (apiInstance.source?.repo) {
  console.log("Disconnecting api from GitHub auto-deploy for this environment...");
  await updateServiceInstance(token, API_SERVICE_ID, environment.id, {
    source: { image: PLACEHOLDER_IMAGE },
  });
}
if (webInstance.source?.repo) {
  console.log("Disconnecting web from GitHub auto-deploy for this environment...");
  await updateServiceInstance(token, WEB_SERVICE_ID, environment.id, {
    source: { image: PLACEHOLDER_IMAGE },
  });
}

// Volumes aren't carried over by environmentCreate's sourceEnvironmentId
// duplication either (same as buckets) — Postgres refuses to even start
// without one ("This service requires a volume to be mounted at
// /var/lib/postgresql/data"), confirmed live. Creating one attaches it and
// triggers a deploy in the same call, so track that to avoid double-
// deploying below.
const volumeInstances = await listVolumeInstances(token, environment.id);
const hasVolume = (serviceId) => volumeInstances.some((v) => v.serviceId === serviceId);

if (hasVolume(POSTGRES_SERVICE_ID)) {
  if (!postgresInstance.hasEverDeployed) {
    console.log("Deploying Postgres for the first time...");
    await deployServiceInstance(token, POSTGRES_SERVICE_ID, environment.id);
  }
} else {
  console.log("Creating Postgres volume (this also triggers its first deploy)...");
  await createVolume(token, environment.id, POSTGRES_SERVICE_ID, "/var/lib/postgresql/data");
}

if (hasVolume(REDIS_SERVICE_ID)) {
  if (!redisInstance.hasEverDeployed) {
    console.log("Deploying Redis for the first time...");
    await deployServiceInstance(token, REDIS_SERVICE_ID, environment.id);
  }
} else {
  console.log("Creating Redis volume (this also triggers its first deploy)...");
  await createVolume(token, environment.id, REDIS_SERVICE_ID, "/data");
}
// Wait for both to actually come up before this job finishes — api gets
// deployed in a later job and would otherwise crash-loop against a
// database that hasn't finished starting yet. Polling by service (rather
// than a specific deployment id) covers both paths above uniformly: a
// deploy triggered explicitly here, or one triggered implicitly by
// createVolume attaching a volume for the first time.
async function waitForFirstDeploy(serviceId, label) {
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    const current = await listServiceInstances(token, environment.id);
    const instance = current.find((i) => i.serviceId === serviceId);
    if (instance?.latestDeployment?.status === "SUCCESS") {
      console.log(`${label} is up.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${label} did not deploy successfully within 3 minutes`);
}
await waitForFirstDeploy(POSTGRES_SERVICE_ID, "Postgres");
await waitForFirstDeploy(REDIS_SERVICE_ID, "Redis");

function domainOf(instance) {
  return instance.domains?.serviceDomains?.[0]?.domain ?? null;
}

let apiDomain = domainOf(apiInstance);
if (!apiDomain) {
  console.log("Generating api domain...");
  apiDomain = await generateServiceDomain(token, API_SERVICE_ID, environment.id, 4000);
}

let webDomain = domainOf(webInstance);
if (!webDomain) {
  console.log("Generating web domain...");
  webDomain = await generateServiceDomain(token, WEB_SERVICE_ID, environment.id, 3000);
}

// Reuse via persisted state (the api service's own vars), not a by-name
// bucket lookup: bucket records are project-wide and outlive the
// environment they were meant for (no delete mutation exists), so a
// previous attempt's environment being deleted and recreated left an
// orphaned "preview-pr-1" bucket record around — findBucketByName kept
// finding that dead record on every retry instead of making a fresh one.
// Confirmed live. A random suffix on the name sidesteps ever colliding
// with a stale record like that again.
const existingApiVars = await getVariables(token, environment.id, API_SERVICE_ID);
// Duplication copies CORS_ORIGIN over as production's literal web domain, not
// a reference — left alone, every browser fetch from the preview web app to
// the preview api gets rejected by CORS and the site renders empty. Confirmed
// live against a running preview.
let apiVars = {
  PREVIEW_ISOLATION_VERSION: "2",
  PORT: "4000",
  NODE_ENV: "production",
  CORS_ORIGIN: `https://${webDomain}`,
  PUBLIC_WEB_URL: `https://${webDomain}`,
  DATABASE_URL: "${{Postgres.DATABASE_URL}}",
  REDIS_URL: "${{Redis.REDIS_URL}}",
  RESEND_API_KEY: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SES_FROM_EMAIL: "",
  ADMIN_PASSPHRASE: superadminPassphrase,
};

if (
  existingApiVars.AWS_S3_BUCKET &&
  existingApiVars.PREVIEW_STORAGE_ENVIRONMENT_ID === environment.id
) {
  console.log(`Reusing existing bucket ${existingApiVars.AWS_S3_BUCKET} for this environment.`);
  for (const key of [
    "PREVIEW_STORAGE_ENVIRONMENT_ID",
    "AWS_S3_BUCKET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_ENDPOINT_URL",
    "AWS_REGION",
  ])
    apiVars[key] = existingApiVars[key];
} else {
  const bucketName = `preview-pr-${prNumber}-${randomBytes(4).toString("hex")}`.slice(0, 63);
  console.log(`Creating bucket ${bucketName}...`);
  const bucket = await createBucket(token, environment.id, bucketName);

  // environmentPatchCommit (inside createBucket) is async — bucketS3Credentials
  // can 404 with "BucketInstance not found" for a few seconds after a fresh
  // create while the instance finishes provisioning. Retry instead of failing.
  let creds = null;
  const bucketAttempts = 12;
  for (let attempt = 0; attempt < bucketAttempts && !creds; attempt++) {
    try {
      creds = await bucketS3Credentials(token, bucket.id, environment.id);
    } catch (err) {
      if (attempt === bucketAttempts - 1) throw err;
      console.log(`Bucket instance not ready yet (attempt ${attempt + 1}), retrying...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Deliberately not setting AWS_S3_FORCE_PATH_STYLE — production leaves it
  // unset (defaults to false in env.validation.ts) against the same
  // storage backend, and forcing it on here for no reason risks a request-
  // signing mismatch that just looks like a bad credential.
  Object.assign(apiVars, {
    PREVIEW_STORAGE_ENVIRONMENT_ID: environment.id,
    AWS_S3_BUCKET: creds.bucketName ?? bucketName,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_ENDPOINT_URL: creds.endpoint,
    AWS_REGION: creds.region ?? "auto",
  });
}

await setVariables(token, environment.id, API_SERVICE_ID, apiVars, true, true);
await setVariables(
  token,
  environment.id,
  WEB_SERVICE_ID,
  {
    PORT: "3000",
    NODE_ENV: "production",
    ADMIN_PASSPHRASE: superadminPassphrase,
    CMS_API_URL: `https://${apiDomain}/api`,
    NEXT_PUBLIC_API_URL: `https://${apiDomain}/api`,
  },
  true,
  true,
);

// admin_passphrase deliberately never leaves this process: this repo is
// public, and GitHub Actions job outputs (unlike step-local variables) are
// readable by anything with API access to the run. Job D re-reads the
// current value straight from Railway instead of receiving it here.
const result = {
  environment_id: environment.id,
  environment_name: name,
  is_new: String(isNew),
  api_domain: apiDomain,
  web_domain: webDomain,
};

console.log(JSON.stringify(result, null, 2));

if (outputFile) {
  const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
  writeFileSync(outputFile, lines.join("\n") + "\n", { flag: "a" });
}
