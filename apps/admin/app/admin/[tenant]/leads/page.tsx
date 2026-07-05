import { notFound } from "next/navigation";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { rowToLead } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <PageHeader
        title="Leads"
        description={`Recent contact, chat, and test-drive leads for ${tenant.name}.`}
      />

      {leads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No leads yet"
          description="Leads captured by your website's contact forms and AI concierge will appear here, ready to work."
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link
                      href={`/admin/${tenant.slug}/leads/${lead.id}`}
                      className="font-medium hover:underline"
                    >
                      {leadName(lead.firstName, lead.lastName)}
                    </Link>
                    {lead.message && (
                      <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                        {lead.message}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.email && <p>{lead.email}</p>}
                    {lead.phone && <p>{lead.phone}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-muted-foreground">
                      {lead.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(lead.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
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
