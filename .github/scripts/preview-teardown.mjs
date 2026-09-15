import {
  deleteEnvironment,
  findEnvironmentByName,
  previewEnvironmentName,
} from "./railway-api.mjs";

const token = process.env.RAILWAY_TOKEN;
const prNumber = process.env.PR_NUMBER;

const name = previewEnvironmentName(prNumber);
const environment = await findEnvironmentByName(token, name);

if (!environment) {
  console.log(`No preview environment for PR #${prNumber} (nothing to tear down).`);
  process.exit(0);
}

console.log(`Deleting environment ${name} (${environment.id})...`);
await deleteEnvironment(token, environment.id);
console.log("Done.");
