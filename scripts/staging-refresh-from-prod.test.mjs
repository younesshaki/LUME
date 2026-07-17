// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  assertProjectUrl,
  createReadOnlyFetch,
  mapTenantMemberships,
  orderVehicleImages,
  parseServiceRoleKey,
  prepareVehicleRows,
  retargetTenantRows,
} from "./staging-refresh-from-prod.mjs";

describe("staging production refresh safety", () => {
  it("accepts only the explicitly expected Supabase project", () => {
    expect(
      assertProjectUrl(
        "https://hapyyupeugxccofpibor.supabase.co",
        "hapyyupeugxccofpibor",
        "Staging",
      ),
    ).toBe("https://hapyyupeugxccofpibor.supabase.co");
    expect(() =>
      assertProjectUrl(
        "https://atsgdjwjtmqvtotbrowu.supabase.co",
        "hapyyupeugxccofpibor",
        "Staging",
      ),
    ).toThrow(/must target Supabase project hapyyupeugxccofpibor/);
  });

  it("physically blocks mutating production HTTP methods", async () => {
    const fetchImplementation = vi.fn(async () => new Response("ok"));
    const readOnlyFetch = createReadOnlyFetch(fetchImplementation);

    await expect(readOnlyFetch("https://example.test/data", { method: "GET" })).resolves.toBeInstanceOf(
      Response,
    );
    await expect(readOnlyFetch("https://example.test/data", { method: "HEAD" })).resolves.toBeInstanceOf(
      Response,
    );
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      await expect(readOnlyFetch("https://example.test/data", { method })).rejects.toThrow(
        `${method} is not read-only`,
      );
    }
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("maps tenant memberships through matching staging auth emails", () => {
    const result = mapTenantMemberships(
      [
        { tenant_id: "prod-tenant", user_id: "prod-owner", role: "owner" },
        { tenant_id: "prod-tenant", user_id: "prod-editor", role: "editor" },
      ],
      [
        { id: "prod-owner", email: "hakicsi89@gmail.com" },
        { id: "prod-editor", email: "editor@example.com" },
      ],
      [{ id: "stage-owner", email: "HAKICSI89@GMAIL.COM" }],
      "stage-tenant",
    );

    expect(result).toEqual({
      mapped: [
        {
          tenant_id: "stage-tenant",
          user_id: "stage-owner",
          role: "owner",
        },
      ],
      skipped: 1,
    });
  });

  it("refuses to clear staging when the seeded owner cannot be mapped", () => {
    expect(() =>
      mapTenantMemberships(
        [{ tenant_id: "prod", user_id: "prod-owner", role: "owner" }],
        [{ id: "prod-owner", email: "other@example.com" }],
        [{ id: "stage-owner", email: "hakicsi89@gmail.com" }],
        "stage",
      ),
    ).toThrow(/Staging auth must contain/);
  });

  it("retargets tenant rows and excludes generated vehicle columns", () => {
    expect(retargetTenantRows([{ id: "visitor", tenant_id: "prod" }], "stage")).toEqual([
      { id: "visitor", tenant_id: "stage" },
    ]);
    expect(
      prepareVehicleRows(
        [{ id: "vehicle", tenant_id: "prod", make: "BMW", search_vector: "generated" }],
        "stage",
      ),
    ).toEqual([{ id: "vehicle", tenant_id: "stage", make: "BMW" }]);
  });

  it("orders managed images primary-first with deterministic tie breakers", () => {
    const rows = [
      { id: "b", vehicle_id: "v1", is_primary: false, sort_order: 2, created_at: "2026-01-02" },
      { id: "c", vehicle_id: "v1", is_primary: false, sort_order: 1, created_at: "2026-01-03" },
      { id: "a", vehicle_id: "v1", is_primary: true, sort_order: 4, created_at: "2026-01-04" },
      { id: "d", vehicle_id: "v2", is_primary: true, sort_order: 0, created_at: "2026-01-01" },
    ];
    expect(orderVehicleImages(rows).map((row) => row.id)).toEqual(["a", "c", "b", "d"]);
    expect(rows.map((row) => row.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("extracts only a non-empty service-role key from CLI output", () => {
    expect(
      parseServiceRoleKey([
        { name: "anon", api_key: "public" },
        { name: "service_role", api_key: "server-only" },
      ]),
    ).toBe("server-only");
    expect(() => parseServiceRoleKey([{ name: "anon", api_key: "public" }])).toThrow(
      /did not return a service-role key/,
    );
  });
});
