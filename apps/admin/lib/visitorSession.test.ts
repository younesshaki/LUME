import { describe, expect, it } from "vitest";
import { toPublicVisitor } from "./visitorPublic";

describe("toPublicVisitor", () => {
  it("maps only the explicit safe visitor projection", () => {
    expect(toPublicVisitor({
      id: "visitor-1",
      tenant_id: "tenant-1",
      email: "visitor@example.com",
      first_name: "Visitor",
      last_name: "One",
      created_at: "2026-01-01T00:00:00.000Z",
    })).toEqual({
      id: "visitor-1",
      tenantId: "tenant-1",
      email: "visitor@example.com",
      firstName: "Visitor",
      lastName: "One",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
