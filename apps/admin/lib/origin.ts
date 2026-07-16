/**
 * Cheap CSRF/abuse mitigation for public API routes that don't require auth.
 * Allows the request if its Origin matches the comma-separated
 * ALLOWED_CHAT_ORIGINS env var. Originless requests are accepted only for
 * safe/read-only methods because browsers commonly omit Origin on same-origin
 * GETs.
 *
 * State-changing requests must carry an allowed Origin. This avoids treating
 * non-browser clients or privacy tools that omit Origin as proof of same-origin
 * intent. The Vite proxy supplies its local Origin when a browser omits it.
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
  if (origin) return allowed.includes(origin);
  return isSafeMethod(request.method);
}

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(request)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Lume-Tenant",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "X-Lume-Quota-Warning",
    Vary: "Origin",
  };
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}
