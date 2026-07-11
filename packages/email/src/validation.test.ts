import { describe, expect, it } from "vitest";
import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  emailIdempotencyKey,
  mailboxAddress,
  normalizeIdempotencyKey,
  normalizeMailbox,
  normalizeRecipients,
  normalizeSubject,
  normalizeTags,
  normalizeTenantEmailContext,
  senderMailbox,
} from "./validation";

describe("email input validation", () => {
  it("normalizes raw and display-name mailboxes without accepting header injection", () => {
    expect(normalizeMailbox(" ada@example.com ")).toBe("ada@example.com");
    expect(normalizeMailbox("Ada Lovelace <ada@example.com>"))
      .toBe("Ada Lovelace <ada@example.com>");
    expect(mailboxAddress("Ada Lovelace <ADA@example.com>"))
      .toBe("ada@example.com");
    expect(normalizeMailbox("ada@example.com\r\nBcc: victim@example.com")).toBeNull();
    expect(normalizeMailbox("not-email")).toBeNull();
    expect(senderMailbox("Acme, \"Motors\"", "sales@acme.test"))
      .toBe("\"Acme, \\\"Motors\\\"\" <sales@acme.test>");
  });

  it("deduplicates recipients and enforces the provider's 50-recipient cap", () => {
    expect(normalizeRecipients([
      "Ada <Ada@example.com>",
      "Different Name <ada@example.com>",
      "bob@example.com",
    ]))
      .toEqual(["Ada <Ada@example.com>", "bob@example.com"]);
    expect(normalizeRecipients([])).toBeNull();
    expect(normalizeRecipients(Array.from(
      { length: 51 },
      (_, index) => `person-${index}@example.com`,
    ))).toBeNull();
  });

  it("rejects unsafe subjects, tenant identities, and tags", () => {
    expect(normalizeSubject("  Welcome   aboard  ")).toBe("Welcome aboard");
    expect(normalizeSubject("Hello\nBcc: victim@example.com")).toBeNull();
    expect(normalizeTenantEmailContext({ id: "tenant-1", name: "Acme" }))
      .toEqual({ id: "tenant-1", name: "Acme", fromAddress: null, replyTo: null });
    expect(normalizeTenantEmailContext({ id: "tenant 1", name: "Acme" })).toBeNull();
    expect(normalizeTags([{ name: "campaign", value: "welcome-v1" }]))
      .toEqual([{ name: "campaign", value: "welcome-v1" }]);
    expect(normalizeTags([{ name: "bad tag", value: "x" }])).toBeNull();
    expect(normalizeTags([{ name: "campaign", value: "not allowed" }])).toBeNull();
    expect(normalizeTags([{ name: "tenant_id", value: "spoofed" }])).toBeNull();
    expect(normalizeTags([
      { name: "campaign", value: "one" },
      { name: "CAMPAIGN", value: "two" },
    ])).toBeNull();
  });

  it("builds cross-tenant-safe idempotency keys without truncating", () => {
    expect(emailIdempotencyKey({
      tenantId: "tenant-1",
      templateKey: "welcome",
      entityId: "user-1",
    })).toBe("lume:tenant-1:welcome:user-1");
    expect(emailIdempotencyKey({
      tenantId: "tenant-2",
      templateKey: "welcome",
      entityId: "user-1",
    })).not.toBe("lume:tenant-1:welcome:user-1");
    expect(normalizeIdempotencyKey("x".repeat(MAX_IDEMPOTENCY_KEY_LENGTH)))
      .toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
    expect(normalizeIdempotencyKey("x".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1))).toBeNull();
    expect(emailIdempotencyKey({
      tenantId: "tenant-1",
      templateKey: "welcome",
      entityId: "contains recipient@example.com",
    })).toBeNull();
  });
});
