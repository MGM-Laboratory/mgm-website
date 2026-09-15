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
  return `preview-pr-${prNumber}`;
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

export async function setVariables(token, environmentId, serviceId, variables, skipDeploys = true) {
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
        replace: false, // merge into the duplicated environment's existing vars
        skipDeploys,
      },
    },
  );
}

export async function findBucketByName(token, name) {
  const data = await railway(
    token,
    `query($projectId: String!) {
      project(id: $projectId) {
        buckets { edges { node { id name } } }
      }
    }`,
    { projectId: PROJECT_ID },
  );
  return data.project.buckets.edges.map((e) => e.node).find((n) => n.name === name) ?? null;
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
