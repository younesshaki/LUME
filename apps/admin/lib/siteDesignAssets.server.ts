import { TENANT_BUCKETS, validateUploadWithBytes } from "@lume/db";
import { validateSiteBackgroundCandidate } from "./siteDesignAssets";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Verify the object that actually reached public storage before publishing it. */
export async function validateStoredSiteBackground(
  url: string,
  fetcher: FetchLike = fetch,
): Promise<string | null> {
  let metadataResponse: Response;
  let response: Response;
  try {
    metadataResponse = await fetcher(url, { method: "HEAD", cache: "no-store" });
    response = await fetcher(url, {
      method: "GET",
      headers: { Range: "bytes=0-511" },
      cache: "no-store",
    });
  } catch {
    return "The uploaded website background could not be verified.";
  }
  if (!metadataResponse.ok || !response.ok) return "The uploaded website background is unavailable.";

  const type = metadataResponse.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const size = Number(metadataResponse.headers.get("content-length") ?? 0);
  const metadataError = validateSiteBackgroundCandidate({ name: "siteBackground", type, size });
  if (metadataError) return metadataError;

  const leadingBytes = new Uint8Array(await response.arrayBuffer());
  const validation = validateUploadWithBytes(
    TENANT_BUCKETS.media,
    { type, size },
    leadingBytes,
  );
  return validation.ok ? null : validation.error;
}
