// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldBuild } from "./vercel-ignore-build.mjs";

describe("Vercel build policy", () => {
  it("builds main, staging, and manual deployments", () => {
    expect(shouldBuild({ VERCEL_GIT_COMMIT_REF: "main" })).toBe(true);
    expect(shouldBuild({ VERCEL_GIT_COMMIT_REF: "staging" })).toBe(true);
    expect(shouldBuild({})).toBe(true);
  });

  it("skips ordinary feature branches", () => {
    expect(shouldBuild({ VERCEL_GIT_COMMIT_REF: "feature/gallery" })).toBe(false);
  });

  it("supports an explicit emergency override", () => {
    expect(
      shouldBuild({ VERCEL_GIT_COMMIT_REF: "hotfix/manual", VERCEL_FORCE_BUILD: "1" }),
    ).toBe(true);
  });
});
