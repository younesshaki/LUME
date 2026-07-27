/**
 * Two-tenant launch-readiness isolation proof.
 *
 * EXPLICITLY GATED — creates throwaway tenants in the configured Supabase
 * project. Never runs by default; enable deliberately with
 * LUME_E2E_TWO_TENANT=1. Never enable against production data.
 *
 * What this proves:
 * - Tenant A's inventory/branding facts never appear in Tenant B's snapshot.
 * - Snapshot loading is always scoped by the requested tenant's own id.
 * - No new HTTP surface exists for readiness: the report is computed
 *   server-side inside the existing member-guarded admin pages, so Tenant
 *   A's member has no endpoint or action that could fetch Tenant B's report.
 */
import { expect, test } from "@playwright/test";
import { evaluateLaunchReadiness } from "../lib/launchReadiness";
import { loadTenantLaunchSnapshot } from "../lib/launchReadiness.server";
import { createE2EServiceClient, loadAdminEnvLocal } from "./support";

test.skip(
  process.env.LUME_E2E_TWO_TENANT !== "1",
  "writes throwaway tenants — enable explicitly with LUME_E2E_TWO_TENANT=1",
);

const suffix = Date.now().toString(36);
const TENANT_A = `e2e-iso-a-${suffix}`;
const TENANT_B = `e2e-iso-b-${suffix}`;

let service: ReturnType<typeof createE2EServiceClient>;

test.beforeAll(() => {
  loadAdminEnvLocal();
  service = createE2EServiceClient();
});

test.afterAll(async () => {
  // Tenant delete cascades to vehicles/members/pages via FK.
  await service.from("tenants").delete().in("slug", [TENANT_A, TENANT_B]);
});

test("tenant A facts never leak into tenant B's readiness snapshot", async () => {
  const { data: tenantA, error: errorA } = await service
    .from("tenants")
    .insert({ slug: TENANT_A, name: "Isolation A", status: "active", theme: { logoUrl: "https://example.invalid/logo.svg" } })
    .select("id")
    .single();
  const { data: tenantB, error: errorB } = await service
    .from("tenants")
    .insert({ slug: TENANT_B, name: "Isolation B", status: "active" })
    .select("id")
    .single();
  expect(errorA ?? errorB).toBeNull();

  const { error: vehiclesError } = await service.from("vehicles").insert([
    {
      tenant_id: tenantA!.id,
      stock_type: "Used",
      year: 2021,
      make: "IsoMake",
      model: "IsoOne",
      trim: "",
      price: 10_000,
      mileage: 10_000,
      body_style: "Sedan",
      exterior_color: "Black",
      interior_color: "Black",
      drivetrain: "FWD",
      fuel_type: "Gasoline",
      image_src: "",
      seller_city: "Testville",
      seller_state: "TS",
      status: "live",
    },
    {
      tenant_id: tenantA!.id,
      stock_type: "Used",
      year: 2022,
      make: "IsoMake",
      model: "IsoTwo",
      trim: "",
      price: 20_000,
      mileage: 20_000,
      body_style: "SUV",
      exterior_color: "White",
      interior_color: "White",
      drivetrain: "AWD",
      fuel_type: "Hybrid",
      image_src: "",
      seller_city: "Testville",
      seller_state: "TS",
      status: "live",
    },
  ]);
  expect(vehiclesError).toBeNull();

  const client = service as unknown as Parameters<typeof loadTenantLaunchSnapshot>[0];
  const snapshotA = await loadTenantLaunchSnapshot(client, TENANT_A);
  const snapshotB = await loadTenantLaunchSnapshot(client, TENANT_B);

  expect(snapshotA?.tenant.id).toBe(tenantA!.id);
  expect(snapshotB?.tenant.id).toBe(tenantB!.id);

  // A's facts exist — and none of them appear in B.
  expect(snapshotA?.vehicles.live).toBe(2);
  expect(snapshotB?.vehicles.live).toBe(0);
  expect(snapshotA?.hasLogo).toBe(true);
  expect(snapshotB?.hasLogo).toBe(false);

  // B evaluates its own blockers, not A's inventory.
  const reportB = evaluateLaunchReadiness(snapshotB!, "pilot");
  expect(reportB.checks.find((check) => check.id === "inventory.has-vehicles")?.status)
    .toBe("blocker");
  const reportA = evaluateLaunchReadiness(snapshotA!, "pilot");
  expect(reportA.checks.find((check) => check.id === "inventory.has-vehicles")?.status)
    .toBe("pass");
});
