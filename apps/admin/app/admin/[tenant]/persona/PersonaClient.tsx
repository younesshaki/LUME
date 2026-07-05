"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BotPersona, BotPersonaCapabilities } from "@lume/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  BOT_PERSONA_TONES,
  formFromPersona,
  payloadFromPersonaForm,
  rowToBotPersona,
  type BotPersonaForm,
  type BotPersonaRow,
} from "@/lib/persona";

type PersonaClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialPersona: BotPersona;
  migrationWarning: string | null;
};

type SaveState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

const CAPABILITY_FIELDS: Array<{
  key: keyof Required<BotPersonaCapabilities>;
  label: string;
  description: string;
}> = [
  {
    key: "navigate",
    label: "Navigate visitors",
    description: "Allow the bot to route visitors to relevant public pages.",
  },
  {
    key: "filterInventory",
    label: "Filter inventory",
    description: "Allow the bot to apply vehicle inventory filters.",
  },
  {
    key: "openLeadForm",
    label: "Open lead form",
    description: "Allow the bot to move visitors into the contact flow.",
  },
  {
    key: "captureLead",
    label: "Capture leads",
    description: "Allow the bot to submit qualified lead details.",
  },
  {
    key: "scheduleAppointment",
    label: "Schedule appointments",
    description: "Reserved for future appointment automation.",
  },
];

export default function PersonaClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialPersona,
  migrationWarning,
}: PersonaClientProps) {
  const router = useRouter();
  const [persona, setPersona] = useState(initialPersona);
  const [form, setForm] = useState<BotPersonaForm>(() => formFromPersona(initialPersona));
  const [state, setState] = useState<SaveState>({ type: "idle", message: "" });

  async function savePersona() {
    if (migrationWarning) {
      setState({ type: "error", message: migrationWarning });
      return;
    }

    setState({ type: "saving", message: "Saving persona..." });
    try {
      const payload = payloadFromPersonaForm(tenantId, form);
      const supabase = createPersonaClient();
      const query = persona.id
        ? supabase
            .from("bot_personas")
            .update(payload)
            .eq("id", persona.id)
            .eq("tenant_id", tenantId)
            .select("*")
            .single()
        : supabase
            .from("bot_personas")
            .insert(payload)
            .select("*")
            .single();

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      setPersona(rowToBotPersona(data as BotPersonaRow));
      setState({ type: "success", message: "Persona saved." });
      router.refresh();
    } catch (error) {
      setState({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save persona.",
      });
    }
  }

  function updateCapability(key: keyof Required<BotPersonaCapabilities>, checked: boolean) {
    setForm((current) => ({
      ...current,
      capabilities: { ...current.capabilities, [key]: checked },
    }));
    setState({ type: "idle", message: "" });
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bot Persona</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the active visitor-facing bot for {tenantName}{" "}
            <code>/{tenantSlug}</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={savePersona}
          disabled={state.type === "saving" || Boolean(migrationWarning)}
          className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          Save Persona
        </button>
      </header>

      {migrationWarning && <StatusBanner type="error" message={migrationWarning} />}
      {state.message && <StatusBanner type={state.type} message={state.message} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <label className="block text-sm font-medium">
            Name
            <input
              value={form.name}
              onChange={(event) => {
                setForm((current) => ({ ...current, name: event.target.value }));
                setState({ type: "idle", message: "" });
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </label>

          <label className="block text-sm font-medium">
            Tone
            <select
              value={form.tone}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  tone: event.target.value as BotPersonaForm["tone"],
                }));
                setState({ type: "idle", message: "" });
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            >
              {BOT_PERSONA_TONES.map((tone) => (
                <option key={tone.value} value={tone.value}>
                  {tone.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            System prompt
            <textarea
              value={form.systemPrompt}
              rows={10}
              onChange={(event) => {
                setForm((current) => ({ ...current, systemPrompt: event.target.value }));
                setState({ type: "idle", message: "" });
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm leading-6 dark:border-neutral-700"
            />
          </label>
        </section>

        <aside className="space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold">Capabilities</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              These flags describe what the bot may do for this tenant.
            </p>
          </div>
          <div className="space-y-3">
            {CAPABILITY_FIELDS.map((field) => (
              <label
                key={field.key}
                className="flex gap-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                <input
                  type="checkbox"
                  checked={form.capabilities[field.key]}
                  onChange={(event) => updateCapability(field.key, event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{field.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {field.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {persona.id && (
            <p className="text-xs text-muted-foreground">
              Last saved {formatDate(persona.updatedAt)}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatusBanner({ type, message }: { type: SaveState["type"]; message: string }) {
  const className =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
      : type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${className}`}
      role={type === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createPersonaClient() {
  return createSupabaseBrowserClient() as unknown as {
    from: (table: "bot_personas") => {
      update: (payload: unknown) => PersonaMutationBuilder;
      insert: (payload: unknown) => PersonaSelectBuilder;
    };
  };
}

type PersonaMutationBuilder = {
  eq: (column: string, value: string) => PersonaMutationBuilder;
  select: (columns: string) => PersonaSelectBuilder;
};

type PersonaSelectBuilder = {
  select: (columns: string) => PersonaSelectBuilder;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
};
