import { notFound } from "next/navigation";
import Link from "next/link";
import { rowToLead } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function LeadsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Unable to load leads: ${error.message}`);
  }

  const leads = (data ?? []).map(rowToLead);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Recent contact, chat, and test-drive leads for {tenant.name}.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Lead</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Contact</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Source</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-neutral-500">
                  No leads captured yet.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/${tenant.slug}/leads/${lead.id}`}
                    className="font-medium hover:underline"
                  >
                    {leadName(lead.firstName, lead.lastName)}
                  </Link>
                  {lead.message && (
                    <p className="mt-1 max-w-md truncate text-xs text-neutral-500">{lead.message}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {lead.email && <p>{lead.email}</p>}
                  {lead.phone && <p>{lead.phone}</p>}
                </td>
                <td className="px-4 py-3 text-neutral-500">{lead.source}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(lead.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function leadName(firstName: string, lastName: string): string {
  const name = `${firstName} ${lastName}`.trim();
  return name || "Anonymous lead";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
