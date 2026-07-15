/**
 * /api/chat on the public Vite deployment — thin same-origin proxy (SCRUM-119).
 *
 * The single chat implementation (RAG + @lume/bot tool-calling) lives in the
 * admin app: apps/admin/app/api/chat/route.ts. This function only exists so
 * the public site can keep calling a same-origin URL; it forwards the request
 * to the admin deployment and pipes the SSE response back untouched.
 *
 * Config: LUME_CHAT_UPSTREAM_URL (required) — the admin deployment's
 * /api/chat URL. There is deliberately no default: lume-admin.vercel.app is
 * NOT this repo's admin app (the global subdomain belongs to an older
 * prototype project), and the real deployment URL is env-specific.
 * ALLOWED_CHAT_ORIGINS on the *admin* project must include this site's
 * origin, which is forwarded unchanged. If the admin project has Vercel
 * Deployment Protection enabled, set LUME_CHAT_BYPASS_SECRET to the
 * project's Protection Bypass for Automation secret.
 *
 * Note: DEEPSEEK_API_KEY is no longer read here — after rotating the key
 * (SCRUM-115) it only needs to exist on the admin project.
 */

// Inlined on purpose: this standalone Vercel function is bundled without its
// relative deps, and root package.json is "type":"module", so a
// `./visitorSessionCookie` import fails at runtime (ERR_MODULE_NOT_FOUND).
const VISITOR_SESSION_COOKIE_NAME = "lume_visitor_session";

/** Forward only the visitor session token; never proxy unrelated browser cookies. */
function visitorSessionCookieHeader(rawCookie: string | undefined): string | undefined {
  if (!rawCookie) return undefined;
  for (const part of rawCookie.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1);
    if (name === VISITOR_SESSION_COOKIE_NAME && value) {
      return `${VISITOR_SESSION_COOKIE_NAME}=${value}`;
    }
  }
  return undefined;
}

const UPSTREAM_URL = process.env.LUME_CHAT_UPSTREAM_URL;
const BYPASS_SECRET = process.env.LUME_CHAT_BYPASS_SECRET;

// x-forwarded-for is forwarded so the upstream's per-IP rate limiting keys
// on the real client, not this proxy's egress IP.
const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "origin",
  "x-lume-tenant",
  "x-forwarded-for",
  "cookie",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "retry-after",
  "x-source-categories",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "x-lume-quota-warning",
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

  if (!UPSTREAM_URL) {
    console.error("[/api/chat proxy] LUME_CHAT_UPSTREAM_URL not configured");
    return res.status(500).json({ error: "Chat upstream not configured" });
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const rawValue = header(req, name);
    const value = name === "cookie" ? visitorSessionCookieHeader(rawValue) : rawValue;
    if (value) headers[name] = value;
  }
  if (BYPASS_SECRET) headers["x-vercel-protection-bypass"] = BYPASS_SECRET;

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
