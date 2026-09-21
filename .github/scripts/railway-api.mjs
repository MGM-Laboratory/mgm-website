// Minimal Railway public GraphQL API client. Deliberately dependency-free.
const ENDPOINT = "https://backboard.railway.com/graphql/v2";

export async function railway(token, query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Railway API error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data;
}

export const PROJECT_ID = "810d3a40-d9d2-410c-b117-289d2aff095f";
export const PRODUCTION_ENVIRONMENT_ID = "42acf786-e8f4-41f8-8d4f-715bee1655f8";
export const API_SERVICE_ID = "b401b859-90cb-44cf-9787-054cc14290fd";
export const WEB_SERVICE_ID = "4969778e-0bff-4200-9472-6b5a13f037da";
// Same logical services (and same ids) in every environment forked from
// production, same as API_SERVICE_ID/WEB_SERVICE_ID — only the per-
// environment instance differs.
export const POSTGRES_SERVICE_ID = "702df22d-7432-4a04-a52d-53fab670e59c";
export const REDIS_SERVICE_ID = "ea85a601-8ce9-4e3b-965b-1fb83c4accb9";

export function previewEnvironmentName(prNumber) {
  if (!/^[1-9]\d*$/.test(String(prNumber))) throw new Error("Invalid preview PR number");
  return `preview-pr-${prNumber}`;
}

export async function assertPreviewEnvironment(token, prNumber, environmentId) {
  if (!environmentId || environmentId === PRODUCTION_ENVIRONMENT_ID)
    throw new Error("Refusing to operate on production or an unspecified environment");
  const environment = await findEnvironmentByName(token, previewEnvironmentName(prNumber));
  if (environment?.id !== environmentId) throw new Error("Environment does not belong to this PR");
}

export async function findEnvironmentByName(token, name) {
  const data = await railway(
    token,
    `query($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges { node { id name } }
        }
      }
    }`,
    { projectId: PROJECT_ID },
  );
  return data.project.environments.edges.map((e) => e.node).find((n) => n.name === name) ?? null;
}

export async function listPreviewEnvironments(token) {
  const data = await railway(
    token,
    `query($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges { node { id name createdAt } }
        }
      }
    }`,
    { projectId: PROJECT_ID },
  );
  return data.project.environments.edges
    .map((e) => e.node)
    .filter((n) => n.name.startsWith("preview-pr-"));
}

export async function createPreviewEnvironment(token, name) {
  const data = await railway(
    token,
    `mutation($input: EnvironmentCreateInput!) {
      environmentCreate(input: $input) { id name }
    }`,
    {
      input: {
        projectId: PROJECT_ID,
        name,
        sourceEnvironmentId: PRODUCTION_ENVIRONMENT_ID,
        ephemeral: true,
        skipInitialDeploys: true,
      },
    },
  );
  return data.environmentCreate;
}

export async function deleteEnvironment(token, environmentId) {
  await railway(token, `mutation($id: String!) { environmentDelete(id: $id) }`, {
    id: environmentId,
  });
}

// Shared by /merge, /close, and the pull_request_target teardown workflow so
// there's exactly one place that knows how to safely find-and-delete a PR's
// preview environment — in particular the production-id assertion, which a
// naming coincidence should never be able to bypass regardless of which
// caller triggered the teardown.
export async function tearDownPreviewEnvironment(token, prNumber) {
  const name = previewEnvironmentName(prNumber);
  const environment = await findEnvironmentByName(token, name);
  if (!environment) {
    return {
      deleted: false,
      name,
      note: `No preview environment was running for PR #${prNumber}.`,
    };
  }
  if (environment.id === PRODUCTION_ENVIRONMENT_ID) {
    throw new Error("refusing to delete: environment resolved to production");
  }
  await deleteEnvironment(token, environment.id);
  return { deleted: true, name, note: `Deleted preview environment \`${name}\`.` };
}

export async function listVolumeInstances(token, environmentId) {
  const data = await railway(
    token,
    `query($id: String!) {
      environment(id: $id) {
        volumeInstances { edges { node { serviceId } } }
      }
    }`,
    { id: environmentId },
  );
  return data.environment.volumeInstances.edges.map((e) => e.node);
}

export async function listServiceInstances(token, environmentId) {
  const data = await railway(
    token,
    `query($id: String!) {
      environment(id: $id) {
        serviceInstances {
          edges {
            node {
              serviceId
              serviceName
              domains { serviceDomains { domain } }
              hasEverDeployed
              latestDeployment { id status }
              source { image repo }
            }
          }
        }
      }
    }`,
    { id: environmentId },
  );
  return data.environment.serviceInstances.edges.map((e) => e.node);
}

export async function updateServiceInstance(token, serviceId, environmentId, input) {
  await railway(
    token,
    `mutation($serviceId: String!, $environmentId: String, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }`,
    { serviceId, environmentId, input },
  );
}

export async function deployServiceInstance(token, serviceId, environmentId) {
  const data = await railway(
    token,
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId },
  );
  return data.serviceInstanceDeployV2;
}

export async function deploymentLogs(token, deploymentId, limit = 30) {
  const data = await railway(
    token,
    `query($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        timestamp
        severity
        message
      }
    }`,
    { deploymentId, limit },
  );
  return data.deploymentLogs;
}

export async function generateServiceDomain(token, serviceId, environmentId, targetPort) {
  const data = await railway(
    token,
    `mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { domain }
    }`,
    { input: { serviceId, environmentId, targetPort } },
  );
  return data.serviceDomainCreate.domain;
}

export async function setVariables(
  token,
  environmentId,
  serviceId,
  variables,
  skipDeploys = true,
  replace = false,
) {
  await railway(
    token,
    `mutation($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }`,
    {
      input: {
        projectId: PROJECT_ID,
        environmentId,
        serviceId,
        variables,
        replace,
        skipDeploys,
      },
    },
  );
}

// Unlike buckets, volumeCreate's environmentId is genuinely implemented —
// verified live: creating one with serviceId + mountPath attaches it and
// triggers a redeploy in one step, no separate patch-commit needed.
export async function createVolume(token, environmentId, serviceId, mountPath) {
  const data = await railway(
    token,
    `mutation($input: VolumeCreateInput!) {
      volumeCreate(input: $input) { id name }
    }`,
    { input: { projectId: PROJECT_ID, environmentId, serviceId, mountPath } },
  );
  return data.volumeCreate;
}

export async function getVariables(token, environmentId, serviceId) {
  const data = await railway(
    token,
    `query($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId: PROJECT_ID, environmentId, serviceId },
  );
  return data.variables;
}

// BucketCreateInput.environmentId is documented "[unimplemented]" and really
// is a no-op — bucketCreate alone only creates a project-level record with
// no provisioned instance anywhere (confirmed live: bucketS3Credentials on
// it fails with "BucketInstance not found"). The instance that actually
// backs a bucket in a specific environment is provisioned separately,
// through the same staged-config/patch system the CLI's `railway config`
// uses: environmentPatchCommit with the bucket's own id as the key under
// `buckets` in the patch, isCreated: true. Also confirmed live.
export async function createBucket(token, environmentId, name, region = "sin") {
  const data = await railway(
    token,
    `mutation($input: BucketCreateInput!) {
      bucketCreate(input: $input) { id name }
    }`,
    { input: { projectId: PROJECT_ID, name } },
  );
  const bucket = data.bucketCreate;

  await railway(
    token,
    `mutation($environmentId: String!, $patch: EnvironmentConfig) {
      environmentPatchCommit(environmentId: $environmentId, patch: $patch)
    }`,
    {
      environmentId,
      patch: { buckets: { [bucket.id]: { region, isCreated: true } } },
    },
  );

  return bucket;
}

export async function bucketS3Credentials(token, bucketId, environmentId) {
  const data = await railway(
    token,
    `query($bucketId: String!, $environmentId: String!, $projectId: String!) {
      bucketS3Credentials(bucketId: $bucketId, environmentId: $environmentId, projectId: $projectId) {
        accessKeyId
        secretAccessKey
        endpoint
        region
        bucketName
      }
    }`,
    { bucketId, environmentId, projectId: PROJECT_ID },
  );
  return data.bucketS3Credentials[0];
}

// Buckets have no direct delete mutation — they're backed by a service
// (Bucket.parentServiceId), so removing them means deleting that service
// scoped to this environment. environmentDelete also cleans up everything
// else in the environment (services, volumes), so this is only needed if a
// bucket must be removed without tearing down the whole environment.
export async function deleteBucketService(token, parentServiceId, environmentId) {
  await railway(
    token,
    `mutation($id: String!, $environmentId: String) {
      serviceDelete(id: $id, environmentId: $environmentId)
    }`,
    { id: parentServiceId, environmentId },
  );
}
