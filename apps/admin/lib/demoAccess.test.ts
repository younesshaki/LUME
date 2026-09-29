import { describe, expect, it } from "vitest";
import { demoAccessAccount } from "./demoAccess";

describe("demoAccessAccount", () => {
  it("resolves the three demo usernames case-insensitively", () => {
    expect(demoAccessAccount(" Sean ")).toEqual({
      email: "sean@demo.lume.app",
      destination: "/admin/demo-sean",
    });
    expect(demoAccessAccount("ARASH")?.destination).toBe("/admin/demo-arash");
    expect(demoAccessAccount("max")?.destination).toBe("/admin/demo-max");
  });

  it("does not resolve an arbitrary email or username", () => {
    expect(demoAccessAccount("sean@demo.lume.app")).toBeNull();
    expect(demoAccessAccount("other-dealer")).toBeNull();
  });
});
