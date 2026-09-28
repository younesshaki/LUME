// Thin same-origin proxy for cookie-consent reporting (src/lib/consentReporting.ts),
// mirroring api/events.ts. The admin app owns /api/consent; without this the
// public site answered every consent choice with a 404 (found 2026-09-28).
// Standalone on purpose: root api/* functions cannot import @lume/* packages.
type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>; query: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; setHeader: (name: string, value: string) => void; json: (body: unknown) => void; write: (chunk: Uint8Array | string) => void; end: () => void };

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST" && req.method !== "OPTIONS") return res.status(405).json({ error: "Method not allowed" });
  const upstreamBase = process.env.LUME_CHAT_UPSTREAM_URL;
  if (!upstreamBase) return res.status(503).json({ error: "Consent upstream not configured" });
  const url = new URL(upstreamBase); url.pathname = "/api/consent"; url.search = ""; url.hash = "";
  const headers: Record<string, string> = {};
  for (const name of ["content-type", "origin", "x-lume-tenant", "x-forwarded-for"] as const) {
    const raw = req.headers[name]; const value = Array.isArray(raw) ? raw[0] : raw; if (value) headers[name] = value;
  }
  const bypass = process.env.LUME_CHAT_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  try {
    const upstream = await fetch(url, { method: req.method, headers, body: req.method === "POST" ? typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}) : undefined });
    res.status(upstream.status);
    for (const name of ["content-type", "retry-after", "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "vary"] as const) { const value = upstream.headers.get(name); if (value) res.setHeader(name, value); }
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader(); try { for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); } } finally { reader.releaseLock(); res.end(); }
  } catch { return res.status(502).json({ error: "Consent upstream unreachable" }); }
}
