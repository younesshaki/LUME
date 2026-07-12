import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../render";
import { domainVerificationEmailTemplate } from "./DomainVerificationEmail";

describe("domain verification email", () => {
  it("renders verified and troubleshooting variants safely", async () => {
    const common = {
      tenantName: "Acme <Motors>",
      domain: "cars.example.com",
      domainsUrl: "https://admin.lume.app/admin/acme/domains",
    };
    const verified = await renderEmailTemplate(domainVerificationEmailTemplate, {
      ...common,
      state: "verified",
    });
    expect(verified.text).toContain("cars.example.com is verified");
    expect(verified.html).toContain("Acme &lt;Motors&gt;");

    const failed = await renderEmailTemplate(domainVerificationEmailTemplate, {
      ...common,
      state: "failed",
    });
    expect(failed.text).toContain("could not be verified within 24 hours");
    expect(failed.text).toContain("DNS propagation");
    expect(failed.text).toContain(common.domainsUrl);
  });
});
