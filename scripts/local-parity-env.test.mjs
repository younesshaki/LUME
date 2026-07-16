// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mergeParityRuntimeEnvironment } from "./local-parity-env.mjs";

describe("local parity environment merging", () => {
  it("preserves a locally supplied service key when Vercel redacts it", () => {
    expect(
      mergeParityRuntimeEnvironment(
        { SUPABASE_SERVICE_ROLE_KEY: "staging-service-key" },
        { SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_URL: "https://staging.supabase.co" },
      ),
    ).toMatchObject({
      SUPABASE_SERVICE_ROLE_KEY: "staging-service-key",
      SUPABASE_URL: "https://staging.supabase.co",
    });
  });

  it("keeps a non-empty branch-scoped service key authoritative", () => {
    expect(
      mergeParityRuntimeEnvironment(
        { SUPABASE_SERVICE_ROLE_KEY: "local-key" },
        { SUPABASE_SERVICE_ROLE_KEY: "pulled-key" },
      ).SUPABASE_SERVICE_ROLE_KEY,
    ).toBe("pulled-key");
  });

  it("does not resurrect unrelated local secrets", () => {
    expect(
      mergeParityRuntimeEnvironment(
        { DEEPSEEK_API_KEY: "local-production-key" },
        { DEEPSEEK_API_KEY: "" },
      ).DEEPSEEK_API_KEY,
    ).toBe("");
  });
});
