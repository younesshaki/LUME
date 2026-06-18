import { describe, expect, it } from "vitest";
import { normalizePageSlug, validateNewPageSlug } from "./pages";

describe("page slug helpers", () => {
  it("normalizes admin-entered slugs", () => {
    expect(normalizePageSlug(" /Fall Launch 2026/ ")).toBe("fall-launch-2026");
  });

  it("rejects reserved, blocked, duplicate, and empty slugs", () => {
    expect(validateNewPageSlug("")).toMatchObject({ ok: false });
    expect(validateNewPageSlug("vehicles")).toMatchObject({ ok: false });
    expect(validateNewPageSlug("admin")).toMatchObject({ ok: false });
    expect(validateNewPageSlug("Landing", ["landing"])).toMatchObject({ ok: false });
  });

  it("accepts unique custom page slugs", () => {
    expect(validateNewPageSlug("Fall Launch", ["about"])).toEqual({
      ok: true,
      slug: "fall-launch",
    });
  });
});
