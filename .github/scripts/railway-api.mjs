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
          edges { node { serviceId serviceName domains { serviceDomains { domain } } } }
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
  await railway(
    token,
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId },
  );
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

// Bucket<->environment binding is unimplemented on Railway's side as of this
// writing (BucketCreateInput.environmentId is documented "[unimplemented]"),
// so isolation from production comes purely from using a distinctly-named
// bucket and wiring its own credentials into the preview environment's vars
// — not from any environment-scoping the API would otherwise provide.
export async function createBucket(token, name) {
  const data = await railway(
    token,
    `mutation($input: BucketCreateInput!) {
      bucketCreate(input: $input) { id name }
    }`,
    { input: { projectId: PROJECT_ID, name } },
  );
  return data.bucketCreate;
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
