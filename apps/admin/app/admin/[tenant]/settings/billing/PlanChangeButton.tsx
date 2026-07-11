"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { changeBillingPlan } from "./actions";

type PlanChangeButtonProps = {
  slug: string;
  planId: string;
  planName: string;
  label: string;
};

export function PlanChangeButton({ slug, planId, planName, label }: PlanChangeButtonProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Change this tenant's plan to ${planName}?`)) return;
          setMessage(null);
          startTransition(async () => {
            const result = await changeBillingPlan(slug, planId);
            setMessage(result.error
              ? { type: "error", text: result.error }
              : { type: "success", text: result.changed === false ? "This plan is already active." : "Plan changed." });
          });
        }}
      >
        {pending ? "Changing…" : label}
      </Button>
      {message ? (
        <p
          className={message.type === "error" ? "text-xs text-destructive" : "text-xs text-emerald-600"}
          role={message.type === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
