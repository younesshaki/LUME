/**
 * The deterministic control plane for the authenticated admin concierge.
 *
 * This module intentionally contains no model call, database access, React
 * state, or server action. It defines the only capabilities the first release
 * may expose and turns common, unambiguous wording into a closed command
 * intent. Route handlers resolve and authorize every resource separately.
 */

export const ADMIN_CONCIERGE_LIMITS = {
  maxBodyBytes: 32 * 1024,
  maxMessageLength: 2_000,
} as const;

export type AdminCapabilityEffect = "read" | "navigate" | "draft" | "write" | "destructive" | "sensitive";
export type AdminConfirmation = "none" | "standard" | "typed";
export type AdminRole = "viewer" | "editor" | "admin" | "owner";

const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export type AdminCapability = {
  id: string;
  title: string;
  effect: AdminCapabilityEffect;
  minRole: AdminRole;
  confirmation: AdminConfirmation;
  route: string;
  aliases: readonly string[];
};

/**
 * This is deliberately an allowlist, not a dashboard sitemap inferred from
 * the UI. New capabilities must state their effect and confirmation policy
 * before a planner can ever name them.
 */
export const ADMIN_CAPABILITIES: readonly AdminCapability[] = [
  capability("overview.view", "Open overview", "navigate", "viewer", "/", ["overview", "dashboard", "home"]),
  capability("overview.summary", "Summarize dashboard", "read", "viewer", "/", ["dashboard summary", "overview summary", "summarize dashboard"]),
  capability("vehicles.search", "Find vehicles", "read", "viewer", "/vehicles", ["vehicle", "vehicles", "inventory", "car", "cars"]),
  capability("inventory.photo_gap", "Report vehicles missing photos", "read", "viewer", "/vehicles", ["missing photos", "no photos", "without photos", "missing images", "without images", "photo gap", "need photos", "photo coverage"]),
  capability("vehicles.new", "Open the new-vehicle form", "navigate", "editor", "/vehicles/new", ["add vehicle", "add a vehicle", "new vehicle", "create vehicle", "add car", "add a car", "new car"]),
  capability("vehicles.import", "Open inventory import", "navigate", "editor", "/vehicles/import", ["import inventory", "import vehicles", "import csv", "upload inventory", "upload vehicles", "bulk import", "csv import"]),
  capability("leads.search", "Find leads", "read", "viewer", "/leads", ["lead", "leads", "inquiry", "inquiries"]),
  capability("lead.status.update", "Update one lead status", "write", "editor", "/leads", ["mark lead", "update lead"], "standard"),
  capability("customers.view", "Open customers", "navigate", "viewer", "/customers", ["customer", "customers", "customer 360"]),
  capability("customers.search", "Find customers", "read", "viewer", "/customers", ["find customer", "search customer", "look up customer"]),
  capability("loyalty.view", "Open loyalty", "navigate", "viewer", "/loyalty", ["loyalty", "rewards", "tiers"]),
  capability("website.view", "Open website studio", "navigate", "viewer", "/website", ["website", "site", "site studio"]),
  capability("pages.view", "Open pages", "navigate", "viewer", "/pages", ["page", "pages", "page builder"]),
  capability("pages.search", "Find pages", "read", "viewer", "/pages", ["find page", "search page", "look up page"]),
  capability("pages.new", "Open the new-page builder", "navigate", "editor", "/pages/new", ["add page", "new page", "create page", "build a page"]),
  capability("templates.view", "Open templates", "navigate", "viewer", "/templates", ["template", "templates"]),
  capability("design.view", "Open design", "navigate", "viewer", "/design", ["design", "theme", "colors"]),
  capability("navigation.view", "Open navigation", "navigate", "viewer", "/navigation", ["navigation", "header", "menu"]),
  capability("branding.view", "Open brand assets", "navigate", "viewer", "/branding", ["branding", "brand", "logo"]),
  capability("assets.view", "Open assets", "navigate", "viewer", "/assets", ["assets", "media", "uploads"]),
  capability("analytics.view", "Open analytics", "navigate", "viewer", "/analytics", ["analytics", "metrics", "performance"]),
  capability("feeds.view", "Open inventory feeds", "navigate", "viewer", "/settings/inventory-feeds", ["inventory feeds", "managed feeds", "feed", "feeds", "syndication", "export", "exports"]),
  capability("feeds.inspect", "Inspect inventory feed health", "read", "viewer", "/settings/inventory-feeds", ["failed feed", "feed health", "feed run", "feed runs", "sync failure"]),
  capability("feed.run.enqueue", "Queue one managed feed run", "write", "admin", "/settings/inventory-feeds", ["run feed", "run inventory feed", "sync feed"], "standard"),
  capability("team.view", "Open team", "navigate", "viewer", "/team", ["team", "staff", "members"]),
  capability("concierge.view", "Open concierge configuration", "navigate", "viewer", "/persona", ["concierge", "bot", "persona", "ai configuration"]),
  capability("concierge.targets.view", "Open concierge targets", "navigate", "viewer", "/concierge-targets", ["concierge targets", "bot targets", "assistant targets", "targets"]),
  capability("knowledge.view", "Open knowledge", "navigate", "viewer", "/knowledge", ["knowledge", "rag", "documents"]),
  capability("domains.view", "Open domains", "navigate", "viewer", "/domains", ["domain", "domains"]),
  capability("billing.view", "Open billing", "navigate", "viewer", "/settings/billing", ["billing", "subscription", "plan"]),
  capability("api_keys.view", "Open API keys", "navigate", "viewer", "/settings/api-keys", ["api keys", "api key"]),
  capability("integrations.view", "Open integrations", "navigate", "viewer", "/settings/integrations", ["integration", "integrations", "webhook", "webhooks"]),
  capability("preferences.view", "Open system preferences", "navigate", "viewer", "/settings/system-preferences", ["system preferences", "preferences"]),
] as const;

function capability(
  id: string,
  title: string,
  effect: AdminCapabilityEffect,
  minRole: AdminRole,
  route: string,
  aliases: readonly string[],
  confirmation: AdminConfirmation = "none",
): AdminCapability {
  return { id, title, effect, minRole, confirmation, route, aliases };
}

export type AdminConciergeIntent =
  | { kind: "navigate"; capabilityId: string }
  | { kind: "clarify"; question: string }
  | { kind: "describe_current_page" }
  | { kind: "summarize_concierge_config" }
  | { kind: "summarize_overview" }
  | { kind: "search_vehicles"; query: string | null }
  | { kind: "search_leads"; status: "new" | "contacted" | "qualified" | "won" | "lost" | null }
  | { kind: "search_customers"; query: string | null }
  | { kind: "search_pages"; query: string | null }
  | { kind: "inspect_feed_runs"; status: "failed" | "dead_letter" | "partial" | null }
  | { kind: "inspect_photo_gap" }
  | { kind: "enqueue_feed_run"; feedQuery: string }
  | { kind: "update_lead_status"; leadQuery: string; status: "new" | "contacted" | "qualified" | "won" }
  | { kind: "unsupported" };

export type AdminConciergeModelPlan =
  | { kind: "navigate"; capabilityId: string }
  | { kind: "describe_current_page" }
  | { kind: "summarize_concierge_config" }
  | { kind: "summarize_overview" }
  | { kind: "search_vehicles"; query: string | null }
  | { kind: "search_leads"; status: "new" | "contacted" | "qualified" | "won" | "lost" | null }
  | { kind: "search_customers"; query: string | null }
  | { kind: "search_pages"; query: string | null }
  | { kind: "inspect_feed_runs"; status: "failed" | "dead_letter" | "partial" | null }
  | { kind: "inspect_photo_gap" }
  | { kind: "enqueue_feed_run"; feedQuery: string }
  | { kind: "update_lead_status"; leadQuery: string; status: "new" | "contacted" | "qualified" | "won" }
  | { kind: "clarify" };

export type AdminConciergeRequest = {
  tenantSlug: string;
  message: string;
  currentPath?: string;
  sessionId?: string;
};

export type ParsedAdminConciergeRequest =
  | { ok: true; request: AdminConciergeRequest }
  | { ok: false; error: string };

export function parseAdminConciergeRequest(body: unknown): ParsedAdminConciergeRequest {
  if (!isRecord(body)) return { ok: false, error: "Request body must be an object." };
  const tenantSlug = typeof body.tenantSlug === "string" ? body.tenantSlug.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!tenantSlug) return { ok: false, error: "tenantSlug is required." };
  if (!message) return { ok: false, error: "message is required." };
  if (message.length > ADMIN_CONCIERGE_LIMITS.maxMessageLength) {
    return { ok: false, error: "message is too long." };
  }
  return {
    ok: true,
    request: {
      tenantSlug,
      message,
      ...(typeof body.currentPath === "string" && body.currentPath.startsWith("/admin/")
        ? { currentPath: body.currentPath.slice(0, 500) }
        : {}),
      ...(typeof body.sessionId === "string" && isUuid(body.sessionId)
        ? { sessionId: body.sessionId }
        : {}),
    },
  };
}

/** Only deterministic, high-confidence phrases execute in the first release. */
export function compileDeterministicAdminIntent(message: string): AdminConciergeIntent {
  const normalized = normalize(message);
  const asksToFind = /\b(find|show|list|search|look up|open)\b/.test(normalized);

  const leadStatusUpdate = extractLeadStatusUpdate(message);
  if (leadStatusUpdate) return { kind: "update_lead_status", ...leadStatusUpdate };

  const feedRunEnqueue = extractFeedRunEnqueue(message);
  if (feedRunEnqueue) return { kind: "enqueue_feed_run", ...feedRunEnqueue };

  // A broad supplier operation must never be quietly reinterpreted as a
  // harmless health search. It requires a future, separately reviewed bulk
  // capability with an exact scope and typed confirmation.
  if (/\b(?:run|sync|refresh|enqueue)\s+(?:every|all)\s+(?:inventory\s+)?feeds?\b/.test(normalized)) {
    return { kind: "unsupported" };
  }

  if (/\b(?:where am i|what (?:page|screen|section) am i on|what can i do here)\b/.test(normalized)) {
    return { kind: "describe_current_page" };
  }

  if (/\b(?:what model|which model|concierge configuration|bot configuration|what (?:tools|can) (?:does )?(?:the )?(?:concierge|bot) (?:use|have))\b/.test(normalized)) {
    return { kind: "summarize_concierge_config" };
  }

  if (/\b(?:dashboard|overview)\b/.test(normalized) && /\b(?:summary|summarize|status|snapshot|how are things)\b/.test(normalized)) {
    return { kind: "summarize_overview" };
  }

  if (isFeedInspectionRequest(normalized)) {
    return { kind: "inspect_feed_runs", status: feedRunStatusFromMessage(normalized) };
  }

  // “Inventory feeds” is a named dashboard surface, not a vehicle query.
  // Keep the generic “inventory” synonym from stealing that navigation intent.
  const namesInventoryFeedSurface = /\b(?:inventory|managed)\s+feeds?\b/.test(normalized);
  if (/\b(missing|without|no|need)\s+(photo|photos|image|images|picture|pictures)\b/.test(normalized)
    || /\bphoto (gap|coverage)\b/.test(normalized)) {
    return { kind: "inspect_photo_gap" };
  }

  if (asksToFind && !namesInventoryFeedSurface && /\b(vehicle|vehicles|inventory|car|cars)\b/.test(normalized)) {
    return { kind: "search_vehicles", query: vehicleQueryFromMessage(message) };
  }
  if (asksToFind && /\b(lead|leads|inquir(?:y|ies))\b/.test(normalized)) {
    return { kind: "search_leads", status: leadStatusFromMessage(normalized) };
  }
  if (asksToFind && /\b(customer|customers|account|accounts)\b/.test(normalized)) {
    return { kind: "search_customers", query: customerQueryFromMessage(message) };
  }
  if (asksToFind && /\b(page|pages)\b/.test(normalized)) {
    return { kind: "search_pages", query: pageQueryFromMessage(message) };
  }

  const hasNavigationLanguage = /\b(open|go to|take me to|show me|view|manage|add|create|new|import|upload)\b/.test(normalized);
  if (hasNavigationLanguage) {
    const capability = findNavigationCapability(normalized);
    if (capability) return { kind: "navigate", capabilityId: capability.id };
    const question = navigationClarification(normalized);
    if (question) return { kind: "clarify", question };
  }
  return { kind: "unsupported" };
}

export function capabilityById(id: string): AdminCapability | null {
  return ADMIN_CAPABILITIES.find((capability) => capability.id === id) ?? null;
}

/**
 * The browser supplies its path as presentation context only. Convert it to a
 * known, tenant-local capability before reflecting it in any assistant reply.
 * Dynamic detail/editor routes deliberately map to their known parent surface.
 */
export function capabilityFromAdminPath(currentPath: string | undefined, tenantSlug: string): AdminCapability | null {
  if (!currentPath) return null;
  const prefix = `/admin/${encodeURIComponent(tenantSlug)}`;
  if (currentPath !== prefix && !currentPath.startsWith(`${prefix}/`)) return null;
  const relativePath = currentPath.slice(prefix.length) || "/";
  const matches = ADMIN_CAPABILITIES
    .filter((capability) => relativePath === capability.route ||
      (capability.route !== "/" && relativePath.startsWith(`${capability.route}/`)))
    .sort((a, b) => b.route.length - a.route.length);
  return matches.length ? matches[0] : null;
}

/**
 * Prefer the most specific whole-phrase alias rather than treating every
 * substring hit as an ambiguity. For example, "inventory feeds" must beat
 * the generic "inventory" vehicle alias. Equal-strength matches stay
 * ambiguous and safely fall through to clarification.
 */
export function findNavigationCapability(normalizedMessage: string): AdminCapability | null {
  const scored = ADMIN_CAPABILITIES.flatMap((capability) => {
    const best = capability.aliases.reduce<{ words: number; characters: number } | null>((current, alias) => {
      if (!containsWholePhrase(normalizedMessage, alias)) return current;
      const candidate = { words: alias.trim().split(/\s+/).length, characters: alias.length };
      if (!current || candidate.words > current.words || (candidate.words === current.words && candidate.characters > current.characters)) {
        return candidate;
      }
      return current;
    }, null);
    return best ? [{ capability, ...best }] : [];
  }).sort((a, b) => b.words - a.words || b.characters - a.characters);
  if (!scored.length) return null;
  const winner = scored[0];
  const tied = scored.filter((candidate) => candidate.words === winner.words && candidate.characters === winner.characters);
  return tied.length === 1 ? winner.capability : null;
}

function containsWholePhrase(message: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?=$|\\s)`, "u").test(message);
}

function navigationClarification(normalizedMessage: string): string | null {
  if (/\bsettings?\b/.test(normalizedMessage)) {
    return "Which settings area should I open: team, domains, billing, API keys, integrations, inventory feeds, or system preferences?";
  }
  if (/\bcrm\b/.test(normalizedMessage)) {
    return "Which CRM area should I open: leads, customers, or loyalty?";
  }
  return null;
}

/** Keep registry policy enforcement independent of route-specific wording. */
export function isAdminRole(value: unknown): value is AdminRole {
  return value === "viewer" || value === "editor" || value === "admin" || value === "owner";
}

export function hasAdminCapabilityRole(actorRole: AdminRole, requiredRole: AdminRole): boolean {
  return ADMIN_ROLE_RANK[actorRole] >= ADMIN_ROLE_RANK[requiredRole];
}

/** Null means a plan names no currently registered capability and must fail closed. */
export function adminIntentMinimumRole(intent: AdminConciergeIntent): AdminRole | null {
  switch (intent.kind) {
    case "navigate":
      return capabilityById(intent.capabilityId)?.minRole ?? null;
    case "update_lead_status":
      return "editor";
    case "enqueue_feed_run":
      return "admin";
    case "clarify":
    case "describe_current_page":
    case "summarize_concierge_config":
    case "summarize_overview":
    case "search_vehicles":
    case "search_leads":
    case "search_customers":
    case "search_pages":
    case "inspect_feed_runs":
    case "inspect_photo_gap":
    case "unsupported":
      return "viewer";
  }
}

/**
 * A model may choose from this closed union only. Its explanatory prose is
 * deliberately ignored: facts and completion wording are built after fresh
 * reads in the route handler.
 */
export function parseAdminConciergeModelPlan(content: string): AdminConciergeModelPlan | null {
  const candidate = stripCodeFences(content).trim();
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!isRecord(parsed) || !isRecord(parsed.intent) || typeof parsed.intent.kind !== "string") return null;
    switch (parsed.intent.kind) {
      case "navigate": {
        const capabilityId = typeof parsed.intent.capabilityId === "string" ? parsed.intent.capabilityId : "";
        const capability = capabilityById(capabilityId);
        return capability && (capability.effect === "read" || capability.effect === "navigate")
          ? { kind: "navigate", capabilityId }
          : null;
      }
      case "describe_current_page":
        return { kind: "describe_current_page" };
      case "summarize_concierge_config":
        return { kind: "summarize_concierge_config" };
      case "summarize_overview":
        return { kind: "summarize_overview" };
      case "search_vehicles":
        return {
          kind: "search_vehicles",
          query: normalizeSearchText(parsed.intent.query),
        };
      case "search_leads": {
        const status = parsed.intent.status;
        return status === null || status === "new" || status === "contacted" || status === "qualified" || status === "won" || status === "lost"
          ? { kind: "search_leads", status }
          : null;
      }
      case "search_customers":
        return { kind: "search_customers", query: normalizeSearchText(parsed.intent.query) };
      case "search_pages":
        return { kind: "search_pages", query: normalizeSearchText(parsed.intent.query) };
      case "inspect_feed_runs": {
        const status = parsed.intent.status;
        return status === null || status === "failed" || status === "dead_letter" || status === "partial"
          ? { kind: "inspect_feed_runs", status }
          : null;
      }
      case "enqueue_feed_run": {
        const feedQuery = normalizeSearchText(parsed.intent.feedQuery);
        return feedQuery ? { kind: "enqueue_feed_run", feedQuery } : null;
      }
      case "update_lead_status": {
        const leadQuery = normalizeSearchText(parsed.intent.leadQuery);
        const status = parsed.intent.status;
        return leadQuery && (status === "new" || status === "contacted" || status === "qualified" || status === "won")
          ? { kind: "update_lead_status", leadQuery, status }
          : null;
      }
      case "clarify":
        return { kind: "clarify" };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function buildAdminConciergeSystemPrompt(): string {
  const catalog = ADMIN_CAPABILITIES.map((capability) =>
    `- ${capability.id}: ${capability.title} (${capability.effect}; aliases: ${capability.aliases.join(", ")})`,
  ).join("\n");
  return [
    "You are LUME's authenticated dashboard concierge. Translate the user's request into exactly one allowed command intent.",
    "You do not have access to tenant data and must not invent facts, records, URLs, IDs, or actions. You cannot execute writes, publish, delete, change roles, handle credentials, billing, domains, API keys, or integrations. You may only PROPOSE a one-lead status update or one named managed-feed run; LUME will resolve, preview, authorize and require confirmation separately.",
    "Return ONLY JSON with this exact shape: {\"intent\":{...}}.",
    "Allowed intents:",
    "- {\"kind\":\"navigate\",\"capabilityId\":\"<one catalog id>\"}",
    "- {\"kind\":\"describe_current_page\"}",
    "- {\"kind\":\"summarize_concierge_config\"}",
    "- {\"kind\":\"summarize_overview\"}",
    "- {\"kind\":\"search_vehicles\",\"query\":\"<make/model/free-text search or null>\"}",
    "- {\"kind\":\"search_leads\",\"status\":\"new\"|\"contacted\"|\"qualified\"|\"won\"|\"lost\"|null}",
    "- {\"kind\":\"search_customers\",\"query\":\"<name/email fragment or null>\"}",
    "- {\"kind\":\"search_pages\",\"query\":\"<page title/slug fragment or null>\"}",
    "- {\"kind\":\"inspect_feed_runs\",\"status\":\"failed\"|\"dead_letter\"|\"partial\"|null}",
    "- {\"kind\":\"enqueue_feed_run\",\"feedQuery\":\"<named managed inventory feed>\"}",
    "- {\"kind\":\"update_lead_status\",\"leadQuery\":\"<lead name or email fragment>\",\"status\":\"new\"|\"contacted\"|\"qualified\"|\"won\"}",
    "- {\"kind\":\"clarify\"} when the request is ambiguous, unsupported, or asks for a change.",
    "Catalog:",
    catalog,
  ].join("\n");
}

export function adminCapabilityHref(tenantSlug: string, capability: AdminCapability): string {
  return `/admin/${encodeURIComponent(tenantSlug)}${capability.route}`;
}

function vehicleQueryFromMessage(message: string): string | null {
  const cleaned = message
    .replace(/\b(find|show|list|search|look up|open|me|all|the|any|vehicles?|inventory|cars?|please|do you have)\b/gi, " ")
    .replace(/\b(under|over|between|less than|more than)\b\s*\$?\d[\d,]*(?:\s*(?:and|to|-)\s*\$?\d[\d,]*)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

function customerQueryFromMessage(message: string): string | null {
  const cleaned = message
    .replace(/\b(find|show|list|search|look up|open|me|all|the|any|customers?|accounts?|please|do you have)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeSearchText(cleaned);
}

function pageQueryFromMessage(message: string): string | null {
  const cleaned = message
    .replace(/\b(find|show|list|search|look up|open|me|all|the|any|pages?|please|site|website)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeSearchText(cleaned);
}

function normalizeSearchText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Lead resolution accepts email fragments, so preserve the bounded email
  // punctuation here. The eventual query still escapes LIKE wildcards and
  // applies a tenant filter; this is not a raw query language.
  const normalized = value.replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function stripCodeFences(value: string): string {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1] : value;
}

function leadStatusFromMessage(normalized: string): "new" | "contacted" | "qualified" | "won" | "lost" | null {
  for (const status of ["new", "contacted", "qualified", "won", "lost"] as const) {
    if (new RegExp(`\\b${status}\\b`).test(normalized)) return status;
  }
  return null;
}

function isFeedInspectionRequest(normalized: string): boolean {
  const mentionsFeed = /\b(feed|feeds|sync|syncs|import|imports)\b/.test(normalized);
  const asksForHealth = /\b(failed|failure|failures|error|errors|health|status|latest|recent|last)\b/.test(normalized);
  return mentionsFeed && asksForHealth;
}

function feedRunStatusFromMessage(
  normalized: string,
): "failed" | "dead_letter" | "partial" | null {
  if (/\b(dead[ -]?letter)\b/.test(normalized)) return "dead_letter";
  if (/\bpartial\b/.test(normalized)) return "partial";
  if (/\b(failed|failure|failures|error|errors)\b/.test(normalized)) return "failed";
  return null;
}

function extractLeadStatusUpdate(
  message: string,
): { leadQuery: string; status: "new" | "contacted" | "qualified" | "won" } | null {
  const match = message.match(
    /\b(?:mark|set|change|update)\s+(?:the\s+)?(?:lead\s+)?(.+?)\s+(?:as|to)\s+(new|contacted|qualified|won)\b/i,
  );
  if (!match) return null;
  // Regex backtracking can let the non-greedy capture absorb the optional
  // "lead" noun ("mark lead jane@example.com as qualified"). Strip it after
  // capture so deterministic name resolution receives the actual identity,
  // not a noisy search phrase.
  const leadQuery = normalizeSearchText(match[1].replace(/^lead\s+/i, ""));
  const status = match[2].toLocaleLowerCase() as "new" | "contacted" | "qualified" | "won";
  return leadQuery ? { leadQuery, status } : null;
}

function extractFeedRunEnqueue(message: string): { feedQuery: string } | null {
  const match = message.match(
    /\b(?:run|sync|refresh|enqueue)\s+(?:the\s+)?(?:inventory\s+)?feed\s+(.+?)(?:\s+now)?\s*[.!?]?$/i,
  );
  if (!match) return null;
  const feedQuery = normalizeSearchText(match[1]);
  return feedQuery ? { feedQuery } : null;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
