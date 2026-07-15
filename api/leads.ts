// Thin same-origin proxy for public lead capture.
//
// The canonical implementation lives in apps/admin/app/api/leads/route.ts and
// owns validation, rate limiting, quota enforcement, visitor attribution,
// loyalty accrual, notifications, duplicate handling, and CRM webhooks. Keeping
// those rules in one place prevents the public and admin deployments from
// drifting apart.

const VISITOR_SESSION_COOKIE_NAME = "lume_visitor_session";
const EXPLICIT_UPSTREAM_URL = process.env.LUME_LEADS_UPSTREAM_URL;
const CHAT_UPSTREAM_URL = process.env.LUME_CHAT_UPSTREAM_URL;
const BYPASS_SECRET = process.env.LUME_CHAT_BYPASS_SECRET;

const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "origin",
  "x-lume-tenant",
  "x-forwarded-for",
  "user-agent",
  "referer",
  "cookie",
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "x-lume-quota-warning",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
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

  const upstreamBase = resolveUpstreamUrl();
  if (!upstreamBase) {
    console.error(
      "[/api/leads proxy] neither LUME_LEADS_UPSTREAM_URL nor LUME_CHAT_UPSTREAM_URL is configured",
    );
    return res.status(500).json({ error: "Lead capture upstream not configured" });
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const rawValue = header(req, name);
    const value = name === "cookie" ? visitorSessionCookieHeader(rawValue) : rawValue;
    if (value) headers[name] = value;
  }
  if (BYPASS_SECRET) headers["x-vercel-protection-bypass"] = BYPASS_SECRET;

  const tenantQuery = query(req, "tenant");
  const upstreamUrl = tenantQuery
    ? `${upstreamBase}${upstreamBase.includes("?") ? "&" : "?"}tenant=${encodeURIComponent(tenantQuery)}`
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
    return res.status(502).json({ error: "Lead capture service unreachable" });
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

function resolveUpstreamUrl(): string | null {
  if (EXPLICIT_UPSTREAM_URL?.trim()) return EXPLICIT_UPSTREAM_URL.trim();
  if (!CHAT_UPSTREAM_URL?.trim()) return null;
  try {
    const url = new URL(CHAT_UPSTREAM_URL.trim());
    url.pathname = "/api/leads";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Forward only the LUME visitor token; never proxy unrelated browser cookies. */
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

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}
