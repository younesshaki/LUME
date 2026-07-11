"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { updatePublicPriceSignal } from "./price-history-actions";

export function PriceSignalToggle({
  tenantSlug,
  initialEnabled,
  canManage,
}: {
  tenantSlug: string;
  initialEnabled: boolean;
  canManage: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  const change = (nextEnabled: boolean) => {
    const previous = enabled;
    setEnabled(nextEnabled);
    startTransition(async () => {
      const result = await updatePublicPriceSignal(tenantSlug, nextEnabled);
      if (result.error) {
        setEnabled(previous);
        toast.error(result.error);
        return;
      }
      toast.success(nextEnabled ? "Public price signal enabled." : "Public price signal disabled.");
    });
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
      <div>
        <label htmlFor="public-price-signal" className="text-sm font-medium">
          Public recent-reductions signal
        </label>
        <p id="public-price-signal-help" className="mt-1 text-xs text-muted-foreground">
          When enabled, live vehicle pages may show how many price reductions occurred in 30 days.
          This tenant-wide setting is off by default.
        </p>
        {!canManage ? (
          <p className="mt-1 text-xs text-muted-foreground">Owner or admin access is required.</p>
        ) : null}
      </div>
      <Switch
        id="public-price-signal"
        checked={enabled}
        onCheckedChange={change}
        disabled={!canManage || pending}
        aria-describedby="public-price-signal-help"
      />
    </div>
  );
}
