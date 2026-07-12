// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isSubdomainRoutingEnabled,
  legacyTenantSlugFromHost,
  tenantSlugFromHost,
} from "./subdomainRouting";

describe("subdomain routing", () => {
  it("is enabled only by an explicit true value", () => {
    expect(isSubdomainRoutingEnabled("true")).toBe(true);
    expect(isSubdomainRoutingEnabled(" TRUE ")).toBe(true);
    expect(isSubdomainRoutingEnabled(undefined)).toBe(false);
    expect(isSubdomainRoutingEnabled("1")).toBe(false);
    expect(isSubdomainRoutingEnabled("false")).toBe(false);
  });

  it("extracts one valid tenant label under the configured root", () => {
    expect(tenantSlugFromHost("atelier.lume.app", "lume.app")).toBe("atelier");
    expect(tenantSlugFromHost("ATELIER.LUME.LOCAL:5173", "lume.local")).toBe("atelier");
  });

  it("rejects apex, unrelated, nested, reserved, and malformed hosts", () => {
    expect(tenantSlugFromHost("lume.app", "lume.app")).toBeNull();
    expect(tenantSlugFromHost("atelier.example.com", "lume.app")).toBeNull();
    expect(tenantSlugFromHost("nested.atelier.lume.app", "lume.app")).toBeNull();
    expect(tenantSlugFromHost("admin.lume.app", "lume.app")).toBeNull();
    expect(tenantSlugFromHost("-invalid.lume.app", "lume.app")).toBeNull();
    expect(tenantSlugFromHost("atelier.lume.app,evil.example", "lume.app")).toBeNull();
  });

  it("retains the existing permissive public API fallback", () => {
    expect(legacyTenantSlugFromHost("atelier.lume.example")).toBe("atelier");
    expect(legacyTenantSlugFromHost("lume.example")).toBeNull();
    expect(legacyTenantSlugFromHost("www.lume.example")).toBeNull();
  });
});
