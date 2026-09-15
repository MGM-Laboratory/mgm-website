// Job A of the preview pipeline — no PR code involved, safe to hold secrets.
// Ensures a "preview-pr-<n>" environment exists (creating a fresh one, forked
// from production, on the first /preview for a PR — reused on every repeat),
// makes sure it has its own bucket and public domains, and overrides the
// vars that were copied as literal (not reference) values from production so
// the preview never touches prod's bucket credentials.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  API_SERVICE_ID,
  POSTGRES_SERVICE_ID,
  REDIS_SERVICE_ID,
  WEB_SERVICE_ID,
  bucketS3Credentials,
  createBucket,
  createPreviewEnvironment,
  createVolume,
  deployServiceInstance,
  findBucketByName,
  findEnvironmentByName,
  generateServiceDomain,
  listServiceInstances,
  listVolumeInstances,
  previewEnvironmentName,
  setVariables,
} from "./railway-api.mjs";

const token = process.env.RAILWAY_TOKEN;
const prNumber = process.env.PR_NUMBER;
const outputFile = process.env.GITHUB_OUTPUT;

const name = previewEnvironmentName(prNumber);

let environment = await findEnvironmentByName(token, name);
const isNew = !environment;
if (isNew) {
  console.log(`Creating environment ${name}...`);
  environment = await createPreviewEnvironment(token, name);
} else {
  console.log(`Reusing existing environment ${name} (${environment.id})`);
}

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
    if (instance?.hasEverDeployed) {
      console.log(`${label} is up.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`${label} did not report deployed within 3 minutes — continuing anyway.`);
}
await waitForFirstDeploy(POSTGRES_SERVICE_ID, "Postgres");
await waitForFirstDeploy(REDIS_SERVICE_ID, "Redis");

const bucketName = `preview-pr-${prNumber}`.slice(0, 63);
let bucket = await findBucketByName(token, bucketName);
if (!bucket) {
  console.log(`Creating bucket ${bucketName}...`);
  bucket = await createBucket(token, environment.id, bucketName);
}

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

const adminPassphrase = randomBytes(18).toString("base64url");

const apiVars = {
  ADMIN_PASSPHRASE: adminPassphrase,
  NODE_ENV: "production",
};
if (creds) {
  // Deliberately not setting AWS_S3_FORCE_PATH_STYLE here — production
  // leaves it unset (defaults to false in env.validation.ts) against the
  // same storage backend, and forcing it on here for no reason risks a
  // request-signing mismatch that just looks like a bad credential.
  Object.assign(apiVars, {
    AWS_S3_BUCKET: creds.bucketName ?? bucketName,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_ENDPOINT_URL: creds.endpoint,
    AWS_REGION: creds.region ?? "auto",
  });
}
await setVariables(token, environment.id, API_SERVICE_ID, apiVars);
await setVariables(token, environment.id, WEB_SERVICE_ID, { ADMIN_PASSPHRASE: adminPassphrase });

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
