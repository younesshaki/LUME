import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../render";
import { passwordResetEmailTemplate } from "./PasswordResetEmail";
import { tenantInvitedEmailTemplate } from "./TenantInvitedEmail";
import { welcomeEmailTemplate } from "./WelcomeEmail";
import { requireSafeActionUrl } from "./layout";

describe("transactional email templates", () => {
  it("renders a branded welcome email while escaping tenant content", async () => {
    const rendered = await renderEmailTemplate(welcomeEmailTemplate, {
      tenantName: "Acme <script>alert('x')</script>",
      dashboardUrl: "https://admin.lume.app/admin/acme?from=email&step=welcome",
    });

    expect(welcomeEmailTemplate.subject({
      tenantName: "Acme Motors",
      dashboardUrl: "https://admin.lume.app/admin/acme",
    })).toBe("Welcome to LUME — Acme Motors");
    expect(rendered.html).toContain("Acme &lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;");
    expect(rendered.html).not.toContain("<script>alert('x')</script>");
    expect(rendered.html).toContain("Continue setup");
    expect(rendered.html).toContain("from=email&amp;step=welcome");
    expect(rendered.text).toContain(
      "https://admin.lume.app/admin/acme?from=email&step=welcome",
    );
    expect(rendered.text).toContain("Upload logo");
    expect(rendered.text).toContain("Import first vehicles");
    expect(rendered.text).toContain("Configure bot persona");
    expect(rendered.text).toContain("Invite a team member");
    expect(rendered.text).toContain("Connect domain or publish");
  });

  it("renders password reset security and expiry copy", async () => {
    const rendered = await renderEmailTemplate(passwordResetEmailTemplate, {
      resetUrl: "https://admin.lume.app/reset-password?token=opaque-token",
      expiresInMinutes: 60,
    });

    expect(passwordResetEmailTemplate.key).toBe("password-reset");
    expect(rendered.text).toContain("expires in 60 minutes");
    expect(rendered.text).toContain("did not request this password reset");
    expect(rendered.html).toContain("Reset your password");

    const genericExpiry = await renderEmailTemplate(passwordResetEmailTemplate, {
      resetUrl: "https://admin.lume.app/reset-password?token=another-token",
    });
    expect(genericExpiry.text).toContain("expires after a short time");
  });

  it("renders tenant invitation role and expiry details", async () => {
    const rendered = await renderEmailTemplate(tenantInvitedEmailTemplate, {
      tenantName: "Acme Motors",
      inviteUrl: "https://admin.lume.app/invite/opaque-token",
      role: "editor",
      expiresAt: "2026-07-18T12:00:00.000Z",
    });

    expect(tenantInvitedEmailTemplate.key).toBe("tenant-invited");
    expect(rendered.text).toContain("You have been invited");
    expect(rendered.text).toContain("an editor");
    expect(rendered.text).toContain("July 18, 2026");
    expect(rendered.text).toContain("UTC");
  });

  it.each([
    ["owner", "an owner"],
    ["admin", "an administrator"],
    ["editor", "an editor"],
    ["viewer", "a viewer"],
  ] as const)("renders the %s invitation role", async (role, label) => {
    const rendered = await renderEmailTemplate(tenantInvitedEmailTemplate, {
      tenantName: "Acme Motors",
      inviteUrl: "https://admin.lume.app/invite/opaque-token",
      role,
      expiresAt: "",
    });
    expect(rendered.text).toContain(label);
    expect(rendered.text).not.toContain("This invitation expires");
  });

  it("rejects an invalid invitation expiry timestamp", async () => {
    await expect(renderEmailTemplate(tenantInvitedEmailTemplate, {
      tenantName: "Acme Motors",
      inviteUrl: "https://admin.lume.app/invite/opaque-token",
      role: "viewer",
      expiresAt: "next Tuesday",
    })).rejects.toThrow(/ISO timestamp/);
  });

  it("rejects unsafe, credential-bearing, and non-absolute action URLs", () => {
    expect(() => requireSafeActionUrl("javascript:alert(1)")).toThrow(/HTTPS/);
    expect(() => requireSafeActionUrl("data:text/html,hello")).toThrow(/HTTPS/);
    expect(() => requireSafeActionUrl("https://user:secret@example.com/reset")).toThrow(
      /credentials/,
    );
    expect(() => requireSafeActionUrl("/invite/token")).toThrow(/absolute/);
    expect(() => requireSafeActionUrl("//evil.example/invite/token")).toThrow(/absolute/);
    expect(() => requireSafeActionUrl("https://example.com/invite\r\nBcc:test"))
      .toThrow(/invalid/);
    expect(() => requireSafeActionUrl("http://example.com/invite/token")).toThrow(/HTTPS/);
    expect(requireSafeActionUrl("http://localhost:3000/invite/token"))
      .toBe("http://localhost:3000/invite/token");
  });
});
