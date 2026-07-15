import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";

type Props = { params: Promise<{ tenant: string; visitorId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const service = createServiceClient();
  const { data: visitor } = await service.from("visitors").select("id, first_name, last_name, email, created_at, updated_at").eq("tenant_id", tenant.id).eq("id", visitorId).maybeSingle();
  if (!visitor) notFound();
  const [saves, leads, chats, loyalty, events] = await Promise.all([
    service.from("visitor_saved_vehicles").select("vehicle_id, created_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(25),
    service.from("leads").select("id, vehicle_id, source, status, created_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(25),
    service.from("chat_sessions").select("id, created_at, updated_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("updated_at", { ascending: false }).limit(25),
    service.from("loyalty_accounts").select("points_balance, tier, updated_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).maybeSingle(),
    service.from("conversion_events").select("event_name, vehicle_id, occurred_at").eq("tenant_id", tenant.id).eq("visitor_id", visitorId).order("occurred_at", { ascending: false }).limit(50),
  ]);
  if (saves.error || leads.error || chats.error || loyalty.error || events.error) throw new Error("Unable to load customer profile");
  const savedVehicleIds = (saves.data ?? []).map((save) => save.vehicle_id);
  const { data: savedVehicleRows, error: savedVehicleError } = savedVehicleIds.length
    ? await service.from("vehicles").select("id, year, make, model, trim, price, status").eq("tenant_id", tenant.id).in("id", savedVehicleIds)
    : { data: [], error: null };
  if (savedVehicleError) throw new Error("Unable to load saved vehicle details");
  const savedVehicleById = new Map((savedVehicleRows ?? []).map((vehicle) => [vehicle.id, vehicle]));
  const name = `${visitor.first_name} ${visitor.last_name}`.trim() || visitor.email;
  return <div className="space-y-6">
    <Link className="text-sm text-muted-foreground hover:underline" href={`/admin/${tenant.slug}/customers`}>← Customers</Link>
    <header><h1 className="text-2xl font-semibold">{name}</h1><p className="mt-1 text-sm text-muted-foreground">{visitor.email} · Joined {format(visitor.created_at)}</p></header>
    <section className="grid gap-4 md:grid-cols-3"><Card label="Loyalty" value={`${loyalty.data?.points_balance ?? 0} points`} helper={loyalty.data?.tier ?? "No tier"}/><Card label="Leads" value={String(leads.data?.length ?? 0)} helper="Tenant-scoped"/><Card label="Chat sessions" value={String(chats.data?.length ?? 0)} helper="Bounded recent history"/></section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Saved vehicles</h2>{!saves.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No saved vehicles.</p> : <ul className="mt-3 space-y-2 text-sm">{saves.data.map((save) => { const vehicle = savedVehicleById.get(save.vehicle_id); const title = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`.trim() : "Unavailable vehicle"; return <li key={save.vehicle_id} className="flex justify-between gap-4"><span>{vehicle ? <Link className="hover:underline" href={`/admin/${tenant.slug}/vehicles/${vehicle.id}`}>{title}</Link> : title} {vehicle ? <span className="ml-2 text-muted-foreground">${vehicle.price.toLocaleString()}</span> : null} <Badge variant="outline" className="ml-2">{vehicle?.status ?? "unavailable"}</Badge></span><time>{format(save.created_at)}</time></li>; })}</ul>}</section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Leads</h2>{!leads.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No linked leads.</p> : <ul className="mt-3 space-y-2 text-sm">{leads.data.map((lead) => <li key={lead.id}><Link className="hover:underline" href={`/admin/${tenant.slug}/leads/${lead.id}`}>{lead.source} inquiry</Link> <Badge variant="outline" className="ml-2">{lead.status}</Badge> <time className="ml-2 text-muted-foreground">{format(lead.created_at)}</time></li>)}</ul>}</section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Activity timeline</h2>{!events.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No consented activity data is available.</p> : <ol className="mt-3 space-y-2 text-sm">{events.data.map((event, index) => <li key={`${event.event_name}-${event.occurred_at}-${index}`} className="flex justify-between"><span>{event.event_name.replaceAll("_", " ")}</span><time>{format(event.occurred_at)}</time></li>)}</ol>}</section>
  </div>;
}
function Card({ label, value, helper }: { label: string; value: string; helper: string }) { return <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></div>; }
function format(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date); }
