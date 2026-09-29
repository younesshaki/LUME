/**
 * The showcase tenants open in light mode the first time a browser visits
 * their dashboard. This is presentation-only: authentication and tenant
 * authorization remain entirely separate.
 */
const DEMO_DASHBOARD_TENANTS = new Set(["demo-sean", "demo-arash", "demo-max"]);

const STORAGE_PREFIX = "lume:demo-dashboard-theme-initialized:v1:";

export function demoDashboardThemeStorageKey(tenantSlug: string): string {
  return `${STORAGE_PREFIX}${tenantSlug}`;
}

export function shouldInitializeDemoDashboardLightMode(
  tenantSlug: string | null | undefined,
  hasInitialized: boolean,
): boolean {
  return Boolean(tenantSlug && DEMO_DASHBOARD_TENANTS.has(tenantSlug) && !hasInitialized);
}
