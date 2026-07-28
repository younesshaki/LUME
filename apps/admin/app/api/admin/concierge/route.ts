/**
 * Authenticated, read-only dashboard concierge.
 *
 * The client supplies only a tenant slug and natural-language message. This
 * route authenticates the member, re-resolves the tenant through RLS, compiles
 * an allowlisted intent, and performs fresh tenant-scoped reads. No model
 * output, browser automation, server action, or database write is accepted on
 * this path.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateLaunchReadiness } from "@/lib/launchReadiness";
import { loadTenantLaunchSnapshot } from "@/lib/launchReadiness.server";
import {
  adminCapabilityHref,
  adminIntentMinimumRole,
  capabilityFromAdminPath,
  capabilityById,
  buildAdminConciergeSystemPrompt,
  compileDeterministicAdminIntent,
  hasAdminCapabilityRole,
  isAdminRole,
  parseAdminConciergeModelPlan,
  parseAdminConciergeRequest,
  ADMIN_CONCIERGE_LIMITS,
} from "@/lib/adminConcierge";
import { requestEditorCopilotCompletion } from "@/lib/editorCopilotLlm";
import {
  DEFAULT_CONCIERGE_MODEL_ID,
  isPremiumConciergeModel,
  normalizeConciergeModelId,
  type ConciergeModelId,
} from "@/lib/conciergeModels";
import { checkChatRateLimit } from "@/lib/rateLimit";
import { captureDebug, captureError } from "@/lib/observability";
import {
  createFeedRunCommand,
  createLeadAssignCommand,
  createLeadStatusCommand,
  createVehiclePriceCommand,
  createVehicleStatusCommand,
  resolveTenantTeammateNames,
} from "@/lib/adminConciergeCommands.server";
import {
  adminConversationMemoryKey,
  getConversationMemoryStore,
} from "@/lib/conversationMemory.server";
import {
  emptyAdminConciergeState,
  normalizeAdminConciergeState,
  resolveAdminPresentationRequest,
  resultSetState,
  selectAdminConciergeResult,
  type AdminConciergeState,
} from "@/lib/adminConciergeState";
import { resolveTenantPlan } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { extractVehicleFilters } from "@lume/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > ADMIN_CONCIERGE_LIMITS.maxBodyBytes) {
    return json({ error: "Request too large." }, 400);
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const parsed = parseAdminConciergeRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const supabase = await createSupabaseServerClient();
  const [{ data: userData }, { data: tenant }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("tenants").select("id, slug").eq("slug", parsed.request.tenantSlug).maybeSingle(),
  ]);
  if (!userData.user) return json({ error: "Authentication required." }, 401);
  // A tenant slug is not authority. The role RPC is a second explicit check
  // alongside RLS and covers every member role that may use read-only admin.
  if (!tenant) return json({ error: "Not authorized for this tenant." }, 403);
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (membershipError || !membership || !isAdminRole(membership.role)) {
    return json({ error: "Not authorized for this tenant." }, 403);
  }

  const memoryStore = getConversationMemoryStore();
  const memoryKey = parsed.request.sessionId
    ? adminConversationMemoryKey(tenant.id, userData.user.id, parsed.request.sessionId)
    : null;
  const adminState = memoryKey
    ? normalizeAdminConciergeState(
      (await memoryStore.get(memoryKey).catch(() => null))?.conversationState,
    )
    : emptyAdminConciergeState();
  const storedPresentation = resolveAdminPresentationRequest(parsed.request.message, adminState);
  if (storedPresentation) {
    return resolveStoredPresentation(
      supabase,
      tenant.id,
      tenant.slug,
      storedPresentation,
      adminState,
      memoryStore,
      memoryKey,
    );
  }

  // The admin planner uses the tenant's explicitly selected concierge tier,
  // but applies the same entitlement clamp as public chat. A stored premium
  // choice can never bypass a later plan downgrade.
  const [botConfigResult, tenantPlan] = await Promise.all([
    supabase
      .from("tenant_bot_config")
      .select("model")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    resolveTenantPlan(createServiceClient(), tenant.id),
  ]);
  const configuredModelId = normalizeConciergeModelId(botConfigResult.data?.model);
  const plannerModelId = isPremiumConciergeModel(configuredModelId) &&
    !tenantPlan.entitlements["chat.premium_models"]
    ? DEFAULT_CONCIERGE_MODEL_ID
    : configuredModelId;

  let intent = compileDeterministicAdminIntent(parsed.request.message);
  let source: "deterministic" | "model" = "deterministic";
  let modelAttempted = false;
  let modelMetadata: { requestedModelId: ConciergeModelId; effectiveModelId?: ConciergeModelId; fellBack?: boolean } | null = null;
  // The model is a language-to-plan fallback only. It receives no tenant data,
  // and malformed/unsupported output remains unsupported rather than becoming
  // an executable action.
  if (intent.kind === "unsupported") {
    modelAttempted = true;
    const rate = checkChatRateLimit(`admin:${userData.user.id}`);
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Too many concierge requests. Please retry shortly." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
      });
    }
    const compiled = await compileModelIntent(
      parsed.request.message,
      tenant.id,
      plannerModelId,
    );
    intent = compiled.intent;
    modelMetadata = compiled.model;
    if (intent.kind !== "unsupported") source = "model";
  }
  captureDebug("api/admin-concierge", {
    tenantId: tenant.id,
    actorUserId: userData.user.id,
    source,
    modelAttempted,
    model: modelMetadata,
    intent: debugIntent(intent),
  });
  const requiredRole = adminIntentMinimumRole(intent);
  if (!requiredRole || !hasAdminCapabilityRole(membership.role, requiredRole)) {
    return json({
      source,
      reply: "Your tenant role does not permit that dashboard operation.",
    }, 403);
  }
  switch (intent.kind) {
    case "navigate": {
      const capability = capabilityById(intent.capabilityId);
      if (!capability) return unsupported(); // Registry changed while a request was in flight.
      const href = adminCapabilityHref(tenant.slug, capability);
      return json({
        source,
        reply: `Opening ${capability.title.toLocaleLowerCase()}.`,
        action: { type: "navigate", href, label: capability.title },
      });
    }
    case "clarify":
      return json({ source, reply: intent.question });
    case "describe_current_page": {
      const capability = capabilityFromAdminPath(parsed.request.currentPath, tenant.slug);
      if (!capability) {
        return json({
          source,
          reply: "I can’t verify the current dashboard surface from this tab. Tell me which area you want to work in, and I’ll navigate there safely.",
        });
      }
      return json({
        source,
        reply: `You’re in ${capability.title.toLocaleLowerCase()}. I can help with the verified actions available for this area.`,
      });
    }
    case "summarize_concierge_config":
      return summarizeConciergeConfig(supabase, tenant.id, tenant.slug, source);
    case "summarize_overview":
      return summarizeOverview(supabase, tenant.id, tenant.slug, source, memoryStore, memoryKey);
    case "search_vehicles":
      return searchVehicles(supabase, tenant.id, tenant.slug, intent.query, source, memoryStore, memoryKey);
    case "search_leads":
      return searchLeads(supabase, tenant.id, tenant.slug, intent.status, source, memoryStore, memoryKey);
    case "search_customers":
      return searchCustomers(tenant.id, tenant.slug, intent.query, source, memoryStore, memoryKey);
    case "search_pages":
      return searchPages(supabase, tenant.id, tenant.slug, intent.query, source, memoryStore, memoryKey);
    case "summarize_conversion":
      return summarizeConversion(supabase, tenant.id, tenant.slug, intent.days, source);
    case "inspect_photo_gap":
      return inspectPhotoGap(supabase, tenant.id, tenant.slug, source);
    case "inspect_aging_inventory":
      return inspectAgingInventory(supabase, tenant.id, tenant.slug, intent.days, source);
    case "inspect_launch_readiness":
      return inspectLaunchReadiness(supabase, tenant.slug, source);
    case "inspect_feed_runs":
      return inspectFeedRuns(supabase, tenant.id, tenant.slug, intent.status, source, memoryStore, memoryKey);
    case "enqueue_feed_run":
      return prepareFeedRun(supabase, tenant.id, userData.user.id, intent.feedQuery, source);
    case "update_vehicle_price":
      return prepareVehiclePriceUpdate(supabase, tenant.id, userData.user.id, intent.vehicleQuery, intent.price, source);
    case "update_vehicle_status":
      return prepareVehicleStatusUpdate(supabase, tenant.id, userData.user.id, intent.vehicleQuery, intent.status, source);
    case "assign_lead":
      return prepareLeadAssign(supabase, tenant.id, userData.user.id, intent.leadQuery, intent.assigneeQuery, source);
    case "update_lead_status":
      return prepareLeadStatusUpdate(
        supabase,
        tenant.id,
        userData.user.id,
        intent.leadQuery,
        intent.status,
        source,
      );
    case "unsupported":
      return unsupported();
  }
}

async function compileModelIntent(
  message: string,
  tenantId: string,
  modelId: ConciergeModelId,
): Promise<{
  intent: ReturnType<typeof compileDeterministicAdminIntent>;
  model: { requestedModelId: ConciergeModelId; effectiveModelId?: ConciergeModelId; fellBack?: boolean };
}> {
  const completion = await requestEditorCopilotCompletion(
    [
      { role: "system", content: buildAdminConciergeSystemPrompt() },
      { role: "user", content: message },
    ],
    modelId,
  );
  if (!completion.ok) {
    captureError("api/admin-concierge/llm", new Error(`planner status ${completion.status}`), {
      tenantId,
      requestedModelId: modelId,
    });
    return { intent: { kind: "unsupported" }, model: { requestedModelId: modelId } };
  }
  const plan = parseAdminConciergeModelPlan(completion.content);
  // `clarify` is intentionally rendered as the same safe fallback in this
  // initial UI. Future phases will add a typed clarifier state to the panel.
  return {
    intent: plan && plan.kind !== "clarify" ? plan : { kind: "unsupported" },
    model: {
      requestedModelId: modelId,
      effectiveModelId: completion.modelId,
      fellBack: completion.fellBack,
    },
  };
}

async function searchVehicles(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  queryText: string | null,
  source: "deterministic" | "model",
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
): Promise<Response> {
  let query = supabase
    .from("vehicles")
    .select("id, year, make, model, trim, price, status", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(5);
  const safeQuery = queryText?.replace(/[^\p{L}\p{N}\s-]/gu, "").trim().slice(0, 120) ?? "";
  const filters = queryText ? extractVehicleFilters(queryText) : {};
  // Structured constraints are extracted from the user message, not model
  // output. They are applied to the query and carried to the issued Admin URL
  // so a count and the destination page cannot silently disagree.
  if (filters.make) query = query.ilike("make", filters.make);
  if (filters.model) query = query.ilike("model", filters.model);
  if (filters.year !== undefined) query = query.eq("year", filters.year);
  else {
    if (filters.yearMin !== undefined) query = query.gte("year", filters.yearMin);
    if (filters.yearMax !== undefined) query = query.lte("year", filters.yearMax);
  }
  if (filters.priceMin !== undefined) query = query.gte("price", filters.priceMin);
  if (filters.priceMax !== undefined) query = query.lte("price", filters.priceMax);
  if (filters.mileageMax !== undefined) query = query.lte("mileage", filters.mileageMax);
  if (filters.bodyStyle) query = query.ilike("body_style", filters.bodyStyle);
  if (filters.stockType) query = query.ilike("stock_type", filters.stockType);
  if (filters.fuelType) query = query.ilike("fuel_type", filters.fuelType);
  if (filters.drivetrain) query = query.ilike("drivetrain", filters.drivetrain);
  if (filters.sellerState) query = query.ilike("seller_state", filters.sellerState);
  if (safeQuery && !hasStructuredVehicleScope(filters)) {
    const term = `%${safeQuery.replace(/[%_]/g, (character) => `\\${character}`)}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term},trim.ilike.${term}`);
  }
  const { data, count, error } = await query;
  if (error) return json({ error: "Unable to read vehicles right now." }, 502);
  const total = count ?? 0;
  const label = vehicleSearchLabel(filters, safeQuery);
  const examples = (data ?? []).map((vehicle) => ({
    id: vehicle.id,
    label: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`,
    price: vehicle.price,
    status: vehicle.status,
  }));
  const params = new URLSearchParams();
  const dashboardQuery = filters.model ?? filters.make ?? safeQuery;
  if (dashboardQuery) params.set("q", dashboardQuery);
  addVehicleFilterParams(params, filters);
  const href = `/admin/${encodeURIComponent(tenantSlug)}/vehicles${params.size ? `?${params}` : ""}`;
  await persistAdminResultSet(memoryStore, memoryKey, resultSetState({
    kind: "vehicles",
    orderedIds: examples.map((vehicle) => vehicle.id),
    totalCount: total,
    href,
  }));
  return json({
    source,
    reply: total
      ? `I found ${total.toLocaleString()} vehicle${total === 1 ? "" : "s"}${label}.`
      : `No vehicles${label} match the current inventory.`,
    action: { type: "navigate", href, label: "Open vehicles" },
    results: examples,
  });
}

async function summarizeOverview(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  source: "deterministic" | "model",
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
): Promise<Response> {
  const [vehiclesResult, newLeadsResult, pagesResult] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "archived"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "new"),
    supabase.from("pages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("archived_at", null),
  ]);
  if (vehiclesResult.error || newLeadsResult.error || pagesResult.error) {
    return json({ error: "Unable to read the dashboard summary right now." }, 502);
  }
  const activeVehicles = vehiclesResult.count ?? 0;
  const newLeads = newLeadsResult.count ?? 0;
  const pages = pagesResult.count ?? 0;
  await persistAdminResultSet(memoryStore, memoryKey, emptyAdminConciergeState());
  return json({
    source,
    reply: `Right now you have ${activeVehicles.toLocaleString()} active vehicle${activeVehicles === 1 ? "" : "s"}, ${newLeads.toLocaleString()} new lead${newLeads === 1 ? "" : "s"}, and ${pages.toLocaleString()} active page${pages === 1 ? "" : "s"}.`,
    action: { type: "navigate", href: `/admin/${encodeURIComponent(tenantSlug)}`, label: "Open dashboard" },
    details: [
      { id: "active-vehicles", label: "Active inventory", value: activeVehicles.toLocaleString() },
      { id: "new-leads", label: "New leads", value: newLeads.toLocaleString() },
      { id: "active-pages", label: "Active pages", value: pages.toLocaleString() },
    ],
  });
}

async function summarizeConciergeConfig(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  source: "deterministic" | "model",
): Promise<Response> {
  // Never select persona/system-prompt text here. The operational summary is
  // deliberately limited to non-sensitive runtime policy fields.
  const [configResult, personaResult] = await Promise.all([
    supabase
      .from("tenant_bot_config")
      .select("model, allowed_tools, max_iterations, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("bot_personas")
      .select("name, tone, updated_at")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (configResult.error || personaResult.error) {
    const missing = configResult.error?.code === "42P01" || personaResult.error?.code === "42P01";
    return json({
      source,
      reply: missing
        ? "Concierge configuration is unavailable until its required migration is applied."
        : "Unable to read concierge configuration right now.",
      action: { type: "navigate", href: `/admin/${encodeURIComponent(tenantSlug)}/persona`, label: "Open bot configuration" },
    }, missing ? 503 : 502);
  }
  const config = configResult.data;
  const persona = personaResult.data;
  const href = `/admin/${encodeURIComponent(tenantSlug)}/persona`;
  if (!config) {
    return json({
      source,
      reply: "No tenant-specific concierge runtime configuration is stored yet. The dashboard configuration page shows the active defaults and lets an authorized editor review them.",
      action: { type: "navigate", href, label: "Open bot configuration" },
    });
  }
  const personaSummary = persona ? `${persona.name} (${persona.tone} tone)` : "the default persona";
  return json({
    source,
    reply: `The public concierge is using ${config.model} with ${config.allowed_tools.length} allowed tool${config.allowed_tools.length === 1 ? "" : "s"} and a ${config.max_iterations}-step limit. Its active persona is ${personaSummary}.`,
    action: { type: "navigate", href, label: "Open bot configuration" },
    details: [
      { id: "model", label: "Model", value: config.model },
      { id: "tools", label: "Allowed tools", value: config.allowed_tools.length.toLocaleString() },
      { id: "iterations", label: "Maximum tool steps", value: config.max_iterations.toLocaleString() },
      { id: "updated", label: "Runtime configuration updated", value: formatAdminTimestamp(config.updated_at) },
    ],
  });
}

async function searchLeads(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  status: "new" | "contacted" | "qualified" | "won" | "lost" | null,
  source: "deterministic" | "model",
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
): Promise<Response> {
  let query = supabase
    .from("leads")
    .select("id, first_name, last_name, email, status", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query;
  if (error) return json({ error: "Unable to read leads right now." }, 502);
  const total = count ?? 0;
  const label = status ? ` ${status}` : "";
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const href = `/admin/${encodeURIComponent(tenantSlug)}/leads${params.size ? `?${params}` : ""}`;
  const examples = (data ?? []).map((lead) => ({
    id: lead.id,
    label: leadLabel(lead),
    status: lead.status,
  }));
  await persistAdminResultSet(memoryStore, memoryKey, resultSetState({
    kind: "leads",
    orderedIds: examples.map((lead) => lead.id),
    totalCount: total,
    href,
  }));
  return json({
    source,
    reply: `I found ${total.toLocaleString()}${label} lead${total === 1 ? "" : "s"}.`,
    action: {
      type: "navigate",
      href,
      label: "Open leads",
    },
    candidatesSelectable: true,
    ...(examples.length ? { candidates: examples } : {}),
  });
}

async function searchCustomers(
  tenantId: string,
  tenantSlug: string,
  queryText: string | null,
  source: "deterministic" | "model",
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
): Promise<Response> {
  // `visitors` is deny-all under RLS because it coexists with credential
  // fields. The caller was authenticated and tenant-role-authorized above;
  // use service access only for this explicit safe projection and tenant ID.
  const service = createServiceClient();
  let query = service
    .from("visitors")
    .select("id, first_name, last_name, email", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);
  const safeQuery = queryText?.replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) ?? "";
  if (safeQuery) {
    const term = `%${safeQuery.replace(/[%_]/g, (character) => `\\${character}`)}%`;
    query = query.or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`);
  }
  const { data, count, error } = await query;
  if (error) return json({ error: "Unable to read customer profiles right now." }, 502);
  const customers = (data ?? []).map((customer) => ({
    id: customer.id,
    label: `${customer.first_name} ${customer.last_name}`.trim() || customer.email,
    status: "customer",
  }));
  const total = count ?? 0;
  const params = new URLSearchParams();
  if (safeQuery) params.set("q", safeQuery);
  const href = `/admin/${encodeURIComponent(tenantSlug)}/customers${params.size ? `?${params}` : ""}`;
  await persistAdminResultSet(memoryStore, memoryKey, resultSetState({
    kind: "customers",
    orderedIds: customers.map((customer) => customer.id),
    totalCount: total,
    href,
  }));
  return json({
    source,
    reply: total
      ? `I found ${total.toLocaleString()} customer${total === 1 ? "" : "s"}${safeQuery ? ` matching “${safeQuery}”` : ""}.`
      : `No customers${safeQuery ? ` matching “${safeQuery}”` : ""} were found.`,
    action: { type: "navigate", href, label: "Open customers" },
    candidatesSelectable: true,
    ...(customers.length ? { candidates: customers } : {}),
  });
}

async function searchPages(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  queryText: string | null,
  source: "deterministic" | "model",
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
): Promise<Response> {
  let query = supabase
    .from("pages")
    .select("id, title, slug, is_reserved", { count: "exact" })
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("nav_order", { ascending: true })
    .limit(5);
  const safeQuery = queryText?.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) ?? "";
  if (safeQuery) {
    const term = `%${safeQuery.replace(/[%_]/g, (character) => `\\${character}`)}%`;
    query = query.or(`title.ilike.${term},slug.ilike.${term}`);
  }
  const { data, count, error } = await query;
  if (error) return json({ error: "Unable to read website pages right now." }, 502);
  const pages = (data ?? []).map((page) => ({
    id: page.id,
    label: page.title || `/${page.slug}`,
    status: page.is_reserved ? "reserved" : "page",
  }));
  const total = count ?? 0;
  const href = `/admin/${encodeURIComponent(tenantSlug)}/pages`;
  await persistAdminResultSet(memoryStore, memoryKey, resultSetState({
    kind: "pages",
    orderedIds: pages.map((page) => page.id),
    totalCount: total,
    href,
  }));
  return json({
    source,
    reply: total
      ? `I found ${total.toLocaleString()} page${total === 1 ? "" : "s"}${safeQuery ? ` matching “${safeQuery}”` : ""}.`
      : `No pages${safeQuery ? ` matching “${safeQuery}”` : ""} were found.`,
    action: { type: "navigate", href, label: "Open pages" },
    candidatesSelectable: true,
    ...(pages.length ? { candidates: pages } : {}),
  });
}

async function inspectFeedRuns(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  status: "failed" | "dead_letter" | "partial" | null,
  source: "deterministic" | "model",
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
): Promise<Response> {
  let query = supabase
    .from("inventory_feed_runs")
    .select("id, feed_source_id, status, attempt_count, total_rows, updated_rows, last_error, created_at, completed_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (status) query = query.eq("status", status);
  const { data: runs, count, error } = await query;
  if (error) {
    if (error.code === "42P01") {
      return json({
        source,
        reply: "Managed feed history is unavailable until migration 077 is applied.",
        action: { type: "navigate", href: `/admin/${encodeURIComponent(tenantSlug)}/settings/inventory-feeds`, label: "Open inventory feeds" },
      });
    }
    return json({ error: "Unable to read managed feed runs right now." }, 502);
  }
  const sourceIds = [...new Set((runs ?? []).map((run) => run.feed_source_id))];
  const { data: sources, error: sourceError } = sourceIds.length
    ? await supabase
      .from("inventory_feed_sources")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", sourceIds)
    : { data: [], error: null };
  if (sourceError) return json({ error: "Unable to resolve managed feed sources right now." }, 502);
  const namesById = new Map((sources ?? []).map((feed) => [feed.id, feed.name]));
  const total = count ?? 0;
  const label = status ? ` ${status.replace("_", " ")}` : "";
  const href = `/admin/${encodeURIComponent(tenantSlug)}/settings/inventory-feeds`;
  await persistAdminResultSet(memoryStore, memoryKey, resultSetState({
    kind: "feed_runs",
    orderedIds: (runs ?? []).map((run) => run.id),
    totalCount: total,
    href,
  }));
  return json({
    source,
    reply: total
      ? `I found ${total.toLocaleString()}${label} managed feed run${total === 1 ? "" : "s"}.`
      : `There are no${label} managed feed runs.`,
    action: {
      type: "navigate",
      href,
      label: "Open inventory feeds",
    },
    details: (runs ?? []).map((run) => ({
      id: run.id,
      label: namesById.get(run.feed_source_id) ?? "Managed feed",
      value: `${run.status.replace("_", " ")} · ${run.updated_rows.toLocaleString()} updated · ${formatAdminTimestamp(run.completed_at ?? run.created_at)}`,
      ...(run.last_error ? { note: run.last_error.slice(0, 240) } : {}),
    })),
  });
}

/**
 * Photo coverage across live inventory.
 *
 * A vehicle with no photo is effectively invisible to a shopper, so this is
 * the one inventory metric that maps straight to lost leads. "Has a photo"
 * matches the inventory grid exactly — managed R2 image, special source, or a
 * legacy feed URL — so the number here always agrees with what the filtered
 * list shows.
 *
 * Reads are paged: PostgREST caps a select at 1000 rows, and a dealer book
 * larger than that would otherwise report a confidently wrong number.
 */
/**
 * Aging inventory — the metric that carries a direct financing cost.
 *
 * Measured from `created_at`, which is when the vehicle entered LUME, not when
 * it physically landed on the lot. For feed-synced stock those differ, so the
 * wording says "listed in LUME" rather than implying true lot age. Anything
 * stronger would need a dealer-supplied acquisition date.
 */
/**
 * Launch readiness, straight from the existing engine.
 *
 * evaluateLaunchReadiness already encodes what "ready to sell" means; the
 * concierge just had no way to read it. Reporting blockers first — with the
 * remediation route each check already carries — turns "am I ready?" into a
 * next action instead of a number.
 */
async function inspectLaunchReadiness(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantSlug: string,
  source: "deterministic" | "model",
): Promise<Response> {
  const snapshot = await loadTenantLaunchSnapshot(supabase, tenantSlug);
  if (!snapshot) return json({ error: "Unable to read launch readiness right now." }, 502);

  const report = evaluateLaunchReadiness(snapshot, "pilot", new Date().toISOString());
  const blockers = report.checks.filter((check) => check.status === "blocker");
  const warnings = report.checks.filter((check) => check.status === "warning");
  const attention = [...blockers, ...warnings].slice(0, 5);

  const reply = report.ready
    ? `You're ready to launch — all ${report.passedCount} checks pass.`
    : `${report.blockerCount} ${report.blockerCount === 1 ? "blocker" : "blockers"} and ${report.warningCount} ${report.warningCount === 1 ? "warning" : "warnings"} left before launch. ${report.passedCount} checks already pass.`;

  // Send them to the first blocker's own remediation route when there is one.
  const firstFix = attention.find((check) => check.remediationHref)?.remediationHref;
  return json({
    source,
    reply,
    ...(firstFix ? { action: { type: "navigate", href: firstFix, label: "Fix the first item" } } : {}),
    details: attention.map((check) => ({
      id: check.id,
      label: check.title,
      value: check.status === "blocker" ? "Blocker" : "Warning",
      note: check.explanation.slice(0, 240),
    })),
  });
}

async function inspectAgingInventory(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  days: number,
  source: "deterministic" | "model",
): Promise<Response> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, count, error } = await supabase
    .from("vehicles")
    .select("id, year, make, model, trim, price, created_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .is("sold_at", null)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return json({ error: "Unable to read inventory age right now." }, 502);

  const total = count ?? 0;
  const href = `/admin/${encodeURIComponent(tenantSlug)}/vehicles`;
  if (total === 0) {
    return json({ source, reply: `Nothing unsold has been listed in LUME for ${days}+ days.` });
  }

  const ageInDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return json({
    source,
    reply: `${total.toLocaleString()} unsold ${total === 1 ? "vehicle has" : "vehicles have"} been listed in LUME for ${days}+ days. The longest-listed are below — these are the ones carrying holding cost.`,
    action: { type: "navigate", href, label: "Open inventory" },
    details: (data ?? []).map((vehicle) => ({
      id: vehicle.id,
      label: [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "),
      value: `${ageInDays(vehicle.created_at)} days · $${(vehicle.price ?? 0).toLocaleString()}`,
    })),
  });
}

async function inspectPhotoGap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  source: "deterministic" | "model",
): Promise<Response> {
  const PAGE = 1000;
  const rows: Array<{ id: string; image_src: string | null; special_image_src: string | null }> = [];
  for (let page = 0; ; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, image_src, special_image_src")
      .eq("tenant_id", tenantId)
      .neq("status", "archived")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return json({ error: "Unable to read inventory photo coverage right now." }, 502);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const managed = new Set<string>();
  for (let page = 0; ; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("vehicle_images")
      .select("vehicle_id")
      .eq("tenant_id", tenantId)
      .order("vehicle_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break; // Managed images are optional; legacy sources still count.
    for (const image of data ?? []) managed.add(image.vehicle_id);
    if (!data || data.length < PAGE) break;
  }

  const missing = rows.filter((row) =>
    !managed.has(row.id) && !row.special_image_src?.trim() && !row.image_src?.trim());
  const total = rows.length;
  const share = total ? Math.round((missing.length / total) * 100) : 0;
  const href = `/admin/${encodeURIComponent(tenantSlug)}/vehicles?images=without`;

  if (total === 0) {
    return json({ source, reply: "There are no live vehicles to check yet." });
  }

  return json({
    source,
    reply: missing.length === 0
      ? `Every one of your ${total.toLocaleString()} live vehicles has at least one photo.`
      : `${missing.length.toLocaleString()} of ${total.toLocaleString()} live vehicles have no photo (${share}%). Vehicles without a photo are effectively invisible to shoppers.`,
    action: missing.length
      ? { type: "navigate", href, label: `Review ${missing.length.toLocaleString()} without photos` }
      : undefined,
  });
}

/**
 * Summarize conversion performance from the existing tenant_conversion_report
 * RPC.
 *
 * The RPC is SECURITY DEFINER but authorizes internally against
 * tenant_ids_for_current_user(), so it is called with the authenticated tenant
 * client — never the service client. A non-member gets the database's own
 * refusal rather than a check we would have to keep in sync here.
 */
async function summarizeConversion(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  days: number,
  source: "deterministic" | "model",
): Promise<Response> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("tenant_conversion_report", {
    p_tenant_id: tenantId,
    p_since: since,
  });
  if (error || !data || typeof data !== "object") {
    return json({ error: "Unable to read conversion analytics right now." }, 502);
  }

  const report = data as Record<string, unknown>;
  const funnel = Array.isArray(report.funnel) ? report.funnel : [];
  const counts = new Map<string, number>();
  for (const entry of funnel) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.event_name === "string" ? row.event_name : null;
    const count = Number(row.event_count);
    if (name && Number.isFinite(count)) counts.set(name, count);
  }

  const views = counts.get("vehicle_view") ?? 0;
  const saves = counts.get("vehicle_saved") ?? 0;
  const leads = counts.get("inquiry_submitted") ?? 0;
  const href = `/admin/${encodeURIComponent(tenantSlug)}/analytics`;
  const window = days === 1 ? "the last 24 hours" : `the last ${days} days`;

  if (views === 0 && leads === 0) {
    return json({
      source,
      reply: `No vehicle views or inquiries were recorded in ${window}. If the site is live, this usually means analytics events are not reaching LUME yet.`,
      action: { type: "navigate", href, label: "Open analytics" },
    });
  }

  // Guard the divide: leads without views is possible (a direct contact-form
  // hit), and would otherwise render Infinity%.
  const rate = views > 0 ? (leads / views) * 100 : null;
  const median = Number(report.median_view_to_lead_seconds);
  const parts = [
    `In ${window}: ${views.toLocaleString()} vehicle views, ${saves.toLocaleString()} saves, ${leads.toLocaleString()} inquiries.`,
  ];
  if (rate !== null) {
    parts.push(`That is a ${rate.toFixed(rate < 1 ? 2 : 1)}% view-to-inquiry rate.`);
  }
  if (Number.isFinite(median) && median > 0) {
    const hours = median / 3600;
    parts.push(hours >= 1
      ? `Median time from first view to inquiry is ${hours.toFixed(1)} hours.`
      : `Median time from first view to inquiry is ${Math.round(median / 60)} minutes.`);
  }

  return json({
    source,
    reply: parts.join(" "),
    action: { type: "navigate", href, label: "Open analytics" },
  });
}

async function resolveStoredPresentation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  tenantSlug: string,
  request: NonNullable<ReturnType<typeof resolveAdminPresentationRequest>>,
  adminState: AdminConciergeState,
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
): Promise<Response> {
  if (request.kind === "show_results") {
    return json({
      source: "deterministic",
      reply: `Opening the ${request.totalCount.toLocaleString()} verified ${request.resultKind.replace("_", " ")} result${request.totalCount === 1 ? "" : "s"}.`,
      action: { type: "navigate", href: request.href, label: "Open results" },
    });
  }
  const result = request.resultKind === "customers"
    ? await createServiceClient()
      .from("visitors")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", request.id)
      .maybeSingle()
    : await supabase
      .from(request.resultKind === "vehicles" ? "vehicles" : request.resultKind === "leads" ? "leads" : "pages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", request.id)
      .maybeSingle();
  const { data, error } = result;
  if (error || !data) {
    await persistAdminResultSet(memoryStore, memoryKey, emptyAdminConciergeState());
    return json({
      source: "deterministic",
      reply: "That earlier result is no longer available, so I did not open a different record.",
    });
  }
  const kindLabel = request.resultKind === "vehicles" ? "vehicle" : request.resultKind === "leads" ? "lead" : request.resultKind === "customers" ? "customer" : "page";
  await persistAdminResultSet(
    memoryStore,
    memoryKey,
    selectAdminConciergeResult(adminState, request.id, request.resultKind),
  );
  return json({
    source: "deterministic",
    reply: `Opening the verified ${kindLabel}.`,
    action: {
      type: "navigate",
      href: `/admin/${encodeURIComponent(tenantSlug)}/${request.resultKind}/${encodeURIComponent(request.id)}`,
      label: `Open ${kindLabel}`,
    },
  });
}

async function persistAdminResultSet(
  memoryStore: ReturnType<typeof getConversationMemoryStore>,
  memoryKey: string | null,
  state: AdminConciergeState,
): Promise<void> {
  if (!memoryKey) return;
  await memoryStore.append(memoryKey, { conversationState: state }).catch(() => undefined);
}

/**
 * Prepare a reviewed lead assignment.
 *
 * Both the lead and the teammate are resolved deterministically against
 * tenant-scoped reads, and BOTH must be unambiguous. An ambiguous teammate is
 * the dangerous case — assigning a lead to the wrong salesperson moves
 * commission — so more than one match asks rather than picking.
 */
/**
 * Prepare a reviewed reprice.
 *
 * The vehicle must resolve to exactly one row. Repricing the wrong car
 * publishes a wrong asking price to the public site, so ambiguity returns
 * candidates rather than picking the first match.
 */
async function prepareVehiclePriceUpdate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  vehicleQuery: string,
  price: number,
  source: "deterministic" | "model",
): Promise<Response> {
  const { data: canWrite, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenantId,
    p_roles: ["editor", "admin", "owner"],
  });
  if (roleError || !canWrite) {
    return json({ source, reply: "Editor access is required to prepare a price change." }, 403);
  }

  const safeQuery = vehicleQuery.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!safeQuery) return unsupported();
  const term = `%${safeQuery.replace(/[%_]/g, (character) => `\\${character}`)}%`;
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, year, make, model, trim, price, status, sold_at, external_id")
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .or(`make.ilike.${term},model.ilike.${term},trim.ilike.${term},external_id.ilike.${term}`)
    .order("created_at", { ascending: false })
    .limit(4);
  if (error) return json({ error: "Unable to resolve that vehicle right now." }, 502);

  const label = (vehicle: { year: number | null; make: string; model: string; trim: string | null }) =>
    [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");

  if (!data?.length) {
    return json({ source, reply: `I couldn’t find a vehicle matching “${safeQuery}”, so I didn’t prepare a change.` });
  }
  if (data.length > 1) {
    return json({
      source,
      reply: `“${safeQuery}” matches ${data.length} vehicles. Please use the stock number or a more specific description so I reprice the right one.`,
      candidates: data.map((vehicle) => ({
        id: vehicle.id,
        label: `${label(vehicle)} · $${(vehicle.price ?? 0).toLocaleString()}`,
        status: vehicle.status,
      })),
    });
  }

  const vehicle = data[0];
  if (vehicle.sold_at) {
    return json({ source, reply: `${label(vehicle)} is sold, and sold vehicle prices are frozen.` });
  }
  if (vehicle.price === price) {
    return json({ source, reply: `${label(vehicle)} is already priced at $${price.toLocaleString()}.` });
  }

  const created = await createVehiclePriceCommand({
    tenantId,
    actorUserId,
    vehicle: { id: vehicle.id, label: label(vehicle), currentPrice: vehicle.price ?? 0 },
    nextPrice: price,
  });
  if (!created.ok) {
    return json({
      error: created.reason === "migration_required"
        ? "Reviewed admin commands are not available until migration 083 is applied."
        : "Unable to prepare the reviewed command.",
    }, 503);
  }

  return json({
    source,
    reply: `Ready to reprice ${label(vehicle)} from $${(vehicle.price ?? 0).toLocaleString()} to $${price.toLocaleString()}. Confirm to apply it.`,
    command: {
      id: created.command.commandId,
      expiresAt: created.command.expiresAt,
      capabilityId: "vehicle.price.update",
      summary: `Reprice ${label(vehicle)} to $${price.toLocaleString()}`,
    },
  });
}

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  draft: "a draft",
  live: "live on the site",
  archived: "archived",
};

/**
 * Resolve one vehicle and stage a publish/unpublish/archive for review.
 *
 * Unlike the reprice handler this must NOT exclude archived vehicles from the
 * search: unarchiving one requires finding it first. Ambiguity returns
 * candidates rather than picking the first match, because taking the wrong
 * car off the public site is a silent revenue loss.
 */
async function prepareVehicleStatusUpdate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  vehicleQuery: string,
  nextStatus: "draft" | "live" | "archived",
  source: "deterministic" | "model",
): Promise<Response> {
  const { data: canWrite, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenantId,
    p_roles: ["editor", "admin", "owner"],
  });
  if (roleError || !canWrite) {
    return json({ source, reply: "Editor access is required to change a vehicle's status." }, 403);
  }

  const safeQuery = vehicleQuery.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!safeQuery) return unsupported();
  const term = `%${safeQuery.replace(/[%_]/g, (character) => `\\${character}`)}%`;
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, year, make, model, trim, price, status, sold_at, external_id")
    .eq("tenant_id", tenantId)
    .or(`make.ilike.${term},model.ilike.${term},trim.ilike.${term},external_id.ilike.${term}`)
    .order("created_at", { ascending: false })
    .limit(4);
  if (error) return json({ error: "Unable to resolve that vehicle right now." }, 502);

  const label = (vehicle: { year: number | null; make: string; model: string; trim: string | null }) =>
    [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");

  if (!data?.length) {
    return json({ source, reply: `I couldn’t find a vehicle matching “${safeQuery}”, so I didn’t prepare a change.` });
  }
  if (data.length > 1) {
    return json({
      source,
      reply: `“${safeQuery}” matches ${data.length} vehicles. Please use the stock number or a more specific description so I change the right one.`,
      candidates: data.map((vehicle) => ({
        id: vehicle.id,
        label: `${label(vehicle)} · ${vehicle.status}`,
        status: vehicle.status,
      })),
    });
  }

  const vehicle = data[0];
  if (vehicle.status === "sold" || vehicle.sold_at) {
    return json({ source, reply: `${label(vehicle)} is sold, so I left its status alone. Change it from the vehicle page if that was a mistake.` });
  }
  if (vehicle.status === nextStatus) {
    return json({ source, reply: `${label(vehicle)} is already ${VEHICLE_STATUS_LABELS[nextStatus]}.` });
  }

  const created = await createVehicleStatusCommand({
    tenantId,
    actorUserId,
    vehicle: { id: vehicle.id, label: label(vehicle), currentStatus: vehicle.status },
    nextStatus,
  });
  if (!created.ok) {
    return json({
      error: created.reason === "migration_required"
        ? "Reviewed admin commands are not available until migration 086 is applied."
        : "Unable to prepare the reviewed command.",
    }, 503);
  }

  return json({
    source,
    reply: `Ready to make ${label(vehicle)} ${VEHICLE_STATUS_LABELS[nextStatus]} (currently ${VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status}). Confirm to apply it.`,
    command: {
      id: created.command.commandId,
      expiresAt: created.command.expiresAt,
      capabilityId: "vehicle.status.update",
      summary: `Make ${label(vehicle)} ${VEHICLE_STATUS_LABELS[nextStatus]}`,
    },
  });
}

async function prepareLeadAssign(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  leadQuery: string,
  assigneeQuery: string,
  source: "deterministic" | "model",
): Promise<Response> {
  const { data: canWrite, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenantId,
    p_roles: ["editor", "admin", "owner"],
  });
  if (roleError || !canWrite) {
    return json({ source, reply: "Editor access is required to prepare a lead assignment." }, 403);
  }

  const clean = (value: string) =>
    value.replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const safeLead = clean(leadQuery);
  const safeAssignee = clean(assigneeQuery);
  if (!safeLead || !safeAssignee) return unsupported();

  const leadTerm = `%${safeLead.replace(/[%_]/g, (character) => `\\${character}`)}%`;
  const { data: leads, error: leadError } = await supabase
    .from("leads")
    .select("id, first_name, last_name, email, status, assigned_to, created_at")
    .eq("tenant_id", tenantId)
    .or(`first_name.ilike.${leadTerm},last_name.ilike.${leadTerm},email.ilike.${leadTerm}`)
    .order("created_at", { ascending: false })
    .limit(3);
  if (leadError) return json({ error: "Unable to resolve that lead right now." }, 502);
  if (!leads?.length) {
    return json({ source, reply: `I couldn’t find a lead matching “${safeLead}”, so I didn’t prepare anything.` });
  }
  if (leads.length > 1) {
    return json({
      source,
      reply: `I found ${leads.length} leads matching “${safeLead}”. Please be more specific so I assign the right one.`,
      candidates: leads.map((lead) => ({ id: lead.id, label: leadLabel(lead), status: lead.status })),
    });
  }
  const lead = leads[0];

  // Teammates are resolved from this tenant's membership only, then matched by
  // username. The model never supplies a user id.
  const { data: members, error: memberError } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId);
  if (memberError) return json({ error: "Unable to read the team right now." }, 502);
  const memberIds = (members ?? []).map((member) => member.user_id);
  if (!memberIds.length) {
    return json({ source, reply: "This tenant has no teammates to assign leads to yet." });
  }

  // profiles is RLS'd to the caller's own row, so teammates must be read
  // through the service path — bounded to the member ids resolved above.
  const profiles = await resolveTenantTeammateNames(memberIds);

  const needle = safeAssignee.toLowerCase();
  const candidates = profiles.filter((profile) => profile.username.toLowerCase().includes(needle));
  if (!candidates.length) {
    return json({ source, reply: `No teammate here matches “${safeAssignee}”, so I didn’t prepare an assignment.` });
  }
  if (candidates.length > 1) {
    return json({
      source,
      reply: `“${safeAssignee}” matches ${candidates.length} teammates. Please name one exactly so I assign the right person.`,
      candidates: candidates.map((profile) => ({ id: profile.id, label: profile.username, status: "member" })),
    });
  }
  const assignee = candidates[0];

  if (lead.assigned_to === assignee.id) {
    return json({ source, reply: `${leadLabel(lead)} is already assigned to ${assignee.username}.` });
  }

  const created = await createLeadAssignCommand({
    tenantId,
    actorUserId,
    lead: { id: lead.id, label: leadLabel(lead), currentAssignee: lead.assigned_to },
    assignee: { userId: assignee.id, label: assignee.username },
  });
  if (!created.ok) {
    return json({
      error: created.reason === "migration_required"
        ? "Reviewed admin commands are not available until migration 082 is applied."
        : "Unable to prepare the reviewed command.",
    }, 503);
  }

  return json({
    source,
    reply: `Ready to assign ${leadLabel(lead)} to ${assignee.username}. Confirm to apply it.`,
    command: {
      id: created.command.commandId,
      expiresAt: created.command.expiresAt,
      capabilityId: "lead.assign",
      summary: `Assign ${leadLabel(lead)} to ${assignee.username}`,
    },
  });
}

async function prepareLeadStatusUpdate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  leadQuery: string,
  status: "new" | "contacted" | "qualified" | "won",
  source: "deterministic" | "model",
): Promise<Response> {
  const { data: canWrite, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenantId,
    p_roles: ["editor", "admin", "owner"],
  });
  if (roleError || !canWrite) {
    return json({
      source,
      reply: "Editor access is required to prepare a lead-status change.",
    }, 403);
  }

  const safeQuery = leadQuery.replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!safeQuery) return unsupported();
  const term = `%${safeQuery.replace(/[%_]/g, (character) => `\\${character}`)}%`;
  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, email, status, created_at")
    .eq("tenant_id", tenantId)
    .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) return json({ error: "Unable to resolve that lead right now." }, 502);
  if (!data?.length) {
    return json({
      source,
      reply: `I couldn’t find a lead matching “${safeQuery}”, so I didn’t prepare a change.`,
    });
  }
  if (data.length > 1) {
    return json({
      source,
      reply: `I found ${data.length} leads matching “${safeQuery}”. Please use a more specific name or email so I update the right person.`,
      candidates: data.map((lead) => ({
        id: lead.id,
        label: leadLabel(lead),
        status: lead.status,
      })),
    });
  }
  const lead = data[0];
  const created = await createLeadStatusCommand({
    tenantId,
    actorUserId,
    lead: { id: lead.id, label: leadLabel(lead), currentStatus: lead.status },
    nextStatus: status,
  });
  if (!created.ok) {
    return json({
      error: created.reason === "migration_required"
        ? "Reviewed admin commands are not available until migration 080 is applied."
        : "Unable to prepare the reviewed command.",
    }, 503);
  }
  const command = created.command;
  return json({
    source,
    reply: `I prepared a change for ${command.lead.label}. Review the exact status change below, then confirm it.`,
    command: {
      id: command.commandId,
      expiresAt: command.expiresAt,
      capabilityId: "lead.status.update",
      summary: `Change ${command.lead.label} from ${command.lead.currentStatus} to ${command.lead.nextStatus}.`,
    },
  });
}

async function prepareFeedRun(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  feedQuery: string,
  source: "deterministic" | "model",
): Promise<Response> {
  const { data: canRun, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenantId,
    p_roles: ["owner", "admin"],
  });
  if (roleError || !canRun) {
    return json({ source, reply: "Owner or admin access is required to prepare a managed feed run." }, 403);
  }
  const safeQuery = feedQuery.replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!safeQuery) return unsupported();
  const term = `%${safeQuery.replace(/[%_]/g, (character) => `\\${character}`)}%`;
  const { data, error } = await supabase
    .from("inventory_feed_sources")
    .select("id, name, enabled, config_version")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .ilike("name", term)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) {
    if (error.code === "42P01") {
      return json({ source, reply: "Managed feeds are unavailable until migration 077 is applied." }, 503);
    }
    return json({ error: "Unable to resolve that managed feed right now." }, 502);
  }
  if (!data?.length) {
    return json({ source, reply: `I couldn’t find a managed feed matching “${safeQuery}”, so I didn’t prepare a run.` });
  }
  if (data.length > 1) {
    return json({
      source,
      reply: `I found ${data.length} managed feeds matching “${safeQuery}”. Please use a more specific name so I queue the right source.`,
      candidates: data.map((feed) => ({ id: feed.id, label: feed.name, status: feed.enabled ? "enabled" : "paused" })),
    });
  }
  const feed = data[0];
  if (!feed.enabled) {
    return json({ source, reply: `${feed.name} is paused, so I did not prepare a run. Enable it in Inventory feeds first.` });
  }
  const created = await createFeedRunCommand({
    tenantId,
    actorUserId,
    feed: { id: feed.id, name: feed.name, configVersion: feed.config_version },
  });
  if (!created.ok) {
    return json({
      error: created.reason === "migration_required"
        ? "Reviewed admin commands are not available until migration 080 is applied."
        : "Unable to prepare the reviewed feed command.",
    }, 503);
  }
  const command = created.command;
  return json({
    source,
    reply: `I prepared a run for ${command.feed.name}. Review the exact operation below, then confirm it.`,
    command: {
      id: command.commandId,
      expiresAt: command.expiresAt,
      capabilityId: "feed.run.enqueue",
      summary: `Queue one manual run of ${command.feed.name}.`,
    },
  });
}

function unsupported(): Response {
  return json({
    source: "deterministic",
    reply: "I can currently open dashboard areas and find vehicles, leads, or customers from verified tenant data. I won’t guess or make a change until that capability is explicitly supported and reviewed.",
  });
}

/** Avoid recording raw natural-language input or model output in debug logs. */
function debugIntent(intent: ReturnType<typeof compileDeterministicAdminIntent>): Record<string, unknown> {
  switch (intent.kind) {
    case "navigate":
      return { kind: intent.kind, capabilityId: intent.capabilityId };
    case "clarify":
      return { kind: intent.kind };
    case "describe_current_page":
      return { kind: intent.kind };
    case "summarize_concierge_config":
      return { kind: intent.kind };
    case "summarize_overview":
      return { kind: intent.kind };
    case "inspect_photo_gap":
      return { kind: intent.kind };
    case "summarize_conversion":
      return { kind: intent.kind, days: intent.days };
    case "inspect_aging_inventory":
      return { kind: intent.kind, days: intent.days };
    case "inspect_launch_readiness":
      return { kind: intent.kind };
    case "assign_lead":
      return { kind: intent.kind, hasLead: Boolean(intent.leadQuery), hasAssignee: Boolean(intent.assigneeQuery) };
    case "update_vehicle_price":
      return { kind: intent.kind, hasVehicle: Boolean(intent.vehicleQuery) };
    case "update_vehicle_status":
      return { kind: intent.kind, hasVehicle: Boolean(intent.vehicleQuery), status: intent.status };
    case "search_vehicles":
      return { kind: intent.kind, hasQuery: Boolean(intent.query) };
    case "search_leads":
      return { kind: intent.kind, status: intent.status };
    case "search_customers":
      return { kind: intent.kind, hasQuery: Boolean(intent.query) };
    case "search_pages":
      return { kind: intent.kind, hasQuery: Boolean(intent.query) };
    case "inspect_feed_runs":
      return { kind: intent.kind, status: intent.status };
    case "enqueue_feed_run":
      return { kind: intent.kind, hasFeedQuery: Boolean(intent.feedQuery) };
    case "update_lead_status":
      return { kind: intent.kind, hasLeadQuery: Boolean(intent.leadQuery), status: intent.status };
    case "unsupported":
      return { kind: intent.kind };
  }
}

function formatAdminTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : date.toISOString();
}

function hasStructuredVehicleScope(filters: ReturnType<typeof extractVehicleFilters>): boolean {
  return filters.make !== undefined || filters.model !== undefined || filters.year !== undefined ||
    filters.yearMin !== undefined || filters.yearMax !== undefined || filters.priceMin !== undefined ||
    filters.priceMax !== undefined || filters.mileageMax !== undefined || filters.bodyStyle !== undefined ||
    filters.stockType !== undefined || filters.fuelType !== undefined || filters.drivetrain !== undefined ||
    filters.sellerState !== undefined;
}

function addVehicleFilterParams(params: URLSearchParams, filters: ReturnType<typeof extractVehicleFilters>): void {
  for (const [key, value] of Object.entries({
    minPrice: filters.priceMin,
    maxPrice: filters.priceMax,
    minYear: filters.year ?? filters.yearMin,
    maxYear: filters.year ?? filters.yearMax,
    maxMileage: filters.mileageMax,
  })) {
    if (value !== undefined) params.set(key, String(value));
  }
}

function vehicleSearchLabel(filters: ReturnType<typeof extractVehicleFilters>, safeQuery: string): string {
  const parts = [
    filters.make,
    filters.model,
    filters.year !== undefined ? String(filters.year) : undefined,
    filters.priceMin !== undefined || filters.priceMax !== undefined
      ? `${filters.priceMin !== undefined ? `$${filters.priceMin.toLocaleString()}–` : "under "}${filters.priceMax !== undefined ? `$${filters.priceMax.toLocaleString()}` : ""}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  return parts.length ? ` matching ${parts.join(" · ")}` : safeQuery ? ` matching “${safeQuery}”` : "";
}

function leadLabel(lead: { first_name: string; last_name: string; email: string | null }): string {
  const name = `${lead.first_name} ${lead.last_name}`.trim();
  return name || lead.email || "Unnamed lead";
}
