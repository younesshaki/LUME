/**
 * /api/leads on the public Vite deployment — thin same-origin proxy.
 *
 * The canonical lead implementation lives in apps/admin/app/api/leads/route.ts
 * and owns validation, tenant scoping, visitor attribution, Turnstile, quotas,
 * loyalty, email notifications, and CRM webhooks. Keeping this function as a
 * proxy prevents the two deployments from drifting.
 *
 * LUME_LEADS_UPSTREAM_URL may point directly to the admin /api/leads route.
 * When omitted, the URL is derived from LUME_CHAT_UPSTREAM_URL so existing
 * deployments do not need another environment variable immediately.
 */
const VISITOR_SESSION_COOKIE_NAME = "lume_visitor_session";

const CHAT_UPSTREAM_URL = process.env.LUME_CHAT_UPSTREAM_URL;
const UPSTREAM_URL =
  process.env.LUME_LEADS_UPSTREAM_URL ??
  CHAT_UPSTREAM_URL?.replace(/\/api\/chat\/?(?:\?.*)?$/, "/api/leads");
const BYPASS_SECRET =
  process.env.LUME_LEADS_BYPASS_SECRET ?? process.env.LUME_CHAT_BYPASS_SECRET;

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
  "cache-control",
  "retry-after",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "x-lume-quota-warning",
  "x-lume-quota-limit",
  "x-lume-quota-remaining",
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
  send: (payload: string) => void;
  end: () => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "OPTIONS") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!UPSTREAM_URL) {
    console.error("[/api/leads proxy] lead upstream not configured");
    return res.status(500).json({ error: "Lead capture is temporarily unavailable" });
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const rawValue = header(req, name);
    const value = name === "cookie" ? visitorSessionCookieHeader(rawValue) : rawValue;
    if (value) headers[name] = value;
  }
  if (BYPASS_SECRET) headers["x-vercel-protection-bypass"] = BYPASS_SECRET;

  const tenantQuery = query(req, "tenant");
  const upstreamUrl = new URL(UPSTREAM_URL);
  if (tenantQuery) upstreamUrl.searchParams.set("tenant", tenantQuery);

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
    return res.status(502).json({ error: "Lead capture is temporarily unavailable" });
  }

  res.status(upstream.status);
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  const body = await upstream.text();
  if (!body) return res.end();
  return res.send(body);
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

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}
