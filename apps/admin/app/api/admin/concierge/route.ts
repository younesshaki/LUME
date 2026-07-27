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
import { createLeadStatusCommand } from "@/lib/adminConciergeCommands.server";
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
    case "inspect_feed_runs":
      return inspectFeedRuns(supabase, tenant.id, tenant.slug, intent.status, source, memoryStore, memoryKey);
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
    case "summarize_overview":
      return { kind: intent.kind };
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
