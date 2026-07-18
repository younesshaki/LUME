import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

/**
 * Usage:
 *   npm run staging:refresh-from-prod -- --dry-run
 *   npm run staging:refresh-from-prod
 *
 * The command uses the authenticated, pinned Supabase CLI to resolve keys by
 * default. CI can instead inject LUME_PRODUCTION_SUPABASE_SERVICE_ROLE_KEY and
 * LUME_STAGING_SUPABASE_SERVICE_ROLE_KEY. Neither credential is persisted.
 */

export const PRODUCTION_PROJECT_REF = "atsgdjwjtmqvtotbrowu";
export const STAGING_PROJECT_REF = "hapyyupeugxccofpibor";
export const TENANT_SLUG = "demo";
export const STAGING_OWNER_EMAIL = "hakicsi89@gmail.com";
export const SUPABASE_CLI_VERSION = "2.109.1";

const PAGE_SIZE = 500;
const INSERT_BATCH_SIZE = 250;
const PRODUCTION_KEY_ENV = "LUME_PRODUCTION_SUPABASE_SERVICE_ROLE_KEY";
const STAGING_KEY_ENV = "LUME_STAGING_SUPABASE_SERVICE_ROLE_KEY";

const SOURCE_TABLES = [
  ["tenant_members", "user_id"],
  ["vehicles", "id"],
  ["vehicle_images", "id"],
  ["visitors", "id"],
  ["visitor_saved_vehicles", "id"],
];

const CLEAR_ORDER = [
  "conversion_events",
  "visitor_saved_vehicles",
  "vehicle_images",
  "vehicles",
  "visitors",
  "tenant_members",
];

function projectUrl(projectRef) {
  return `https://${projectRef}.supabase.co`;
}

export function assertProjectUrl(url, expectedRef, label) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`${label} Supabase URL is invalid.`);
  }
  if (hostname !== `${expectedRef}.supabase.co`) {
    throw new Error(`${label} must target Supabase project ${expectedRef}; received ${hostname}.`);
  }
  return url;
}

/**
 * Production credentials may be privileged, so enforce least privilege in
 * code as well: the source client physically cannot issue a mutating request.
 */
export function createReadOnlyFetch(fetchImplementation = globalThis.fetch) {
  return async (input, init = {}) => {
    const requestMethod = input instanceof Request ? input.method : "GET";
    const method = String(init.method ?? requestMethod).toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      throw new Error(`Production Supabase request blocked: ${method} is not read-only.`);
    }
    return fetchImplementation(input, init);
  };
}

export function mapTenantMemberships(
  productionMemberships,
  productionUsers,
  stagingUsers,
  stagingTenantId,
  requiredOwnerEmail = STAGING_OWNER_EMAIL,
) {
  const productionUsersById = new Map(productionUsers.map((user) => [user.id, user]));
  const stagingUsersByEmail = new Map(
    stagingUsers.flatMap((user) => {
      const email = normalizeEmail(user.email);
      return email ? [[email, user]] : [];
    }),
  );

  const mapped = [];
  let skipped = 0;
  let requiredOwnerMapped = false;
  for (const membership of productionMemberships) {
    const productionUser = productionUsersById.get(membership.user_id);
    const email = normalizeEmail(productionUser?.email);
    const stagingUser = email ? stagingUsersByEmail.get(email) : undefined;
    if (!stagingUser) {
      skipped += 1;
      continue;
    }
    mapped.push({
      ...membership,
      tenant_id: stagingTenantId,
      user_id: stagingUser.id,
    });
    if (email === normalizeEmail(requiredOwnerEmail) && membership.role === "owner") {
      requiredOwnerMapped = true;
    }
  }

  if (!requiredOwnerMapped) {
    throw new Error(
      `Staging auth must contain ${requiredOwnerEmail} and production must list that user as demo owner.`,
    );
  }
  return { mapped, skipped };
}

export function retargetTenantRows(rows, stagingTenantId) {
  return rows.map((row) => ({ ...row, tenant_id: stagingTenantId }));
}

export function prepareVehicleRows(rows, stagingTenantId) {
  return rows.map((row) => {
    const { search_vector: _generatedSearchVector, ...writable } = row;
    return { ...writable, tenant_id: stagingTenantId };
  });
}

export function orderVehicleImages(rows) {
  return [...rows].sort((left, right) => {
    const vehicle = String(left.vehicle_id).localeCompare(String(right.vehicle_id));
    if (vehicle !== 0) return vehicle;
    const primary = Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary));
    if (primary !== 0) return primary;
    const sortOrder = Number(left.sort_order) - Number(right.sort_order);
    if (sortOrder !== 0) return sortOrder;
    const createdAt = String(left.created_at).localeCompare(String(right.created_at));
    return createdAt || String(left.id).localeCompare(String(right.id));
  });
}

export function parseServiceRoleKey(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys ?? parsed?.keys ?? [];
  const serviceRole = keys.find(
    (entry) => (entry?.name ?? entry?.type ?? entry?.role) === "service_role",
  );
  const value = serviceRole?.api_key ?? serviceRole?.key ?? serviceRole?.value;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Supabase CLI did not return a service-role key.");
  }
  return value.trim();
}

async function resolveServiceRoleKey(projectRef, environmentName) {
  const configured = process.env[environmentName]?.trim();
  if (configured) return configured;

  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    executable,
    [
      "--yes",
      `supabase@${SUPABASE_CLI_VERSION}`,
      "projects",
      "api-keys",
      "--project-ref",
      projectRef,
      "--reveal",
      "--output",
      "json",
    ],
    {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw new Error(`Unable to run Supabase CLI: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `Unable to resolve ${projectRef} API keys. Authenticate the Supabase CLI or set ${environmentName}.`,
    );
  }
  return parseServiceRoleKey(result.stdout);
}

function createSupabaseClients(productionKey, stagingKey) {
  const productionUrl = assertProjectUrl(
    projectUrl(PRODUCTION_PROJECT_REF),
    PRODUCTION_PROJECT_REF,
    "Production source",
  );
  const stagingUrl = assertProjectUrl(
    projectUrl(STAGING_PROJECT_REF),
    STAGING_PROJECT_REF,
    "Staging target",
  );
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  return {
    production: createClient(productionUrl, productionKey, {
      auth,
      global: { fetch: createReadOnlyFetch() },
    }),
    staging: createClient(stagingUrl, stagingKey, { auth }),
  };
}

async function requireResult(label, promise) {
  const result = await promise;
  if (result.error) {
    const code = result.error.code ? ` (${result.error.code})` : "";
    throw new Error(`${label} failed${code}: ${result.error.message}`);
  }
  return result.data;
}

async function loadTenant(client, slug, label) {
  const tenant = await requireResult(
    `Load ${label} tenant`,
    client.from("tenants").select("*").eq("slug", slug).maybeSingle(),
  );
  if (!tenant) throw new Error(`${label} tenant ${slug} does not exist.`);
  return tenant;
}

async function loadTenantRows(client, table, tenantId, orderColumn) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await requireResult(
      `Read production ${table}`,
      client
        .from(table)
        .select("*")
        .eq("tenant_id", tenantId)
        .order(orderColumn, { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1),
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listAllAuthUsers(client, label) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Read ${label} auth users failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function sourceSnapshot(client, tenantId) {
  const entries = await Promise.all(
    SOURCE_TABLES.map(async ([table, orderColumn]) => [
      table,
      await loadTenantRows(client, table, tenantId, orderColumn),
    ]),
  );
  return Object.fromEntries(entries);
}

function sourceCounts(snapshot) {
  return {
    tenant_members: snapshot.tenant_members.length,
    vehicles: snapshot.vehicles.length,
    vehicle_images: snapshot.vehicle_images.length,
    visitors: snapshot.visitors.length,
    visitor_saved_vehicles: snapshot.visitor_saved_vehicles.length,
    conversion_events: 0,
  };
}

async function clearStagingTenant(client, tenantId) {
  for (const table of CLEAR_ORDER) {
    await requireResult(
      `Clear staging ${table}`,
      client.from(table).delete().eq("tenant_id", tenantId),
    );
  }
}

async function insertInBatches(client, table, rows) {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    await requireResult(
      `Insert staging ${table}`,
      client.from(table).insert(rows.slice(offset, offset + INSERT_BATCH_SIZE)),
    );
  }
}

async function insertVehicleImages(client, images, tenantId) {
  const ordered = orderVehicleImages(images);
  for (const image of ordered) {
    await requireResult(
      "Insert staging vehicle image",
      client.from("vehicle_images").insert({ ...image, tenant_id: tenantId }),
    );
  }
  if (ordered.length === 0) return;

  // The table's safety trigger assigns append order and first-primary during
  // insert. Restore the production metadata after every object is present.
  await requireResult(
    "Clear temporary staging image primaries",
    client.from("vehicle_images").update({ is_primary: false }).eq("tenant_id", tenantId),
  );
  for (const image of ordered) {
    await requireResult(
      "Restore staging vehicle image order",
      client
        .from("vehicle_images")
        .update({ sort_order: image.sort_order, is_primary: image.is_primary })
        .eq("tenant_id", tenantId)
        .eq("id", image.id),
    );
  }
}

async function countStagingRows(client, tenantId) {
  const tables = [...SOURCE_TABLES.map(([table]) => table), "conversion_events"];
  const entries = await Promise.all(
    tables.map(async (table) => {
      const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (error) throw new Error(`Count staging ${table} failed: ${error.message}`);
      return [table, count ?? 0];
    }),
  );
  return Object.fromEntries(entries);
}

function assertCounts(actual, expected) {
  for (const [table, count] of Object.entries(expected)) {
    if (actual[table] !== count) {
      throw new Error(`Staging ${table} count mismatch: expected ${count}, received ${actual[table]}.`);
    }
  }
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function refreshStagingFromProduction({ dryRun = false } = {}) {
  const [productionKey, stagingKey] = await Promise.all([
    resolveServiceRoleKey(PRODUCTION_PROJECT_REF, PRODUCTION_KEY_ENV),
    resolveServiceRoleKey(STAGING_PROJECT_REF, STAGING_KEY_ENV),
  ]);
  const { production, staging } = createSupabaseClients(productionKey, stagingKey);
  const [productionTenant, stagingTenant] = await Promise.all([
    loadTenant(production, TENANT_SLUG, "production"),
    loadTenant(staging, TENANT_SLUG, "staging"),
  ]);
  const [snapshot, productionUsers, stagingUsers] = await Promise.all([
    sourceSnapshot(production, productionTenant.id),
    listAllAuthUsers(production, "production"),
    listAllAuthUsers(staging, "staging"),
  ]);
  const membershipMapping = mapTenantMemberships(
    snapshot.tenant_members,
    productionUsers,
    stagingUsers,
    stagingTenant.id,
  );
  const expectedCounts = {
    ...sourceCounts(snapshot),
    tenant_members: membershipMapping.mapped.length,
  };

  console.log(`[staging-refresh] source ${JSON.stringify(sourceCounts(snapshot))}`);
  console.log(
    `[staging-refresh] mapped ${membershipMapping.mapped.length} tenant member(s); skipped ${membershipMapping.skipped}`,
  );
  if (dryRun) {
    console.log("[staging-refresh] dry run complete; staging was not modified");
    return { dryRun: true, source: sourceCounts(snapshot), expected: expectedCounts };
  }

  const { id: _productionTenantId, ...productionTenantValues } = productionTenant;
  await requireResult(
    "Update staging tenant",
    staging.from("tenants").update(productionTenantValues).eq("id", stagingTenant.id),
  );
  await clearStagingTenant(staging, stagingTenant.id);
  await insertInBatches(staging, "tenant_members", membershipMapping.mapped);
  await insertInBatches(
    staging,
    "vehicles",
    prepareVehicleRows(snapshot.vehicles, stagingTenant.id),
  );
  await insertVehicleImages(staging, snapshot.vehicle_images, stagingTenant.id);
  await insertInBatches(
    staging,
    "visitors",
    retargetTenantRows(snapshot.visitors, stagingTenant.id),
  );
  await insertInBatches(
    staging,
    "visitor_saved_vehicles",
    retargetTenantRows(snapshot.visitor_saved_vehicles, stagingTenant.id),
  );

  const actualCounts = await countStagingRows(staging, stagingTenant.id);
  assertCounts(actualCounts, expectedCounts);
  console.log(`[staging-refresh] staging ${JSON.stringify(actualCounts)}`);
  console.log(
    `[staging-refresh] complete; production transport allowed GET/HEAD only and staging tenant id remains ${stagingTenant.id}`,
  );
  return { dryRun: false, source: sourceCounts(snapshot), staging: actualCounts };
}

async function main() {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
  }
  await refreshStagingFromProduction({ dryRun: process.argv.includes("--dry-run") });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[staging-refresh] ${error instanceof Error ? error.message : "Unknown failure"}`);
    process.exitCode = 1;
  });
}
