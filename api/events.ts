// Thin same-origin proxy for consent-gated public conversion analytics.
const UPSTREAM = process.env.LUME_CHAT_UPSTREAM_URL;
const BYPASS = process.env.LUME_CHAT_BYPASS_SECRET;
type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>; query: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; setHeader: (name: string, value: string) => void; json: (body: unknown) => void; write: (chunk: Uint8Array | string) => void; end: () => void };
export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST" && req.method !== "OPTIONS") return res.status(405).json({ error: "Method not allowed" });
  if (!UPSTREAM) return res.status(503).json({ error: "Analytics upstream not configured" });
  const url = new URL(UPSTREAM); url.pathname = "/api/events"; url.search = ""; url.hash = "";
  const headers: Record<string, string> = {};
  for (const name of ["content-type", "origin", "x-lume-tenant", "x-forwarded-for"] as const) {
    const raw = req.headers[name]; const value = Array.isArray(raw) ? raw[0] : raw; if (value) headers[name] = value;
  }
  if (BYPASS) headers["x-vercel-protection-bypass"] = BYPASS;
  try {
    const upstream = await fetch(url, { method: req.method, headers, body: req.method === "POST" ? typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}) : undefined });
    res.status(upstream.status);
    for (const name of ["content-type", "retry-after", "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "vary"] as const) { const value = upstream.headers.get(name); if (value) res.setHeader(name, value); }
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader(); try { for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); } } finally { reader.releaseLock(); res.end(); }
  } catch { return res.status(502).json({ error: "Analytics upstream unreachable" }); }
}
