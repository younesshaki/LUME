import { describe, expect, it } from "vitest";
import { validateManagedHttpsEndpoint } from "./managedFeedRemoteFetch.server";

describe("managed feed endpoint validation", () => {
  it("permits only public-looking HTTPS endpoints and strips fragments", () => {
    expect(validateManagedHttpsEndpoint("https://feeds.example.com/inventory.csv#ignore"))
      .toEqual({ ok: true, url: "https://feeds.example.com/inventory.csv" });
  });

  it("rejects insecure URLs, embedded credentials, and local hosts", () => {
    expect(validateManagedHttpsEndpoint("http://feeds.example.com/feed.csv")).toEqual({
      ok: false,
      error: "Managed feeds and exports require HTTPS.",
    });
    expect(validateManagedHttpsEndpoint("https://user:pass@feeds.example.com/feed.csv")).toEqual({
      ok: false,
      error: "Put supplier credentials in the secure credential fields, not in the URL.",
    });
    expect(validateManagedHttpsEndpoint("https://feeds.example.com/feed.csv?api_key=secret")).toEqual({
      ok: false,
      error: "Put supplier credentials in the secure credential fields, not in URL query parameters.",
    });
    expect(validateManagedHttpsEndpoint("https://feeds.example.com/feed.csv?signature=secret")).toEqual({
      ok: false,
      error: "Put supplier credentials in the secure credential fields, not in URL query parameters.",
    });
    expect(validateManagedHttpsEndpoint("https://localhost/feed.csv")).toEqual({
      ok: false,
      error: "Endpoint must use a public HTTPS hostname.",
    });
  });
});
