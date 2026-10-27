import "server-only";
import { resolveTenantRequest } from "../tenant-request.ts";
import { RejectedTenantRequest } from "../resolver-core.ts";
import { vehicleRepository, uuidPattern } from "./data.ts";

/** Compatible public read transports; no visitor identity, cookie bridge or metering writes in this phase. */
export async function vehicleApi(
  request: Request,
  kind: "inventory" | "detail" | "facets",
  id?: string,
) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  // Vercel's internal Request URL may be HTTP even when the public host is HTTPS.
  // Host is validated by ingress and the resolver; never trust caller forwarded-proto.
  const publicOrigin = `${process.env.VERCEL ? "https:" : url.protocol}//${request.headers.get("host")}`;
  const allowed =
    !origin ||
    origin === publicOrigin ||
    (process.env.WEB_PREVIEW_ALLOWED_ORIGINS ?? "").split(",").includes(origin);
  const h = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    Vary: "Origin",
  });
  if (origin && allowed) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Headers", "Content-Type, X-Lume-Tenant");
    h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: h });
  if (!allowed) return json({ error: "Forbidden origin" }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: h });
  if (!["GET", "HEAD"].includes(request.method))
    return json({ error: "Method not allowed" }, 405);
  if (kind === "detail" && (!id || !uuidPattern.test(id.trim())))
    return json({ error: "Invalid vehicle id" }, 400);
  const selectors = url.searchParams.getAll("tenant");
  const header = request.headers.get("x-lume-tenant")?.trim();
  if (
    selectors.length > 1 ||
    (header && selectors[0] && header !== selectors[0])
  )
    return json({ error: "Unknown or inactive tenant" }, 404);
  try {
    const tenant = await resolveTenantRequest(
      request.headers,
      selectors[0] ?? header,
      true,
    );
    const repository = vehicleRepository();
    // Facet ETag identity uses the verified slug even for header-only requests.
    url.searchParams.set("tenant", tenant.slug);
    if (kind === "detail") {
      const detail = await repository.detail(tenant.tenantId, id!.trim());
      return detail ? json(detail) : json({ error: "Vehicle not found" }, 404);
    }
    const result =
      kind === "facets"
        ? await repository.facets(tenant.tenantId, url.searchParams)
        : await repository.inventory(tenant.tenantId, url.searchParams);
    if (result.etag) h.set("ETag", result.etag);
    if (result.etag && request.headers.get("if-none-match") === result.etag)
      return new Response(null, { status: 304, headers: h });
    if ("facets" in result) return json(result.facets);
    const { etag: _, ...payload } = result;
    return json(payload);
  } catch (error) {
    if (error instanceof RejectedTenantRequest)
      return json({ error: "Unknown or inactive tenant" }, 404);
    return json({ error: "Vehicle data temporarily unavailable" }, 503);
  }
}
