import "server-only";
import { resolveTenantRequest } from "../tenant-request.ts";
import { RejectedTenantRequest } from "../resolver-core.ts";

/**
 * Same-origin → admin-upstream proxy for the concierge chat SSE stream.
 *
 * Mirrors {@link ../content/public-proxy.ts publicMutation}: the Next web app
 * never holds a model key, so a chat turn is forwarded to the admin app's
 * `/api/chat` (which owns the system prompt, RAG, entitlements and provider
 * key) and its Server-Sent-Events stream is piped straight back. Differences
 * from the leads/consent proxy:
 *   - the response is an SSE stream, so the upstream body is streamed through
 *     and the upstream SSE headers (content-type, cache-control,
 *     x-source-categories, …) are forwarded verbatim;
 *   - the signed `lume_visitor_session` cookie is always forwarded (and it is
 *     the ONLY cookie forwarded), so the upstream can scope a returning
 *     visitor's memory;
 *   - the caller's abort signal is propagated to the upstream fetch, so a
 *     client disconnect cancels the upstream turn (SSE cancellation).
 */

/** Upstream SSE / rate-limit headers echoed back to the browser. */
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "x-source-categories",
  "retry-after",
  "x-lume-quota-warning",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "access-control-expose-headers",
] as const;

/** 30 messages × 4000 chars plus history/envelope overhead, generously. */
const MAX_CHAT_BODY_BYTES = 262144;

/** Upstream can stream for a while; cap a stuck turn without truncating a
 * normal one. The client abort signal closes it sooner on disconnect. */
const UPSTREAM_TIMEOUT_MS = 120000;

export async function conciergeChat(request: Request) {
  const headers = new Headers({
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
    if (!configured) return json("Chat upstream not configured", 503);
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
      return json("Invalid chat upstream", 503);
    upstream.pathname = "/api/chat";
    upstream.searchParams.set("tenant", tenant.slug);

    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_CHAT_BODY_BYTES)
      return json("Request too large", 413);

    const forwarded = new Headers({
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      Origin: origin,
      "X-Lume-Tenant": tenant.slug,
    });
    // Preserve the real client IP so the upstream rate-limits correctly.
    const xff = request.headers.get("x-forwarded-for");
    if (xff) forwarded.set("x-forwarded-for", xff);
    // Forward ONLY the signed visitor-session cookie, if present.
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

    // Propagate client disconnect to the upstream, with a hard timeout cap.
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    ]);

    const response = await fetch(upstream, {
      method: "POST",
      headers: forwarded,
      body,
      cache: "no-store",
      redirect: "error",
      signal,
    });

    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("content-type"))
      headers.set("content-type", "text/event-stream");
    if (!headers.has("cache-control"))
      headers.set("cache-control", "no-cache, no-transform");

    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    if (error instanceof RejectedTenantRequest)
      return json("Unknown or inactive tenant", 404);
    if (error instanceof DOMException && error.name === "AbortError")
      // Client went away (or the cap fired); nothing to return.
      return new Response(null, { status: 499, headers });
    return json("Chat service unreachable", 502);
  }
}
