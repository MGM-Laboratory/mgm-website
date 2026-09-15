// Job C of the preview pipeline — points the preview environment's api/web
// service instances at the images Job B built and this job just pushed, then
// deploys and waits for both to come up healthy. Runs with secrets, but only
// ever touches images it (or Job B) built — never PR source code directly.
import {
  API_SERVICE_ID,
  WEB_SERVICE_ID,
  deployServiceInstance,
  railway,
  updateServiceInstance,
} from "./railway-api.mjs";

const token = process.env.RAILWAY_TOKEN;
const environmentId = process.env.ENVIRONMENT_ID;
const apiImage = process.env.API_IMAGE; // e.g. docker.io/labmgm/website-api@sha256:...
const webImage = process.env.WEB_IMAGE;

await updateServiceInstance(token, API_SERVICE_ID, environmentId, {
  source: { image: apiImage },
});
await updateServiceInstance(token, WEB_SERVICE_ID, environmentId, {
  source: { image: webImage },
});

const apiDeploymentId = await deployServiceInstance(token, API_SERVICE_ID, environmentId);
const webDeploymentId = await deployServiceInstance(token, WEB_SERVICE_ID, environmentId);

async function waitForDeployment(id, label) {
  const terminal = new Set(["SUCCESS", "FAILED", "CRASHED", "REMOVED", "SKIPPED"]);
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const data = await railway(token, `query($id: String!) { deployment(id: $id) { status } }`, {
      id,
    });
    const status = data.deployment.status;
    if (terminal.has(status)) {
      console.log(`${label} deployment ${id} -> ${status}`);
      if (status !== "SUCCESS") throw new Error(`${label} deployment ended in ${status}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`${label} deployment ${id} did not finish within 10 minutes`);
}

await Promise.all([
  waitForDeployment(apiDeploymentId, "api"),
  waitForDeployment(webDeploymentId, "web"),
]);

console.log("Both services deployed successfully.");
