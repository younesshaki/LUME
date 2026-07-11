"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export type RegisteredToolSummary = {
  name: string;
  description: string;
};

type ToolWhitelistProps = {
  tenantId: string;
  tools: RegisteredToolSummary[];
  initialAllowedTools: string[];
  configurationWarning: string | null;
};

export function ToolWhitelist({
  tenantId,
  tools,
  initialAllowedTools,
  configurationWarning,
}: ToolWhitelistProps) {
  const router = useRouter();
  const [allowedTools, setAllowedTools] = useState(() => new Set(initialAllowedTools));
  const [state, setState] = useState<
    { type: "idle" | "saving" | "success" | "error"; message: string }
  >({ type: "idle", message: "" });

  function toggleTool(name: string, checked: boolean) {
    setAllowedTools((current) => {
      const next = new Set(current);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
    setState({ type: "idle", message: "" });
  }

  async function saveTools() {
    if (configurationWarning) {
      setState({ type: "error", message: configurationWarning });
      return;
    }
    setState({ type: "saving", message: "Saving callable tools…" });
    const orderedAllowlist = tools
      .filter((tool) => allowedTools.has(tool.name))
      .map((tool) => tool.name);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("tenant_bot_config").upsert({
      tenant_id: tenantId,
      allowed_tools: orderedAllowlist,
    }, { onConflict: "tenant_id" });
    if (error) {
      setState({ type: "error", message: `Unable to save tools: ${error.message}` });
      return;
    }
    setState({ type: "success", message: "Callable tools saved." });
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800" aria-labelledby="callable-tools-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="callable-tools-heading" className="text-sm font-semibold">Callable tools</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            These server-enforced functions are separate from visitor-interface capabilities above.
            An unchecked tool is neither advertised to nor executable by the model.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void saveTools()}
          disabled={state.type === "saving" || Boolean(configurationWarning)}
        >
          {state.type === "saving" ? "Saving…" : "Save tools"}
        </Button>
      </div>

      {configurationWarning ? (
        <p className="mt-3 text-sm text-destructive" role="alert">{configurationWarning}</p>
      ) : null}

      <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Tools the tenant bot may call</legend>
        {tools.map((tool) => (
          <label
            key={tool.name}
            className="flex gap-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
          >
            <input
              type="checkbox"
              checked={allowedTools.has(tool.name)}
              onChange={(event) => toggleTool(tool.name, event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{humanizeToolName(tool.name)}</span>
              <code className="mt-0.5 block text-xs text-muted-foreground">{tool.name}</code>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {tool.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.message ? (
        <p
          className={state.type === "error" ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-emerald-600"}
          role={state.type === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

function humanizeToolName(name: string): string {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
