import "server-only";
import { resolveTenantRequest } from "../tenant-request.ts";
import { RejectedTenantRequest } from "../resolver-core.ts";

/**
 * Visitor-session bridge. Proxies the public visitor API to the admin app and
 * — unlike the leads/consent proxy, which drops every `Set-Cookie` — relays
 * back **only** the signed `lume_visitor_session` cookie. This is the single,
 * deliberate exception to Phase 3's no-upstream-cookie rule: the web app can
 * never sign the cookie itself (`VISITOR_SESSION_SECRET` is blocked by the env
 * firewall), so admin issues it and the bridge forwards exactly that one
 * cookie, scoped to the web origin, and nothing else.
 *
 * The signed cookie it relays is then what the chat proxy forwards upstream so
 * a returning visitor's concierge memory is scoped correctly.
 */

const COOKIE = "lume_visitor_session";

/** Public visitor endpoints that may be proxied. Everything else is 404. */
const PATH_ALLOWLIST = new Set([
  "me",
  "login",
  "logout",
  "signup",
  "saved-vehicles",
  "loyalty",
  "chat-history",
]);

const MAX_BODY_BYTES = 16384;

/** Upstream headers echoed back to the browser. */
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "access-control-expose-headers",
] as const;

function allowedPath(segments: string[]): boolean {
  if (segments.length === 0 || segments.some((s) => !s || s.includes("..")))
    return false;
  if (segments.length === 1) return PATH_ALLOWLIST.has(segments[0]);
  // Only saved-vehicles/<id> has a second segment.
  return (
    segments.length === 2 &&
    segments[0] === "saved-vehicles" &&
    /^[A-Za-z0-9._~-]+$/.test(segments[1])
  );
}

export async function visitorProxy(request: Request, segments: string[]) {
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
  const ownOrigin = `${process.env.VERCEL ? "https:" : url.protocol}//${request.headers.get("host")}`;
  const suppliedOrigin = request.headers.get("origin");
  // Browsers omit Origin on a same-origin GET. Only a browser fetch explicitly
  // marked same-origin may use its own verified host as upstream Origin.
  // Mutations still require Origin; cross-site/metadata-free reads fail closed.
  const sameOriginRead =
    request.method === "GET" &&
    request.headers.get("sec-fetch-site") === "same-origin" &&
    ["cors", "same-origin"].includes(
      request.headers.get("sec-fetch-mode") ?? "",
    );
  const origin = suppliedOrigin ?? (sameOriginRead ? ownOrigin : null);
  if (origin && origin !== ownOrigin) return json("Forbidden origin", 403);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-Lume-Tenant");
    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    headers.set("Vary", "Origin");
  }
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (!["GET", "POST", "DELETE"].includes(request.method))
    return json("Method not allowed", 405);
  if (!origin) return json("Forbidden origin", 403);
  if (!allowedPath(segments)) return json("Not found", 404);

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
    if (!configured) return json("Visitor upstream not configured", 503);
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
      return json("Invalid visitor upstream", 503);
    upstream.pathname = `/api/visitor/${segments.join("/")}`;
    upstream.searchParams.set("tenant", tenant.slug);

    const forwarded = new Headers({
      Origin: origin,
      "X-Lume-Tenant": tenant.slug,
    });
    const ct = request.headers.get("content-type");
    if (ct) forwarded.set("Content-Type", ct);
    const xff = request.headers.get("x-forwarded-for");
    if (xff) forwarded.set("x-forwarded-for", xff);
    // Forward ONLY the signed visitor-session cookie upstream.
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((p) => p.trim())
      .find(
        (p) => p.startsWith(`${COOKIE}=`) && p.length > `${COOKIE}=`.length,
      );
    if (cookie) forwarded.set("cookie", cookie);

    let body: string | undefined;
    if (request.method !== "GET") {
      body = await request.text();
      if (new TextEncoder().encode(body).length > MAX_BODY_BYTES)
        return json("Request too large", 413);
    }

    const response = await fetch(upstream, {
      method: request.method,
      headers: forwarded,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });

    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    // Relay back ONLY the signed visitor-session Set-Cookie; drop any other.
    for (const setCookie of response.headers.getSetCookie()) {
      if (setCookie.startsWith(`${COOKIE}=`))
        headers.append("set-cookie", setCookie);
    }

    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    if (error instanceof RejectedTenantRequest)
      return json("Unknown or inactive tenant", 404);
    if (error instanceof DOMException && error.name === "AbortError")
      return json("Visitor service timed out", 504);
    return json("Visitor service unreachable", 502);
  }
}
