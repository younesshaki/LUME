import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buildCustomerTimeline, customerEngagement, summarizeVehicleInterest } from "@/lib/customer360";
import { isMissingOptionalCustomerRelation } from "@/lib/customerProfileOptionalData";
import { captureError } from "@/lib/observability";

type Props = { params: Promise<{ tenant: string; visitorId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 25;
const EVENT_LIMIT = 50;
const TIMELINE_LIMIT = 50;

type VehicleRow = { id: string; year: number; make: string; model: string; trim: string | null; price: number; status: string };

export default async function CustomerProfilePage({ params }: Props) {
  const { tenant: slug, visitorId } = await params;
  if (!UUID.test(visitorId)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/${slug}/customers/${visitorId}`)}`);
  const { data: tenant } = await supabase.from("tenants").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();
  const [{ data: member }, { data: platformAdmin }] = await Promise.all([
    supabase.from("tenant_members").select("role").eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle(),
    supabase.rpc("is_platform_admin"),
  ]);
  if (!member && !platformAdmin) notFound();

  // Visitors are deny-all under RLS because credentials live in the same table.
  // Authorize before using the service client, and keep the projection explicit.
  const service = createServiceClient();
  const { data: visitor } = await service.from("visitors")
    .select("id, first_name, last_name, email, created_at, updated_at")
    .eq("tenant_id", tenant.id).eq("id", visitorId).maybeSingle();
  if (!visitor) notFound();

  const [savesResult, leadsResult, chatsResult, linkedLoyaltyResult, legacyLoyaltyResult, eventsResult] = await Promise.all([
    service.from("visitor_saved_vehicles").select("vehicle_id, created_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(LIST_LIMIT),
    service.from("leads").select("id, vehicle_id, source, status, assigned_to, created_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(LIST_LIMIT),
    service.from("chat_sessions").select("id, created_at, updated_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("updated_at", { ascending: false }).limit(LIST_LIMIT),
    service.from("loyalty_accounts").select("id, points_balance, tier, updated_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).maybeSingle(),
    service.from("loyalty_accounts").select("id, points_balance, tier, updated_at").eq("tenant_id", tenant.id).is("visitor_id", null).ilike("email", visitor.email).order("updated_at", { ascending: false }).limit(1),
    service.from("conversion_events").select("event_name, vehicle_id, occurred_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("occurred_at", { ascending: false }).limit(EVENT_LIMIT),
  ]);
  for (const [source, result] of [
    ["leads", leadsResult], ["chat_sessions", chatsResult], ["loyalty_accounts", linkedLoyaltyResult], ["legacy_loyalty_accounts", legacyLoyaltyResult],
  ] as const) {
    if (result.error) {
      captureError("admin/customer-profile", result.error, { tenantId: tenant.id, visitorId, source });
      throw new Error("Unable to load customer profile");
    }
  }
  const saves = optionalRows(savesResult, "visitor_saved_vehicles", tenant.id, visitorId);
  const leads = leadsResult.data ?? [];
  const chats = chatsResult.data ?? [];
  const events = optionalRows(eventsResult, "conversion_events", tenant.id, visitorId);
  // Prefer a visitor-linked account; this fallback mirrors the directory's
  // treatment of pre-account, email-only loyalty accounts without duplicating it.
  const loyalty = linkedLoyaltyResult.data ?? legacyLoyaltyResult.data?.[0] ?? null;
  const savedVehicleIds = new Set(saves.map((save) => save.vehicle_id));
  const leadVehicleIds = new Set(leads.flatMap((lead) => lead.vehicle_id ? [lead.vehicle_id] : []));
  const eventVehicleIds = events.flatMap((event) => event.vehicle_id ? [event.vehicle_id] : []);
  const vehicleIds = Array.from(new Set([...savedVehicleIds, ...leadVehicleIds, ...eventVehicleIds]));
  const leadIds = leads.map((lead) => lead.id);
  const chatIds = chats.map((chat) => chat.id);

  const [vehicleResult, leadActivityResult, chatMessageResult, loyaltyTransactionResult] = await Promise.all([
    vehicleIds.length ? service.from("vehicles").select("id, year, make, model, trim, price, status").eq("tenant_id", tenant.id).in("id", vehicleIds) : Promise.resolve({ data: [] as VehicleRow[], error: null }),
    leadIds.length ? service.from("lead_activities").select("id, lead_id, type, created_at").eq("tenant_id", tenant.id).in("lead_id", leadIds).order("created_at", { ascending: false }).limit(TIMELINE_LIMIT) : Promise.resolve({ data: [], error: null }),
    chatIds.length ? service.from("chat_messages").select("session_id").eq("tenant_id", tenant.id).in("session_id", chatIds).limit(500) : Promise.resolve({ data: [], error: null }),
    loyalty ? service.from("loyalty_transactions").select("id, points_delta, description, occurred_at").eq("tenant_id", tenant.id).eq("account_id", loyalty.id).order("occurred_at", { ascending: false }).limit(LIST_LIMIT) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [vehicleResult, leadActivityResult, chatMessageResult, loyaltyTransactionResult]) {
    if (result.error) throw new Error("Unable to load customer profile details");
  }
  const vehicleById = new Map((vehicleResult.data ?? []).map((vehicle) => [vehicle.id, vehicle]));
  const messageCountBySession = new Map<string, number>();
  for (const message of chatMessageResult.data ?? []) messageCountBySession.set(message.session_id, (messageCountBySession.get(message.session_id) ?? 0) + 1);
  const interest = summarizeVehicleInterest(events, savedVehicleIds, leadVehicleIds);
  const engagement = customerEngagement(events, saves.length, leads.length, chats.length);
  const adminRoot = `/admin/${tenant.slug}`;
  const timeline = buildCustomerTimeline({
    accountCreatedAt: visitor.created_at,
    events,
    saves,
    leads,
    leadActivities: leadActivityResult.data ?? [],
    chats,
    loyaltyTransactions: loyaltyTransactionResult.data ?? [],
    adminSlug: adminRoot,
    tenantSlug: tenant.slug,
    vehicleIds: new Set(vehicleById.keys()),
  });
  const name = `${visitor.first_name} ${visitor.last_name}`.trim() || visitor.email;

  return <div className="space-y-6">
    <Link className="text-sm text-muted-foreground hover:underline" href={`${adminRoot}/customers`}>← Customers</Link>
    <header><h1 className="text-2xl font-semibold">{name}</h1><p className="mt-1 text-sm text-muted-foreground">{visitor.email} · Joined {format(visitor.created_at)} · Last account update {format(visitor.updated_at)}</p></header>
    <section className="grid gap-4 md:grid-cols-4">
      <Card label="Loyalty" value={`${loyalty?.points_balance ?? 0} points`} helper={loyalty?.tier ?? "No tier"}/>
      <Card label="Leads" value={String(leads.length)} helper="Recent tenant-scoped leads"/>
      <Card label="Chat sessions" value={String(chats.length)} helper="Bounded recent history"/>
      <Card label="Engagement" value={engagement.label} helper={engagement.explanation}/>
    </section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Saved vehicles</h2><p className="mt-1 text-sm text-muted-foreground">Most recent {LIST_LIMIT}; sold and archived vehicles remain visible.</p>{!saves.length ? <Empty>No saved vehicles.</Empty> : <ul className="mt-3 space-y-2 text-sm">{saves.map((save) => <li key={save.vehicle_id} className="flex justify-between gap-4"><VehicleLink vehicle={vehicleById.get(save.vehicle_id)} adminRoot={adminRoot}/><time>{format(save.created_at)}</time></li>)}</ul>}</section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Vehicle interest</h2>{!events.length ? <Empty>Vehicle-interest data is unavailable because this customer has no consented analytics activity.</Empty> : !interest.length ? <Empty>No vehicle views have been recorded.</Empty> : <ul className="mt-3 space-y-2 text-sm">{interest.slice(0, LIST_LIMIT).map((item) => <li key={item.vehicleId} className="flex flex-wrap items-center justify-between gap-2"><span><VehicleLink vehicle={vehicleById.get(item.vehicleId)} adminRoot={adminRoot}/><span className="ml-2 text-muted-foreground">{item.viewCount} view{item.viewCount === 1 ? "" : "s"} · first {format(item.firstViewedAt)} · last {format(item.lastViewedAt)}</span>{item.isSaved ? <Badge variant="outline" className="ml-2">saved</Badge> : null}{item.hasInquiry ? <Badge variant="outline" className="ml-2">inquiry</Badge> : null}</span></li>)}</ul>}</section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Leads</h2>{!leads.length ? <Empty>No linked leads.</Empty> : <ul className="mt-3 space-y-2 text-sm">{leads.map((lead) => <li key={lead.id} className="flex flex-wrap justify-between gap-2"><span><Link className="hover:underline" href={`${adminRoot}/leads/${lead.id}`}>{lead.source} inquiry</Link><Badge variant="outline" className="ml-2">{lead.status}</Badge>{lead.vehicle_id ? <span className="ml-2"><VehicleLink vehicle={vehicleById.get(lead.vehicle_id)} adminRoot={adminRoot}/></span> : null}</span><time className="text-muted-foreground">{format(lead.created_at)}</time></li>)}</ul>}</section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Chats</h2>{!chats.length ? <Empty>No linked chat sessions.</Empty> : <ul className="mt-3 space-y-2 text-sm">{chats.map((chat) => <li key={chat.id} className="flex justify-between gap-4"><span>{messageCountBySession.get(chat.id) ?? 0} recent message{(messageCountBySession.get(chat.id) ?? 0) === 1 ? "" : "s"}</span><time className="text-muted-foreground">Last activity {format(chat.updated_at)}</time></li>)}</ul>}<p className="mt-3 text-xs text-muted-foreground">Message counts are limited to the recent profile read; chat content is never loaded here.</p></section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Loyalty activity</h2>{!loyaltyTransactionResult.data?.length ? <Empty>No loyalty transactions.</Empty> : <ul className="mt-3 space-y-2 text-sm">{loyaltyTransactionResult.data.map((transaction) => <li key={transaction.id} className="flex justify-between gap-4"><span>{transaction.description ?? "Loyalty adjustment"} <span className={transaction.points_delta >= 0 ? "text-emerald-600" : "text-destructive"}>{transaction.points_delta >= 0 ? "+" : ""}{transaction.points_delta.toLocaleString()} points</span></span><time>{format(transaction.occurred_at)}</time></li>)}</ul>}</section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Activity timeline</h2><p className="mt-1 text-sm text-muted-foreground">Newest first; shown from real account, consented analytics, lead, chat, and loyalty records.</p>{!timeline.length ? <Empty>No customer activity is available.</Empty> : <ol className="mt-3 space-y-2 text-sm">{timeline.map((item) => <li key={item.id} className="flex justify-between gap-4"><span>{item.href ? <Link className="hover:underline" href={item.href}>{item.label}</Link> : item.label}</span><time>{format(item.occurredAt)}</time></li>)}</ol>}</section>
  </div>;
}

function VehicleLink({ vehicle, adminRoot }: { vehicle: VehicleRow | undefined; adminRoot: string }) {
  if (!vehicle) return <span>Unavailable vehicle <Badge variant="outline" className="ml-2">unavailable</Badge></span>;
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ""}`.trim();
  return <span><Link className="hover:underline" href={`${adminRoot}/vehicles/${vehicle.id}`}>{title}</Link><span className="ml-2 text-muted-foreground">${vehicle.price.toLocaleString()}</span><Badge variant="outline" className="ml-2">{vehicle.status}</Badge></span>;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="mt-3 text-sm text-muted-foreground">{children}</p>; }
function Card({ label, value, helper }: { label: string; value: string; helper: string }) { return <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></div>; }
function format(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date); }

function optionalRows<T>(
  result: { data: T[] | null; error: { code?: string; message?: string } | null },
  source: string,
  tenantId: string,
  visitorId: string,
): T[] {
  if (!result.error) return result.data ?? [];
  if (isMissingOptionalCustomerRelation(result.error)) {
    captureError("admin/customer-profile/optional-relation", result.error, { tenantId, visitorId, source });
    return [];
  }
  captureError("admin/customer-profile", result.error, { tenantId, visitorId, source });
  throw new Error("Unable to load customer profile");
}
