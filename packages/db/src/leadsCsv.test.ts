import { describe, expect, it } from "vitest";
import type { Database } from "./schema";
import { LEAD_CSV_HEADERS, leadsToCsv } from "./leadsCsv";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-1",
    tenant_id: "tenant-1",
    source: "contact-form",
    status: "new",
    assigned_to: null,
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: null,
    message: null,
    vehicle_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    referrer: null,
    source_context: null,
    ip_addr: null,
    user_agent: null,
    lost_reason: null,
    visitor_id: null,
    created_at: "2026-07-11T10:00:00.000Z",
    updated_at: "2026-07-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("leadsToCsv", () => {
  it("emits the header row even with no leads", () => {
    const csv = leadsToCsv([]);
    expect(csv).toBe(LEAD_CSV_HEADERS.join(","));
  });

  it("uses CRLF line endings and header order", () => {
    const csv = leadsToCsv([lead()]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(LEAD_CSV_HEADERS.join(","));
    expect(row.startsWith("lead-1,2026-07-11T10:00:00.000Z,new,contact-form,Ada,Lovelace,ada@example.com,")).toBe(
      true,
    );
  });

  it("renders null fields as empty strings", () => {
    const csv = leadsToCsv([lead({ email: null, phone: null, message: null })]);
    const row = csv.split("\r\n")[1];
    // email + phone + message columns are consecutive → three empties in a row
    expect(row).toContain(",,");
  });

  it("quotes fields containing commas, quotes, and newlines (RFC 4180)", () => {
    const csv = leadsToCsv([lead({ message: 'Hello, "world"\nnext line' })]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain('"Hello, ""world""\nnext line"');
  });

  it("neutralizes CSV/formula injection in attacker-controllable fields", () => {
    const csv = leadsToCsv([lead({ first_name: "=SUM(A1:A9)", last_name: "@cmd" })]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain("'=SUM(A1:A9)");
    expect(row).toContain("'@cmd");
  });

  it("exports UTM content and serialized source context", () => {
    expect(LEAD_CSV_HEADERS).toContain("utm_content");
    expect(LEAD_CSV_HEADERS).toContain("source_context");
    const csv = leadsToCsv([lead({
      utm_content: "hero-cta",
      source_context: { trigger: "bot-action", actionType: "capture_lead" },
    })]);
    expect(csv).toContain("hero-cta");
    expect(csv).toContain(
      '"{""trigger"":""bot-action"",""actionType"":""capture_lead""}"',
    );
  });
});
