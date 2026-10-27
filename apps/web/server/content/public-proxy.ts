import "server-only";
import { resolveTenantRequest } from "../tenant-request.ts";
import { RejectedTenantRequest } from "../resolver-core.ts";

export async function publicMutation(
  request: Request,
  kind: "leads" | "consent",
) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
  const json = (error: string, status: number) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: new Headers([...headers, ["Content-Type", "application/json"]]),
    });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const ownOrigin = `${process.env.VERCEL ? "https:" : url.protocol}//${request.headers.get("host")}`;
  if (origin && origin !== ownOrigin) return json("Forbidden origin", 403);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-Lume-Tenant");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Vary", "Origin");
  }
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json("Method not allowed", 405);
  if (!origin) return json("Forbidden origin", 403);
  const queries = url.searchParams.getAll("tenant"),
    selector = request.headers.get("x-lume-tenant")?.trim();
  if (queries.length > 1 || (queries[0] && selector && queries[0] !== selector))
    return json("Unknown or inactive tenant", 404);
  try {
    const tenant = await resolveTenantRequest(
      request.headers,
      queries[0] ?? selector,
      true,
    );
    const configured = process.env.WEB_PREVIEW_UPSTREAM_ORIGIN;
    if (!configured)
      return json("Staging submission upstream not configured", 503);
    const upstream = new URL(configured);
    if (
      upstream.protocol !== "https:" ||
      upstream.username ||
      upstream.password ||
      upstream.pathname !== "/" ||
      upstream.search ||
      upstream.hash ||
      !upstream.hostname.endsWith(".vercel.app")
    )
      return json("Invalid staging submission upstream", 503);
    upstream.pathname = `/api/${kind}`;
    upstream.searchParams.set("tenant", tenant.slug);
    const limit = kind === "leads" ? 65536 : 4096;
    const body = await request.text();
    if (new TextEncoder().encode(body).length > limit)
      return json("Request too large", 413);
    const forwarded = new Headers({
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      Origin: origin,
      "X-Lume-Tenant": tenant.slug,
    });
    for (const name of [
      "x-forwarded-for",
      ...(kind === "leads" ? ["user-agent", "referer"] : []),
    ]) {
      const value = request.headers.get(name);
      if (value) forwarded.set(name, value);
    }
    if (kind === "leads") {
      const cookie = request.headers
        .get("cookie")
        ?.split(";")
        .map((p) => p.trim())
        .find(
          (p) =>
            p.startsWith("lume_visitor_session=") &&
            p.length > "lume_visitor_session=".length,
        );
      if (cookie) forwarded.set("cookie", cookie);
    }
    const response = await fetch(upstream, {
      method: "POST",
      headers: forwarded,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    for (const name of [
      "content-type",
      "retry-after",
      "x-lume-quota-warning",
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
      "access-control-expose-headers",
    ]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return error instanceof RejectedTenantRequest
      ? json("Unknown or inactive tenant", 404)
      : json("Staging submission service unreachable", 502);
  }
}
