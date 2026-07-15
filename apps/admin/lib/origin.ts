/**
 * Cheap CSRF/abuse mitigation for public API routes that don't require auth.
 * Allows the request if its Origin matches the comma-separated
 * ALLOWED_CHAT_ORIGINS env var — OR if there is no Origin header at all.
 *
 * A cross-site attacker's browser request ALWAYS carries an Origin, so it's
 * still blocked. An absent Origin only happens for same-origin GETs (e.g. the
 * public site's same-origin inventory fetch, including behind the local Vite
 * dev proxy, where browsers omit Origin) and non-browser clients — neither of
 * which is a cross-site threat. This mirrors the public root api/*.ts origin
 * check; keeping them consistent is what lets local dev (public -> admin proxy)
 * work the same as production.
 *
 * For stronger protection, layer Vercel BotID on top.
 */
export function isAllowedOrigin(request: Request): boolean {
  const allowed = (process.env.ALLOWED_CHAT_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowed.length === 0) {
    // Dev fallback: if nothing's configured, allow anything but warn loudly.
    if (process.env.NODE_ENV === "production") return false;
    console.warn(
      "[origin] ALLOWED_CHAT_ORIGINS is empty — allowing all in dev only."
    );
    return true;
  }
  const origin = request.headers.get("origin");
  return !origin || allowed.includes(origin);
}

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  if (!isAllowedOrigin(request)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Lume-Tenant",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "X-Lume-Quota-Warning",
    Vary: "Origin",
  };
}
