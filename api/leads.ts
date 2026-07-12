import { createClient } from "@supabase/supabase-js";
import { recordPublicUsage, type UsageRpc } from "./usage";

/**
 * POST /api/leads — public lead capture for the Vite site (same-origin).
 *
 * Mirrors apps/admin/app/api/leads/route.ts but as a Vercel serverless function
 * on the public deployment, so the public site can submit leads same-origin
 * (like /api/vehicles and /api/chat). The browser uses anon creds only; this
 * trusted route validates origin + tenant, then writes with the service-role
 * client because `leads` intentionally has no anon insert policy.
 */
const SUBDOMAIN_RESERVED = new Set(["www", "app", "api", "admin", "static", "cdn"]);
const ALLOWED_PUBLIC_SOURCES = new Set(["chat", "contact-form", "test-drive", "api"]);

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
  end: () => void;
};

type NormalizedLead = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  vehicleId: string | null;
  source: "chat" | "contact-form" | "test-drive" | "api";
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(req, res, { error: "Method not allowed" }, 405);
  }

  if (!isAllowedOrigin(req)) {
    return json(req, res, { error: "Forbidden origin" }, 403);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, res, { error: "Supabase server env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenant = await getTenantFromRequest(req, supabase);
  if (!tenant) {
    return json(req, res, { error: "Unknown or inactive tenant" }, 404);
  }

  const validation = normalizeLeadCaptureInput(req.body);
  if (!validation.ok) {
    return json(req, res, { error: validation.error }, 400);
  }
  const lead = validation.value;

  await recordPublicUsage(
    (name, args) => supabase.rpc(name, args) as ReturnType<UsageRpc>,
    tenant.tenantId,
    "lead_requests",
  );

  const { data, error } = await supabase
    .from("leads")
    .insert({
      tenant_id: tenant.tenantId,
      source: lead.source,
      status: "new",
      assigned_to: null,
      first_name: lead.firstName,
      last_name: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      vehicle_id: lead.vehicleId,
      utm_source: lead.utmSource,
      utm_medium: lead.utmMedium,
      utm_campaign: lead.utmCampaign,
      referrer: header(req, "referer") ?? null,
      ip_addr: requestIp(req),
      user_agent: header(req, "user-agent") ?? null,
      lost_reason: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[/api/leads] insert failed:", error?.message ?? "no row");
    return json(req, res, { error: "Unable to capture lead" }, 500);
  }

  return json(req, res, { leadId: data.id }, 201);
}

function normalizeLeadCaptureInput(
  input: unknown
): { ok: true; value: NormalizedLead } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: "Request body must be an object." };

  const email = nullableTrimmed(input.email, 160);
  const phone = nullableTrimmed(input.phone, 60);
  if (!email && !phone) return { ok: false, error: "Email or phone is required." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email is invalid." };
  }

  const rawSource = input.source;
  const source =
    typeof rawSource === "string" && ALLOWED_PUBLIC_SOURCES.has(rawSource)
      ? (rawSource as NormalizedLead["source"])
      : "contact-form";

  return {
    ok: true,
    value: {
      firstName: nullableTrimmed(input.firstName, 120) ?? "",
      lastName: nullableTrimmed(input.lastName, 120) ?? "",
      email,
      phone,
      message: nullableTrimmed(input.message, 2_000),
      vehicleId: nullableTrimmed(input.vehicleId, 80),
      source,
      utmSource: nullableTrimmed(input.utmSource, 120),
      utmMedium: nullableTrimmed(input.utmMedium, 120),
      utmCampaign: nullableTrimmed(input.utmCampaign, 120),
    },
  };
}

async function getTenantFromRequest(
  req: VercelRequest,
  supabase: any
): Promise<{ tenantId: string; slug: string } | null> {
  const slug = extractTenantSlugFromRequest(req);
  if (!slug) return null;

  const { data, error } = await supabase.rpc("tenant_by_slug", { p_slug: slug });
  if (error) {
    console.error("[tenant] tenant_by_slug RPC failed:", error.message);
    return null;
  }
  const row = (data as Array<{ id: string; slug: string; status: string }> | null)?.[0];
  if (!row || row.status !== "active") return null;
  return { tenantId: row.id, slug: row.slug };
}

function extractTenantSlugFromRequest(req: VercelRequest): string | null {
  const headerSlug = header(req, "x-lume-tenant")?.trim();
  if (headerSlug) return headerSlug;

  const querySlug = query(req, "tenant")?.trim();
  if (querySlug) return querySlug;

  const host = header(req, "host");
  if (!host) return null;
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (SUBDOMAIN_RESERVED.has(sub)) return null;
  return sub || null;
}

function isAllowedOrigin(req: VercelRequest): boolean {
  const allowed = (process.env.ALLOWED_CHAT_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;

  const origin = header(req, "origin");
  if (!origin) return true;
  return allowed.includes(origin);
}

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = header(req, "origin") ?? "";
  if (!origin || !isAllowedOrigin(req)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lume-Tenant");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");
}

function requestIp(req: VercelRequest): string | null {
  const forwarded = header(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return header(req, "cf-connecting-ip") ?? null;
}

function json(req: VercelRequest, res: VercelResponse, payload: unknown, status: number) {
  setCorsHeaders(req, res);
  return res.status(status).json(payload);
}

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}

function nullableTrimmed(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
