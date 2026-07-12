import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../render";
import { leadCreatedEmailTemplate } from "./LeadCreatedEmail";
import { leadDigestEmailTemplate } from "./LeadDigestEmail";

const lead = {
  contactName: "Ada <script>alert('x')</script>",
  email: "ada@example.com",
  phone: "+1 555 0100",
  messagePreview: "Interested in a test drive.",
  source: "contact form",
  vehicleLabel: "2026 LUME Aurora Touring",
  leadUrl: "https://admin.lume.app/admin/acme/leads/lead-1",
};

describe("lead notification email templates", () => {
  it("renders contact, message, admin link, and vehicle context safely", async () => {
    const rendered = await renderEmailTemplate(leadCreatedEmailTemplate, {
      tenantName: "Acme Motors",
      lead,
    });
    expect(leadCreatedEmailTemplate.key).toBe("lead-created");
    expect(rendered.html).toContain("Ada &lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;");
    expect(rendered.html).not.toContain("<script>alert('x')</script>");
    expect(rendered.text).toContain("ada@example.com");
    expect(rendered.text).toContain("Interested in a test drive");
    expect(rendered.text).toContain("2026 LUME Aurora Touring");
    expect(rendered.text).toContain(lead.leadUrl);
  });

  it("renders a bounded hourly digest with per-lead links", async () => {
    const rendered = await renderEmailTemplate(leadDigestEmailTemplate, {
      tenantName: "Acme Motors",
      leadsUrl: "https://admin.lume.app/admin/acme/leads",
      leads: [lead, { ...lead, contactName: "Grace", leadUrl: `${lead.leadUrl}-2` }],
    });
    expect(leadDigestEmailTemplate.key).toBe("lead-digest");
    expect(rendered.text).toContain("2 new leads");
    expect(rendered.text).toContain("Grace");
    expect(rendered.text).toContain(`${lead.leadUrl}-2`);
    await expect(renderEmailTemplate(leadDigestEmailTemplate, {
      tenantName: "Acme Motors",
      leadsUrl: "https://admin.lume.app/admin/acme/leads",
      leads: [],
    })).rejects.toThrow(/between 1 and 100/);
  });
});
