/**
 * /api/chat on the public Vite deployment — thin same-origin proxy (SCRUM-119).
 *
 * The single chat implementation (RAG + @lume/bot tool-calling) lives in the
 * admin app: apps/admin/app/api/chat/route.ts. This function only exists so
 * the public site can keep calling a same-origin URL; it forwards the request
 * to the admin deployment and pipes the SSE response back untouched.
 *
 * Config: LUME_CHAT_UPSTREAM_URL overrides the upstream (defaults to the
 * lume-admin production deployment). ALLOWED_CHAT_ORIGINS on the *admin*
 * project must include this site's origin, which is forwarded unchanged.
 *
 * Note: DEEPSEEK_API_KEY is no longer read here — after rotating the key
 * (SCRUM-115) it only needs to exist on the lume-admin project.
 */

const UPSTREAM_URL =
  process.env.LUME_CHAT_UPSTREAM_URL ?? "https://lume-admin.vercel.app/api/chat";

const FORWARDED_REQUEST_HEADERS = ["content-type", "origin", "x-lume-tenant"] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "x-source-categories",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "vary",
] as const;

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  url?: string;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (payload: unknown) => void;
  write: (chunk: Uint8Array | string) => void;
  end: () => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "OPTIONS") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = header(req, name);
    if (value) headers[name] = value;
  }

  // Preserve ?tenant= fallback used by lib/tenant.ts upstream.
  const tenantQuery = query(req, "tenant");
  const upstreamUrl = tenantQuery
    ? `${UPSTREAM_URL}?tenant=${encodeURIComponent(tenantQuery)}`
    : UPSTREAM_URL;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body:
        req.method === "POST"
          ? typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body ?? {})
          : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream unreachable";
    console.error("[/api/chat proxy] upstream fetch failed:", message);
    return res.status(502).json({ error: "Chat upstream unreachable" });
  }

  res.status(upstream.status);
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  if (!upstream.body) {
    return res.end();
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}
