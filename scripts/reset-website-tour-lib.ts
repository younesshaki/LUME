import { isWebsiteTourEligibleTenant } from "../apps/admin/lib/websiteTour";

export type ResetWebsiteTourArgs = {
  tenantSlug: string;
  apply: boolean;
};

export function parseResetWebsiteTourArgs(argv: readonly string[]): ResetWebsiteTourArgs {
  const tenantFlag = argv.indexOf("--tenant");
  const tenantSlug = tenantFlag >= 0 ? argv[tenantFlag + 1]?.trim().toLowerCase() : undefined;
  if (!tenantSlug || !/^[a-z0-9][a-z0-9-]*$/.test(tenantSlug)) {
    throw new Error("Provide an eligible demo tenant with --tenant <slug>.");
  }
  if (!isWebsiteTourEligibleTenant(tenantSlug)) {
    throw new Error("Website-tour reset is restricted to an enabled demo tenant.");
  }
  return { tenantSlug, apply: argv.includes("--apply") };
}
