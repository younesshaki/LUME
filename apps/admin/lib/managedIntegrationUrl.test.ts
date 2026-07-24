import { describe, expect, it } from "vitest";
import { isSensitiveManagedIntegrationQueryKey } from "./managedIntegrationUrl";

describe("managed integration URL hygiene", () => {
  it("recognizes every credential-like query-key form used by the server validator", () => {
    for (const key of [
      "authorization",
      "secret",
      "token",
      "password",
      "api_key",
      "access-key",
      "credential",
      "signature",
      "sig",
      "signed_auth_value",
    ]) {
      expect(isSensitiveManagedIntegrationQueryKey(key)).toBe(true);
    }
    expect(isSensitiveManagedIntegrationQueryKey("page")).toBe(false);
  });
});
