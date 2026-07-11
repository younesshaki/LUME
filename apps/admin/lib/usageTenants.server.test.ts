// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadUsageMeteringTenants } from "./usageTenants.server";

type Result = { data: Array<{ id: string; slug: string }> | null; error: unknown };

class FakeClient {
  readonly cursors: Array<string | null> = [];
  constructor(private readonly responses: Result[]) {}

  from() {
    let cursor: string | null = null;
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      gt: (_column: string, value: string) => {
        cursor = value;
        return builder;
      },
      then: (resolve: (result: Result) => void) => {
        this.cursors.push(cursor);
        return Promise.resolve(this.responses.shift() ?? { data: [], error: null }).then(resolve);
      },
    };
    return builder;
  }
}

describe("usage metering tenant pagination", () => {
  it("loads every keyset page beyond one response cap", async () => {
    const client = new FakeClient([
      { data: [{ id: "1", slug: "one" }, { id: "2", slug: "two" }], error: null },
      { data: [{ id: "3", slug: "three" }], error: null },
    ]);
    await expect(loadUsageMeteringTenants(client as never, { pageSize: 2 }))
      .resolves.toEqual([
        { id: "1", slug: "one" },
        { id: "2", slug: "two" },
        { id: "3", slug: "three" },
      ]);
    expect(client.cursors).toEqual([null, "2"]);
  });

  it("fails closed instead of returning an incomplete tenant list", async () => {
    const client = new FakeClient([
      { data: [{ id: "1", slug: "one" }], error: { message: "unavailable" } },
    ]);
    await expect(loadUsageMeteringTenants(client as never, { pageSize: 2 }))
      .resolves.toBeNull();
  });
});
