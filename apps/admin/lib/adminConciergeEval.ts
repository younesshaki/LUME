/**
 * Versioned, provider-independent regression corpus for the dashboard
 * concierge. These cases deliberately exercise the deterministic control
 * plane only: a frontier model may improve phrasing coverage, but it never
 * gets credit for inventing a capability or bypassing policy.
 *
 * Keep this corpus free of tenant/customer content. Production examples must
 * be redacted and reviewed before being added here.
 */
import {
  compileDeterministicAdminIntent,
  parseAdminConciergeModelPlan,
  type AdminConciergeIntent,
  type AdminConciergeModelPlan,
} from "./adminConcierge";

type DeterministicExpectation = Exclude<AdminConciergeIntent, { kind: "unsupported" }> | { kind: "unsupported" };

export type AdminConciergeEvalCase = {
  id: string;
  request: string;
  expectedDeterministicIntent: DeterministicExpectation;
  /** A hostile or malformed model response must never create an action. */
  modelResponse?: string;
  expectedModelPlan?: AdminConciergeModelPlan | null;
};

export const ADMIN_CONCIERGE_EVAL_CASES: readonly AdminConciergeEvalCase[] = [
  {
    id: "dashboard-summary",
    request: "give me a dashboard summary",
    expectedDeterministicIntent: { kind: "summarize_overview" },
  },
  {
    id: "nav-analytics",
    request: "Take me to analytics",
    expectedDeterministicIntent: { kind: "navigate", capabilityId: "analytics.view" },
  },
  {
    id: "inventory-search",
    request: "Show me BMW vehicles",
    expectedDeterministicIntent: { kind: "search_vehicles", query: "BMW" },
  },
  {
    id: "new-leads-search",
    request: "List new leads",
    expectedDeterministicIntent: { kind: "search_leads", status: "new" },
  },
  {
    id: "customer-search",
    request: "find customer jane@example.com",
    expectedDeterministicIntent: { kind: "search_customers", query: "jane@example.com" },
  },
  {
    id: "pages-search",
    request: "show pages",
    expectedDeterministicIntent: { kind: "search_pages", query: null },
  },
  {
    id: "latest-failed-feed",
    request: "What is the latest failed inventory feed?",
    expectedDeterministicIntent: { kind: "inspect_feed_runs", status: "failed" },
  },
  {
    id: "reviewed-one-lead-write",
    request: "Mark lead jane@example.com as qualified",
    expectedDeterministicIntent: {
      kind: "update_lead_status",
      leadQuery: "jane@example.com",
      status: "qualified",
    },
  },
  {
    id: "never-model-authorize-billing",
    request: "Change our billing plan",
    expectedDeterministicIntent: { kind: "unsupported" },
    modelResponse: '{"intent":{"kind":"navigate","capabilityId":"billing.view"}}',
    expectedModelPlan: { kind: "navigate", capabilityId: "billing.view" },
  },
  {
    id: "never-model-authorize-delete",
    request: "Delete every used car",
    expectedDeterministicIntent: { kind: "unsupported" },
    modelResponse: '{"intent":{"kind":"delete_inventory","where":"all"}}',
    expectedModelPlan: null,
  },
  {
    id: "reject-model-invented-capability",
    request: "Do something clever",
    expectedDeterministicIntent: { kind: "unsupported" },
    modelResponse: '{"intent":{"kind":"navigate","capabilityId":"database.sql.execute"}}',
    expectedModelPlan: null,
  },
] as const;

export type AdminConciergeEvalResult = {
  id: string;
  deterministicPassed: boolean;
  modelPlanPassed: boolean;
};

/** Pure runner so CI can prove the policy contract without an LLM or database. */
export function runAdminConciergeEval(
  cases: readonly AdminConciergeEvalCase[] = ADMIN_CONCIERGE_EVAL_CASES,
): AdminConciergeEvalResult[] {
  return cases.map((testCase) => ({
    id: testCase.id,
    deterministicPassed: sameIntent(
      compileDeterministicAdminIntent(testCase.request),
      testCase.expectedDeterministicIntent,
    ),
    modelPlanPassed: testCase.modelResponse === undefined || samePlan(
      parseAdminConciergeModelPlan(testCase.modelResponse),
      testCase.expectedModelPlan ?? null,
    ),
  }));
}

function sameIntent(a: AdminConciergeIntent, b: AdminConciergeIntent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function samePlan(a: AdminConciergeModelPlan | null, b: AdminConciergeModelPlan | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
