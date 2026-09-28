/**
 * Creates the three approved demo tenants from the live `demo` tenant.
 *
 * Usage (the password has no committed default):
 *   DEMO_TENANT_PASSWORD=... npx tsx scripts/prepare-demo-tenant-accounts.ts
 *
 * This is deliberately idempotent. It derives stable target ids from the
 * source record + target tenant, copies managed R2 objects to tenant-owned
 * paths, and never mutates the source `demo` tenant.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { presignR2Request } from "../apps/admin/lib/r2Signing";
import { readR2StorageConfig } from "../apps/admin/lib/r2Config";
import { brandingAssetObjectKey } from "../apps/admin/lib/brandingAssets";
import { publicUrl, TENANT_BUCKETS } from "@lume/db";

type DemoTenant = { slug: string; name: string; email: string; username: string };
const SOURCE_SLUG = "demo";
const LOGO_PATH = "/Users/younesshaki/Documents/LUME-demo-assets/glo3d-logo.png";
const DEMOS: DemoTenant[] = [
  { slug: "demo-sean", name: "Sean Auto Group", email: "sean@demo.lume.app", username: "sean" },
  { slug: "demo-arash", name: "Arash Motors", email: "arash@demo.lume.app", username: "arash" },
  { slug: "demo-max", name: "Max Auto", email: "max@demo.lume.app", username: "max" },
];

function fail(message: string): never { throw new Error(message); }
function envFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
function resolveProjectKeys() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) return;
  const result = spawnSync("npx", ["--yes", "supabase@2.109.1", "projects", "api-keys", "--project-ref", "atsgdjwjtmqvtotbrowu", "--reveal", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) fail("Unable to resolve project API keys. Authenticate the Supabase CLI or set runtime credentials.");
  let parsed: any;
  try { parsed = JSON.parse(result.stdout); } catch { fail("Supabase CLI returned invalid API key data."); }
  const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys ?? parsed?.keys ?? [];
  const value = (names: string[]) => keys.find((entry: any) => names.includes(String(entry?.name ?? entry?.type ?? entry?.role)))?.api_key
    ?? keys.find((entry: any) => names.includes(String(entry?.name ?? entry?.type ?? entry?.role)))?.key;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= value(["service_role"]);
  process.env.SUPABASE_ANON_KEY ??= value(["anon", "publishable"]);
  process.env.SUPABASE_URL ??= "https://atsgdjwjtmqvtotbrowu.supabase.co";
}
function uuid(seed: string) {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function cloneReplace<T>(value: T, sourceName: string, targetName: string): T {
  if (typeof value === "string") return value.split(sourceName).join(targetName) as T;
  if (Array.isArray(value)) return value.map((entry) => cloneReplace(entry, sourceName, targetName)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cloneReplace(entry, sourceName, targetName)])) as T;
  return value;
}
async function required<T>(label: string, value: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await value;
  if (error || data === null) fail(`${label}: ${error?.message ?? "no data returned"}`);
  return data;
}
async function requiredWrite(label: string, value: PromiseLike<{ error: any }>): Promise<void> {
  const { error } = await value;
  if (error) fail(`${label}: ${error.message}`);
}
async function optional<T>(label: string, value: PromiseLike<{ data: T | null; error: any }>): Promise<T | null> {
  const { data, error } = await value;
  if (error) fail(`${label}: ${error.message}`);
  return data;
}
function extension(contentType: string, key: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return key.endsWith(".jpg") ? "jpg" : "jpg";
}

async function copyR2Object(config: NonNullable<ReturnType<typeof readR2StorageConfig>>, sourceKey: string, targetKey: string, contentType: string, byteSize: number) {
  const get = presignR2Request({ ...config, key: sourceKey, method: "GET", expiresInSeconds: 60 });
  const source = await fetch(get.url, { method: get.method, signal: AbortSignal.timeout(20_000) });
  if (!source.ok) fail(`Read source R2 object failed (${source.status}) for managed image.`);
  const bytes = new Uint8Array(await source.arrayBuffer());
  if (bytes.byteLength !== byteSize) fail("Source R2 image size does not match its metadata.");
  const put = presignR2Request({ ...config, key: targetKey, method: "PUT", expiresInSeconds: 60, uploadHeaders: { contentType, contentLength: bytes.byteLength } });
  const saved = await fetch(put.url, { method: put.method, headers: { "content-type": contentType, "content-length": String(bytes.byteLength) }, body: bytes, signal: AbortSignal.timeout(20_000) });
  if (!saved.ok) fail(`Write target R2 object failed (${saved.status}) for managed image.`);
}

async function ensureUser(service: any, demo: DemoTenant, password: string) {
  let page = 1; let found: any = null;
  while (!found) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`List auth users: ${error.message}`);
    found = data.users.find((user: any) => user.email?.toLowerCase() === demo.email) ?? null;
    if (found || data.users.length < 200) break;
    page++;
  }
  if (found) {
    const { error } = await service.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    if (error) fail(`Update ${demo.email}: ${error.message}`);
  } else {
    const { data, error } = await service.auth.admin.createUser({ email: demo.email, password, email_confirm: true });
    if (error || !data.user) fail(`Create ${demo.email}: ${error?.message ?? "no user"}`);
    found = data.user;
  }
  await requiredWrite(`Upsert ${demo.username} profile`, service.from("profiles").upsert({ id: found.id, username: demo.username }, { onConflict: "id" }));
  return found.id as string;
}

function provision(repoRoot: string, demo: DemoTenant) {
  const result = spawnSync("npm", ["run", "create:tenant", "--", "--slug", demo.slug, "--name", demo.name, "--owner-email", demo.email], { cwd: repoRoot, env: process.env, stdio: "inherit" });
  if (result.status !== 0) fail(`Provision ${demo.slug} failed.`);
}

async function copyPages(service: any, source: any, target: any, targetName: string) {
  const pages = await required<any[]>("Read demo pages", service.from("pages").select("*").eq("tenant_id", source.id).order("nav_order"));
  const revisions = await required<any[]>("Read demo page revisions", service.from("page_revisions").select("*").eq("tenant_id", source.id));
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  for (const page of pages) {
    const targetPage = await required<any>(`Upsert ${page.slug}`, service.from("pages").upsert({ tenant_id: target.id, slug: page.slug, title: cloneReplace(page.title, source.name, targetName), nav_order: page.nav_order, is_reserved: page.is_reserved, seo_meta: cloneReplace(page.seo_meta, source.name, targetName), archived_at: page.archived_at }, { onConflict: "tenant_id,slug" }).select("id").single());
    const pointers: Record<string, string | null> = {};
    for (const [key, sourceRevisionId] of [["draft_revision_id", page.draft_revision_id], ["published_revision_id", page.published_revision_id]] as const) {
      if (!sourceRevisionId) { pointers[key] = null; continue; }
      const revision = revisionById.get(sourceRevisionId); if (!revision) fail(`Missing ${key} for ${page.slug}.`);
      const id = uuid(`demo-page-revision:${target.id}:${revision.id}`);
      await requiredWrite(`Copy ${key} for ${page.slug}`, service.from("page_revisions").upsert({ id, page_id: targetPage.id, tenant_id: target.id, kind: revision.kind, blocks: cloneReplace(revision.blocks, source.name, targetName), created_by: null }, { onConflict: "id" }));
      pointers[key] = id;
    }
    await requiredWrite(`Point ${page.slug} revisions`, service.from("pages").update(pointers).eq("id", targetPage.id));
  }
}

async function readAllTenantRows(service: any, label: string, table: string, tenantId: string) {
  const rows: any[] = [];
  for (let start = 0; ; start += 1000) {
    const page = await required<any[]>(label, service.from(table).select("*").eq("tenant_id", tenantId).range(start, start + 999));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function copyVehicles(service: any, source: any, target: any, targetSlug: string) {
  const vehicles = await readAllTenantRows(service, "Read demo vehicles", "vehicles", source.id);
  const images = await required<any[]>("Read demo managed images", service.from("vehicle_images").select("*").eq("tenant_id", source.id).order("vehicle_id").order("is_primary", { ascending: false }).order("sort_order"));
  const config = readR2StorageConfig(); if (!config) fail("R2 storage configuration is unavailable.");
  const idMap = new Map<string, string>();
  const vehicleCopies = vehicles.map((vehicle) => {
    const id = uuid(`demo-vehicle:${target.id}:${vehicle.id}`); idMap.set(vehicle.id, id);
    const { id: _id, tenant_id: _tenant, search_vector: _search, created_at: _created, updated_at: _updated, ...copy } = vehicle;
    return { ...copy, id, tenant_id: target.id };
  });
  for (let start = 0; start < vehicleCopies.length; start += 200) {
    await requiredWrite("Copy demo vehicle batch", service.from("vehicles").upsert(vehicleCopies.slice(start, start + 200), { onConflict: "id" }));
  }
  for (const image of images) {
    const vehicleId = idMap.get(image.vehicle_id); if (!vehicleId) fail("Managed image points to a missing demo vehicle.");
    const targetId = uuid(`demo-vehicle-image:${target.id}:${image.id}`);
    const targetKey = `${targetSlug}/vehicles/${vehicleId}/${targetId}.${extension(image.content_type, image.r2_key)}`;
    const existing = await optional<any>("Read copied managed image", service.from("vehicle_images").select("id").eq("id", targetId).maybeSingle());
    if (!existing) {
      await copyR2Object(config, image.r2_key, targetKey, image.content_type, image.byte_size);
      const { id: _id, tenant_id: _tenant, vehicle_id: _vehicle, r2_key: _key, sort_order: _sort, is_primary: _primary, created_at: _created, updated_at: _updated, ...copy } = image;
      await requiredWrite("Copy managed image metadata", service.from("vehicle_images").insert({ ...copy, id: targetId, tenant_id: target.id, vehicle_id: vehicleId, r2_key: targetKey }));
    }
  }
  return { vehicles: vehicles.length, images: images.length };
}

async function applyLogoAndTheme(service: any, source: any, target: any, demo: DemoTenant, logoBytes: Uint8Array, logoVersion: number) {
  const key = brandingAssetObjectKey(target.id, "logo");
  await requiredWrite(`Upload ${demo.slug} logo`, service.storage.from(TENANT_BUCKETS.logos).upload(key, logoBytes, { upsert: true, contentType: "image/png", cacheControl: "3600" }));
  const logoUrl = `${publicUrl(service, TENANT_BUCKETS.logos, key)}?v=${logoVersion}`;
  const copiedTheme = cloneReplace(source.theme ?? {}, source.name, demo.name) as Record<string, any>;
  const branding = { ...(copiedTheme.branding ?? {}), logoUrl };
  await requiredWrite(`Apply ${demo.slug} theme`, service.from("tenants").update({ name: demo.name, theme: { ...copiedTheme, branding } }).eq("id", target.id));
}

async function verifyIsolation(url: string, anonKey: string, password: string, own: any, other: any, email: string) {
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) fail(`Login verification for ${email} failed.`);
  const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const ownRows = await required<any[]>("RLS own tenant read", client.from("tenants").select("id").eq("id", own.id));
  const foreignRows = await required<any[]>("RLS foreign tenant read", client.from("tenants").select("id").eq("id", other.id));
  if (ownRows.length !== 1 || foreignRows.length !== 0) fail("Tenant RLS read isolation failed.");
  const foreignVehicles = await required<any[]>("RLS foreign inventory read", client.from("vehicles").select("id").eq("tenant_id", other.id));
  const foreignPages = await required<any[]>("RLS foreign page read", client.from("pages").select("id").eq("tenant_id", other.id));
  const foreignLeads = await required<any[]>("RLS foreign lead read", client.from("leads").select("id").eq("tenant_id", other.id));
  const ownSettings = await required<any[]>("RLS own settings read", client.from("tenant_settings").select("tenant_id").eq("tenant_id", own.id));
  const foreignSettings = await required<any[]>("RLS foreign settings read", client.from("tenant_settings").select("tenant_id").eq("tenant_id", other.id));
  if (foreignVehicles.length || foreignPages.length || foreignLeads.length || ownSettings.length !== 1 || foreignSettings.length) fail("Tenant RLS table isolation failed.");
  const crossTenantWrite = await client.from("tenant_settings").update({ lead_assignment_mode: "manual" }).eq("tenant_id", other.id).select("tenant_id");
  if (crossTenantWrite.data?.length) fail("Tenant RLS write isolation failed.");
  const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonVehicles = await required<any[]>("Anonymous tenant inventory read", anonymous.from("vehicles").select("tenant_id").eq("tenant_id", own.id).limit(1));
  if (anonVehicles.length !== 1 || anonVehicles.some((row) => row.tenant_id !== own.id)) fail("Anonymous inventory scope failed.");
}

async function main() {
  const repoRoot = resolve(import.meta.dirname, "..");
  envFile(resolve(repoRoot, "apps/admin/.env.local")); envFile(resolve(repoRoot, ".env.local"));
  resolveProjectKeys();
  const password = process.env.DEMO_TENANT_PASSWORD; if (!password) fail("DEMO_TENANT_PASSWORD is required at runtime.");
  const url = process.env.SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) fail("Supabase service and browser credentials are required in the local environment.");
  if (!existsSync(LOGO_PATH) || statSync(LOGO_PATH).size > 2 * 1024 * 1024) fail("Approved logo is missing or exceeds the 2 MB upload policy.");
  const logoBytes = new Uint8Array(readFileSync(LOGO_PATH)); if (logoBytes[0] !== 0x89 || logoBytes[1] !== 0x50) fail("Approved logo is not a PNG.");
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const source = await required<any>("Load source demo tenant", service.from("tenants").select("*").eq("slug", SOURCE_SLUG).single());
  const ownerIds = new Map<string, string>();
  for (const demo of DEMOS) ownerIds.set(demo.slug, await ensureUser(service, demo, password));
  for (const demo of DEMOS) provision(repoRoot, demo);
  const targets = new Map<string, any>();
  for (const demo of DEMOS) {
    const target = await required<any>(`Load ${demo.slug}`, service.from("tenants").select("*").eq("slug", demo.slug).single());
    if (target.id === source.id) fail("Source and target tenant must differ.");
    targets.set(demo.slug, target);
    await applyLogoAndTheme(service, source, target, demo, logoBytes, statSync(LOGO_PATH).mtimeMs);
    await copyPages(service, source, target, demo.name);
    const copied = await copyVehicles(service, source, target, demo.slug);
    console.log(`✓ ${demo.slug}: ${copied.vehicles} vehicles, ${copied.images} managed images copied`);
  }
  for (let index = 0; index < DEMOS.length; index++) {
    const demo = DEMOS[index]; const own = targets.get(demo.slug)!; const other = targets.get(DEMOS[(index + 1) % DEMOS.length].slug)!;
    await verifyIsolation(url, anonKey, password, own, other, demo.email);
    console.log(`✓ ${demo.slug}: login and RLS isolation verified`);
  }
}

main().catch((error) => { console.error(`✖ ${error instanceof Error ? error.message : String(error)}`); process.exit(1); });
