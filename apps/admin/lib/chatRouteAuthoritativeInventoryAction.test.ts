// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "apps/admin/app/api/chat/route.ts"),
  "utf8",
);

const at = (needle: string, from = 0) => {
  const index = route.indexOf(needle, from);
  expect(index, `expected to find ${needle}`).toBeGreaterThan(-1);
  return index;
};

describe("public chat route: authoritative inventory actions", () => {
  it("creates a server-owned action only after a successful non-rollback query", () => {
    const query = at("const inventoryOutcome = resolveInventoryOutcome(");
    const authoritative = at("authoritativeInventoryAction = inventoryFilterAction(filters) as", query);
    expect(authoritative).toBeGreaterThan(query);
    const window = route.slice(query, authoritative + 300);
    expect(window).toContain("!inventoryOutcome.rollBackToPreviousFilters");
    expect(window).toContain("totalMatched > 0");
  });

  it("passes the authoritative action through both model response paths", () => {
    const firstModelCandidates = at("const modelActions = withAuthoritativeInventoryAction(");
    const toolInitialCandidates = at("const initialActions = withAuthoritativeInventoryAction(");
    const streamedCandidates = at("const actionCandidates = withAuthoritativeInventoryAction(");

    expect(firstModelCandidates).toBeLessThan(at("const actions = withInventoryPreview(", firstModelCandidates));
    expect(toolInitialCandidates).toBeLessThan(at("for (const action of withInventoryPreview(", toolInitialCandidates));
    expect(streamedCandidates).toBeLessThan(at("for (const action of withInventoryPreview(", streamedCandidates));
  });

  it("uses the shared helper so a model filter cannot override a verified result set", () => {
    expect(route).toContain('from "@/lib/authoritativeInventoryAction"');
    expect(route.match(/withAuthoritativeInventoryAction\(/g)).toHaveLength(3);
  });
});
