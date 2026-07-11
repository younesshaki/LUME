import { describe, expect, it } from "vitest";
import { visitorSessionCookieHeader } from "./visitorSessionCookie";

describe("visitor session proxy cookie", () => {
  it("forwards only the visitor session cookie", () => {
    expect(visitorSessionCookieHeader(
      "analytics=abc; lume_visitor_session=secure-token==; admin_session=private",
    )).toBe("lume_visitor_session=secure-token==");
  });

  it("returns undefined when the visitor is anonymous", () => {
    expect(visitorSessionCookieHeader("analytics=abc; other=value")).toBeUndefined();
    expect(visitorSessionCookieHeader(undefined)).toBeUndefined();
  });
});
