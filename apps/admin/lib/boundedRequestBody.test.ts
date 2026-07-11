import { describe, expect, it } from "vitest";
import { readRequestTextWithinLimit } from "./boundedRequestBody";

describe("bounded request body reader", () => {
  const request = (body: string) => new Request("https://admin.test/api/webhook", {
    method: "POST",
    body,
  });

  it("preserves the exact UTF-8 text within the byte budget", async () => {
    const body = '{"message":"héllo","spacing":"  exact  "}';
    await expect(readRequestTextWithinLimit(request(body), 1_024)).resolves.toBe(body);
  });

  it("stops reading once a chunked body exceeds the byte budget", async () => {
    await expect(readRequestTextWithinLimit(request("ééé"), 5)).resolves.toBeNull();
  });

  it("rejects invalid limits before consuming the body", async () => {
    await expect(readRequestTextWithinLimit(request("body"), -1)).rejects.toThrow(/maxBytes/);
  });
});
