/**
 * Cheap CSRF/abuse mitigation for public API routes that don't require auth.
 * Allows the request only if its Origin header matches the comma-separated
 * ALLOWED_CHAT_ORIGINS env var. Browsers always send Origin on cross-site
 * requests, so this blocks the simplest form of abuse without adding cost.
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
  if (!origin) return false;
  return allowed.includes(origin);
}

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  if (!isAllowedOrigin(request)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Lume-Tenant",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}
