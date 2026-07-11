import { notFound } from "next/navigation";
import { BOT_TOOLS } from "@lume/bot";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  defaultPersona,
  personaMigrationWarning,
  rowToBotPersona,
  type BotPersonaRow,
} from "@/lib/persona";
import PersonaClient from "./PersonaClient";
import { ToolWhitelist } from "./ToolWhitelist";

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

  const [personaResult, toolConfigResult] = await Promise.all([
    supabase
      .from("bot_personas")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("tenant_bot_config")
      .select("allowed_tools")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
  ]);
  const { data: personaRow, error: personaError } = personaResult;

  const migrationWarning = personaError
    ? personaMigrationWarning(personaError.message)
    : null;

  const tools = BOT_TOOLS.map((tool) => ({ name: tool.name, description: tool.description }));
  const registeredNames = new Set(tools.map((tool) => tool.name));
  const initialAllowedTools = toolConfigResult.data
    ? toolConfigResult.data.allowed_tools.filter((name) => registeredNames.has(name))
    : tools.map((tool) => tool.name);
  const toolConfigurationWarning = toolConfigResult.error
    ? "Callable-tool configuration is unavailable until migration 031 is applied."
    : null;

  return (
    <div className="max-w-5xl space-y-6">
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
      <ToolWhitelist
        tenantId={tenant.id}
        tools={tools}
        initialAllowedTools={initialAllowedTools}
        configurationWarning={toolConfigurationWarning}
      />
    </div>
  );
}
