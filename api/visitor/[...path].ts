/** Credential-preserving proxy from the public Vite deployment to admin visitor APIs. */

// Inlined on purpose: this standalone Vercel function is bundled without its
// relative deps, and root package.json is "type":"module", so a
// `../visitorSessionCookie` import fails at runtime (ERR_MODULE_NOT_FOUND).
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

const CHAT_UPSTREAM_URL = process.env.LUME_CHAT_UPSTREAM_URL;
const BYPASS_SECRET = process.env.LUME_CHAT_BYPASS_SECRET;
const ALLOWED_PATHS = new Set([
  "signup",
  "login",
  "logout",
  "me",
  "loyalty",
  "chat-history",
  "saved-vehicles",
]);
const REQUEST_HEADERS = [
  "content-type",
  "origin",
  "x-lume-tenant",
  "x-forwarded-for",
  "cookie",
] as const;
const RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "set-cookie",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-credentials",
  "vary",
] as const;

type VercelRequest = {
  method?: string;
  url?: string;
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
  if (!req.method || !["GET", "POST", "OPTIONS"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const path = extractVisitorPath(req);
  const route = path === "saved-vehicles" || /^saved-vehicles\/[0-9a-f-]+$/i.test(path)
    ? "saved-vehicles"
    : path;
  if (!path || !ALLOWED_PATHS.has(route)) {
    return res.status(404).json({ error: "Visitor endpoint not found" });
  }
  if (!CHAT_UPSTREAM_URL) {
    return res.status(503).json({ error: "Visitor API upstream not configured" });
  }

  const headers: Record<string, string> = {};
  for (const name of REQUEST_HEADERS) {
    const rawValue = header(req, name);
    const value = name === "cookie" ? visitorSessionCookieHeader(rawValue) : rawValue;
    if (value) headers[name] = value;
  }
  if (BYPASS_SECRET) headers["x-vercel-protection-bypass"] = BYPASS_SECRET;

  const upstream = new URL(`/api/visitor/${path}`, CHAT_UPSTREAM_URL);
  const tenant = query(req, "tenant");
  if (tenant) upstream.searchParams.set("tenant", tenant);

  let response: Response;
  try {
    response = await fetch(upstream, {
      method: req.method,
      headers,
      body: req.method === "POST"
        ? typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})
        : undefined,
    });
  } catch {
    return res.status(502).json({ error: "Visitor API upstream unreachable" });
  }

  res.status(response.status);
  for (const name of RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  if (!response.body) return res.end();

  const reader = response.body.getReader();
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

/**
 * Resolve the visitor sub-path (e.g. "signup"). Parse the request URL first —
 * that is deterministic — and only fall back to the [...path] catch-all query
 * param, whose shape (string vs array vs absent) has varied across Vercel Node
 * runtimes and was returning empty here, yielding a spurious 404.
 */
function extractVisitorPath(req: VercelRequest): string {
  if (typeof req.url === "string" && req.url) {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const match = pathname.match(/\/api\/visitor\/(.+)$/);
      if (match?.[1]) return decodeURIComponent(match[1].replace(/^\/+|\/+$/g, ""));
    } catch {
      // fall through to the query param
    }
  }
  const raw = req.query?.path;
  const joined = Array.isArray(raw) ? raw.join("/") : raw ?? "";
  return joined.replace(/^\/+|\/+$/g, "");
}

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}
