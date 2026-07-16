// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  expectedEnvironment,
  supabaseProjectRef,
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
