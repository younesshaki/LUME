"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@lume/db";
import {
  mergeLeadLostReasons,
  normalizeLeadLostReasonKey,
  type LeadLostReason,
  type TenantLeadLostReasonOverride,
} from "@/lib/leadLostReasons";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LostReasonRow = Database["public"]["Tables"]["lead_lost_reason_options"]["Row"];

type LostReasonManagerProps = {
  tenantId: string;
  initialOverrides: TenantLeadLostReasonOverride[];
};

export function LostReasonManager({ tenantId, initialOverrides }: LostReasonManagerProps) {
  const router = useRouter();
  const [overrides, setOverrides] = useState(initialOverrides);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const reasons = useMemo(() => mergeLeadLostReasons(overrides), [overrides]);

  async function persistReason(reason: LeadLostReason, form: HTMLFormElement) {
    const data = new FormData(form);
    const label = String(data.get("label") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const rawSortOrder = Number(data.get("sortOrder"));
    const sortOrder = Number.isFinite(rawSortOrder)
      ? Math.max(0, Math.min(1_000_000, Math.trunc(rawSortOrder)))
      : reason.sortOrder;
    if (!label) {
      setMessage({ type: "error", text: "Reason labels cannot be empty." });
      return;
    }

    await upsertReason({
      key: reason.key,
      label,
      sortOrder,
      isActive: data.get("isActive") === "on",
    });
  }

  async function addReason(form: HTMLFormElement) {
    const data = new FormData(form);
    const label = String(data.get("newLabel") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const key = normalizeLeadLostReasonKey(String(data.get("newKey") ?? "") || label);
    if (!key || !label) {
      setMessage({ type: "error", text: "Enter a valid custom key and label." });
      return;
    }
    if (reasons.some((reason) => reason.key === key)) {
      setMessage({ type: "error", text: "That reason key already exists." });
      return;
    }

    const maxSortOrder = reasons.reduce((max, reason) => Math.max(max, reason.sortOrder), 0);
    const saved = await upsertReason({
      key,
      label,
      sortOrder: Math.min(maxSortOrder + 10, 1_000_000),
      isActive: true,
    });
    if (saved) form.reset();
  }

  async function upsertReason(reason: TenantLeadLostReasonOverride): Promise<boolean> {
    setSavingKey(reason.key);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("lead_lost_reason_options")
      .upsert({
        tenant_id: tenantId,
        key: reason.key,
        label: reason.label ?? reason.key,
        sort_order: reason.sortOrder ?? 0,
        is_active: reason.isActive ?? true,
      }, { onConflict: "tenant_id,key" })
      .select("*")
      .single();
    setSavingKey(null);

    if (error) {
      setMessage({ type: "error", text: `Unable to save lost reason: ${error.message}` });
      return false;
    }

    const saved = rowToOverride(data as LostReasonRow);
    setOverrides((current) => [
      ...current.filter((item) => normalizeLeadLostReasonKey(item.key) !== saved.key),
      saved,
    ]);
    setMessage({ type: "success", text: "Lost-reason taxonomy saved." });
    router.refresh();
    return true;
  }

  return (
    <details className="rounded-xl border bg-muted/20">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Configure lost reasons
      </summary>
      <div className="space-y-4 border-t p-4">
        <p className="text-xs text-muted-foreground">
          Inactive reasons remain available in historical reports but cannot be selected for new updates.
        </p>
        <div className="space-y-2">
          {reasons.map((reason) => (
            <form
              key={`${reason.key}:${reason.label}:${reason.sortOrder}:${reason.isActive}`}
              className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void persistReason(reason, event.currentTarget);
              }}
            >
              <label className="text-xs font-medium">
                Label
                <Input name="label" defaultValue={reason.label} maxLength={120} className="mt-1" />
              </label>
              <label className="text-xs font-medium">
                Order
                <Input
                  name="sortOrder"
                  type="number"
                  min={0}
                  max={1_000_000}
                  defaultValue={reason.sortOrder}
                  className="mt-1"
                />
              </label>
              <label className="flex h-9 items-center gap-2 text-xs">
                <input name="isActive" type="checkbox" defaultChecked={reason.isActive} />
                Active
              </label>
              <Button type="submit" size="sm" disabled={savingKey !== null}>
                {savingKey === reason.key ? "Saving…" : "Save"}
              </Button>
              <p className="text-xs text-muted-foreground sm:col-span-4">
                Key: <code>{reason.key}</code>{reason.isDefault ? " · default" : " · custom"}
              </p>
            </form>
          ))}
        </div>

        <form
          className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void addReason(event.currentTarget);
          }}
        >
          <label className="text-xs font-medium">
            New label
            <Input name="newLabel" required maxLength={120} className="mt-1" />
          </label>
          <label className="text-xs font-medium">
            Stable key (optional)
            <Input name="newKey" maxLength={64} placeholder="auto-generated" className="mt-1" />
          </label>
          <Button type="submit" size="sm" disabled={savingKey !== null}>Add reason</Button>
        </form>

        {message ? (
          <p
            className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}
            role={message.type === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function rowToOverride(row: LostReasonRow): TenantLeadLostReasonOverride {
  return {
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}
