"use client";

import Link from "next/link";
import { useState } from "react";
import type { Lead, LeadActivity, LeadStatus } from "@lume/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToLeadActivity } from "@/lib/leadActivities";

type LeadDetailClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  lead: Lead;
  initialActivities: LeadActivity[];
};

type StatusState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export default function LeadDetailClient({
  tenantId,
  tenantSlug,
  tenantName,
  lead,
  initialActivities,
}: LeadDetailClientProps) {
  const [currentLead, setCurrentLead] = useState(lead);
  const [activities, setActivities] = useState(initialActivities);
  const [state, setState] = useState<StatusState>({ type: "idle", message: "" });

  async function updateStatus(nextStatus: LeadStatus) {
    if (nextStatus === currentLead.status) return;

    const previousStatus = currentLead.status;
    setState({ type: "saving", message: "Updating lead status..." });
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from("leads")
        .update({ status: nextStatus })
        .eq("tenant_id", tenantId)
        .eq("id", currentLead.id);
      if (updateError) throw new Error(updateError.message);

      const body = `Status changed from ${previousStatus} to ${nextStatus}.`;
      const { data: activityRow, error: activityError } = await supabase
        .from("lead_activities")
        .insert({
          tenant_id: tenantId,
          lead_id: currentLead.id,
          actor_user_id: null,
          type: "status_change",
          body,
        })
        .select("*")
        .single();
      if (activityError) throw new Error(activityError.message);

      setCurrentLead((current) => ({ ...current, status: nextStatus }));
      setActivities((current) => [
        rowToLeadActivity(activityRow),
        ...current,
      ]);
      setState({ type: "success", message: "Lead status updated." });
    } catch (error) {
      setState({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update lead status.",
      });
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href={`/admin/${tenantSlug}/leads`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Back to leads
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{leadName(currentLead)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Lead for {tenantName} captured from {currentLead.source}.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Status
          <select
            value={currentLead.status}
            disabled={state.type === "saving"}
            onChange={(event) => void updateStatus(event.target.value as LeadStatus)}
            className="mt-1 block rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </header>

      {state.message && <StatusBanner type={state.type} message={state.message} />}

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold">Contact</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <InfoRow label="Email" value={currentLead.email} />
              <InfoRow label="Phone" value={currentLead.phone} />
              <InfoRow label="Vehicle" value={currentLead.vehicleId} />
              <InfoRow label="Created" value={formatDate(currentLead.createdAt)} />
              <InfoRow label="Updated" value={formatDate(currentLead.updatedAt)} />
            </dl>
          </div>
          {currentLead.message && (
            <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">Message</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                {currentLead.message}
              </p>
            </div>
          )}
          <div className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
            <p>UTM source: {currentLead.utmSource || "N/A"}</p>
            <p>UTM medium: {currentLead.utmMedium || "N/A"}</p>
            <p>UTM campaign: {currentLead.utmCampaign || "N/A"}</p>
          </div>
        </aside>

        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <div className="mt-4 space-y-4">
            {activities.length === 0 && (
              <p className="text-sm text-neutral-500">No activity has been recorded yet.</p>
            )}
            {activities.map((activity) => (
              <article
                key={activity.id}
                className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">{activityLabel(activity.type)}</p>
                  <time className="text-xs text-neutral-500">
                    {formatDate(activity.createdAt)}
                  </time>
                </div>
                {activity.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                    {activity.body}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 break-words text-neutral-800 dark:text-neutral-100">
        {value || "N/A"}
      </dd>
    </div>
  );
}

function StatusBanner({ type, message }: { type: StatusState["type"]; message: string }) {
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

function leadName(lead: Lead): string {
  const name = `${lead.firstName} ${lead.lastName}`.trim();
  return name || "Anonymous lead";
}

function activityLabel(type: LeadActivity["type"]): string {
  return type.replace(/_/g, " ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
