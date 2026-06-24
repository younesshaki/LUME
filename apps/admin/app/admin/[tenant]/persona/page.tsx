import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  defaultPersona,
  personaMigrationWarning,
  rowToBotPersona,
  type BotPersonaRow,
} from "@/lib/persona";
import PersonaClient from "./PersonaClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function PersonaPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: personaRow, error: personaError } = await supabase
    .from("bot_personas")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .maybeSingle();

  const migrationWarning = personaError
    ? personaMigrationWarning(personaError.message)
    : null;

  return (
    <PersonaClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialPersona={
        personaRow
          ? rowToBotPersona(personaRow as BotPersonaRow)
          : defaultPersona(tenant.id)
      }
      migrationWarning={migrationWarning}
    />
  );
}
