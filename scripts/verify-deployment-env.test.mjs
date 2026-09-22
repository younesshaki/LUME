// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  expectedEnvironment,
  supabaseProjectRef,
  validateAdminWorkerSecrets,
  validateSharedConversationMemory,
  validateDeploymentEnvironment,
} from "./verify-deployment-env.mjs";

const productionUrl = "https://atsgdjwjtmqvtotbrowu.supabase.co";
const stagingUrl = "https://abcdefghijklmnopqrst.supabase.co";

describe("deployment environment validation", () => {
  it("detects production and staging from Vercel metadata", () => {
    expect(expectedEnvironment({ VERCEL_ENV: "production" })).toBe("production");
    expect(expectedEnvironment({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" })).toBe(
      "staging",
    );
  });

  it("extracts Supabase project refs from valid URLs", () => {
    expect(supabaseProjectRef(stagingUrl)).toBe("abcdefghijklmnopqrst");
    expect(supabaseProjectRef("https://example.com")).toBeNull();
  });

  it("accepts a production environment targeting production", () => {
    expect(
      validateDeploymentEnvironment({
        LUME_ENVIRONMENT: "production",
        SUPABASE_URL: productionUrl,
        NEXT_PUBLIC_SUPABASE_URL: productionUrl,
      }, "production"),
    ).toEqual([]);
  });

  it("accepts an isolated staging project", () => {
    expect(
      validateDeploymentEnvironment({
        LUME_ENVIRONMENT: "staging",
        SUPABASE_URL: stagingUrl,
        VITE_SUPABASE_URL: stagingUrl,
      }, "staging"),
    ).toEqual([]);
  });

  it("fails closed when staging points at production", () => {
    expect(
      validateDeploymentEnvironment({
        LUME_ENVIRONMENT: "staging",
        SUPABASE_URL: productionUrl,
      }, "staging"),
    ).toContain("Staging must not target the production Supabase project");
  });

  it("rejects split browser and server Supabase projects", () => {
    expect(
      validateDeploymentEnvironment({
        LUME_ENVIRONMENT: "staging",
        SUPABASE_URL: stagingUrl,
        NEXT_PUBLIC_SUPABASE_URL: productionUrl,
      }, "staging"),
    ).toContain("All configured Supabase URLs must target the same project");
  });
});

describe("admin worker secrets", () => {
  const adminProduction = {
    LUME_ENVIRONMENT: "production",
    SUPABASE_URL: productionUrl,
    NEXT_PUBLIC_SUPABASE_URL: productionUrl,
    CRON_SECRET: "cron",
    WEBHOOK_ENCRYPTION_KEY: "webhook",
    INVENTORY_INTEGRATION_ENCRYPTION_KEY: "inventory",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  };

  it("accepts a fully configured admin production build", () => {
    expect(validateDeploymentEnvironment(adminProduction, "production", "admin")).toEqual([]);
  });

  // The regression this whole guard exists for: on 2026-07-28 CRON_SECRET was
  // absent from production and all eight cron workers had been dead since
  // launch. A build with no CRON_SECRET must never succeed again.
  it("fails the admin production build when CRON_SECRET is missing", () => {
    const { CRON_SECRET: _omitted, ...withoutCronSecret } = adminProduction;
    expect(validateDeploymentEnvironment(withoutCronSecret, "production", "admin")).toContain(
      "CRON_SECRET is required in production — every /api/cron/* worker returns 503 without it",
    );
  });

  it("treats a whitespace-only secret as missing", () => {
    expect(
      validateDeploymentEnvironment({ ...adminProduction, WEBHOOK_ENCRYPTION_KEY: "   " }, "production", "admin")
        .some((error) => error.startsWith("WEBHOOK_ENCRYPTION_KEY")),
    ).toBe(true);
  });

  it("reports every missing subsystem secret at once", () => {
    const errors = validateDeploymentEnvironment(
      { LUME_ENVIRONMENT: "production", SUPABASE_URL: productionUrl, NEXT_PUBLIC_SUPABASE_URL: productionUrl },
      "production",
      "admin",
    );
    for (const key of [
      "CRON_SECRET",
      "WEBHOOK_ENCRYPTION_KEY",
      "INVENTORY_INTEGRATION_ENCRYPTION_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(errors.some((error) => error.startsWith(key))).toBe(true);
    }
  });

  // The public Vite build shares this script and has none of these secrets.
  it("does not require admin secrets for the public build", () => {
    expect(
      validateDeploymentEnvironment(
        { LUME_ENVIRONMENT: "production", SUPABASE_URL: productionUrl, VITE_SUPABASE_URL: productionUrl },
        "production",
      ),
    ).toEqual([]);
  });

  // Preview and staging deploy without live worker credentials by design.
  it("does not require admin secrets outside production", () => {
    expect(
      validateDeploymentEnvironment(
        { LUME_ENVIRONMENT: "staging", SUPABASE_URL: stagingUrl },
        "staging",
        "admin",
      ),
    ).toEqual([]);
  });

  it("warns rather than fails for feature-gated keys", () => {
    const { errors, warnings } = validateAdminWorkerSecrets(adminProduction, "admin", "production");
    expect(errors).toEqual([]);
    expect(warnings.some((warning) => warning.startsWith("ANTHROPIC_API_KEY"))).toBe(true);
  });
});

describe("shared conversation memory readiness", () => {
  const staging = { LUME_ENVIRONMENT: "staging" };

  it("reports shared mode with no warning when both values are present", () => {
    const result = validateSharedConversationMemory(
      { ...staging, UPSTASH_REDIS_REST_URL: "x", UPSTASH_REDIS_REST_TOKEN: "y" },
      "admin",
      "staging",
    );
    expect(result.warnings).toEqual([]);
    expect(result.mode).toBe("shared");
  });

  it("warns rather than fails when neither is present", () => {
    // The product is designed to survive this, and as of 2026-09-16 every
    // LUME environment runs without them. A hard error would break every
    // deploy over a degradation that is already the status quo.
    const result = validateSharedConversationMemory(staging, "admin", "staging");
    expect(result.mode).toBe("local");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/per-instance/);
  });

  it("calls out a half-provisioned pair specifically", () => {
    // One value without the other is almost always an interrupted setup, not
    // a decision, and the store stays off either way.
    const result = validateSharedConversationMemory(
      { ...staging, UPSTASH_REDIS_REST_URL: "x" },
      "admin",
      "staging",
    );
    expect(result.mode).toBe("local");
    expect(result.warnings[0]).toMatch(/half-finished provisioning/);
  });

  it("never echoes a configured value", () => {
    const result = validateSharedConversationMemory(
      { ...staging, UPSTASH_REDIS_REST_URL: "https://secret-host.upstash.io" },
      "admin",
      "staging",
    );
    expect(result.warnings.join(" ")).not.toContain("secret-host");
  });

  it("checks production as well as staging", () => {
    expect(
      validateSharedConversationMemory({}, "admin", "production").mode,
    ).toBe("local");
  });

  it("does not check the public app or local development", () => {
    // The Vite build has no business with a server-only store, and local
    // development must keep working with no Upstash at all.
    expect(validateSharedConversationMemory(staging, "web", "staging").mode).toBe(
      "not-checked",
    );
    expect(validateSharedConversationMemory({}, "admin", null).mode).toBe(
      "not-checked",
    );
  });
});
