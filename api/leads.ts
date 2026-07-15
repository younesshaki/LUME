/**
 * /api/leads on the public Vite deployment — thin same-origin proxy.
 *
 * The canonical implementation lives in apps/admin/app/api/leads/route.ts and
 * owns validation, Turnstile, quotas, visitor attribution, loyalty, email, and
 * CRM webhooks. Keeping this function transport-only prevents those behaviors
 * from drifting across deployments.
 *
 * Config:
 * - LUME_LEADS_UPSTREAM_URL (preferred): admin deployment /api/leads URL.
 * - LUME_CHAT_UPSTREAM_URL fallback: when it ends in /api/chat, the leads URL
 *   is derived automatically so existing public deployments need no new env.
 */
const VISITOR_SESSION_COOKIE_NAME = "lume_visitor_session";

const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "origin",
  "x-lume-tenant",
  "x-forwarded-for",
  "referer",
  "user-agent",
  "cookie",
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "retry-after",
  "x-lume-quota-warning",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "vary",
] as const;

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
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

  const upstreamBase = resolveLeadsUpstreamUrl();
  if (!upstreamBase) {
    console.error("[/api/leads proxy] lead upstream not configured");
    return res.status(500).json({ error: "Lead upstream not configured" });
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const rawValue = header(req, name);
    const value = name === "cookie" ? visitorSessionCookieHeader(rawValue) : rawValue;
    if (value) headers[name] = value;
  }

  const bypassSecret = (
    process.env.LUME_LEADS_BYPASS_SECRET ?? process.env.LUME_CHAT_BYPASS_SECRET
  )?.trim();
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;

  const tenantQuery = query(req, "tenant");
  const upstreamUrl = tenantQuery
    ? appendTenantQuery(upstreamBase, tenantQuery)
    : upstreamBase;

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
    console.error("[/api/leads proxy] upstream fetch failed:", message);
    return res.status(502).json({ error: "Lead upstream unreachable" });
  }

  res.status(upstream.status);
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  if (!upstream.body) return res.end();

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

function resolveLeadsUpstreamUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const explicit = env.LUME_LEADS_UPSTREAM_URL?.trim();
  if (explicit) return validAbsoluteUrl(explicit);

  const chatUpstream = env.LUME_CHAT_UPSTREAM_URL?.trim();
  if (!chatUpstream) return null;
  try {
    const url = new URL(chatUpstream);
    if (!/\/api\/chat\/?$/.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\/api\/chat\/?$/, "/api/leads");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function validAbsoluteUrl(value: string): string | null {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function appendTenantQuery(base: string, tenant: string): string {
  const url = new URL(base);
  url.searchParams.set("tenant", tenant);
  return url.toString();
}

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}
