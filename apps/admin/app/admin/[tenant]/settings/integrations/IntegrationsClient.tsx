"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import {
  createCrmWebhook,
  removeCrmWebhook,
  setCrmWebhookEnabled,
} from "./actions";

export type CrmWebhookRow = {
  id: string;
  name: string;
  endpointUrl: string;
  enabled: boolean;
  integrationKind: "hubspot" | "pipedrive" | "custom";
  retryDelaysSeconds: number[];
  createdAt: string;
};

export type WebhookDeliveryRow = {
  id: string;
  webhookId: string;
  status: "pending" | "delivering" | "retrying" | "succeeded" | "dead_letter";
  attemptCount: number;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
};

type Props = { slug: string; webhooks: CrmWebhookRow[]; deliveries: WebhookDeliveryRow[] };

export default function IntegrationsClient({ slug, webhooks, deliveries }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ error: boolean; message: string } | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setStatus(null);
    const form = event.currentTarget;
    try {
      const result = await createCrmWebhook(slug, new FormData(form));
      if (result.error) throw new Error(result.error);
      form.reset();
      setStatus({ error: false, message: "CRM webhook created. Its signing secret will not be shown again." });
      router.refresh();
    } catch (error) {
      setStatus({ error: true, message: error instanceof Error ? error.message : "Unable to create webhook." });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(webhook: CrmWebhookRow) {
    setBusy(webhook.id);
    const result = await setCrmWebhookEnabled(slug, webhook.id, !webhook.enabled);
    setStatus(result.error ? { error: true, message: result.error } : null);
    setBusy(null);
    if (!result.error) router.refresh();
  }

  async function remove(webhook: CrmWebhookRow) {
    setBusy(webhook.id);
    const result = await removeCrmWebhook(slug, webhook.id);
    setStatus(result.error ? { error: true, message: result.error } : null);
    setBusy(null);
    if (!result.error) router.refresh();
  }

  return (
    <div className="space-y-6">
      {status ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${status.error ? "border-red-200 text-red-700 dark:border-red-900 dark:text-red-300" : "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"}`} role={status.error ? "alert" : "status"}>
          {status.message}
        </p>
      ) : null}

      <form onSubmit={create} className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Integration name
          <input name="name" required maxLength={100} placeholder="HubSpot production" className="mt-1 block w-full rounded-lg border bg-transparent px-3 py-2" />
        </label>
        <label className="text-sm font-medium">
          CRM type
          <select name="integrationKind" defaultValue="hubspot" className="mt-1 block w-full rounded-lg border bg-transparent px-3 py-2">
            <option value="hubspot">HubSpot</option>
            <option value="pipedrive">Pipedrive</option>
            <option value="custom">Custom webhook</option>
          </select>
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Public HTTPS endpoint
          <input name="endpointUrl" type="url" required placeholder="https://hooks.example.com/lume" className="mt-1 block w-full rounded-lg border bg-transparent px-3 py-2" />
        </label>
        <label className="text-sm font-medium">
          Signing secret
          <input name="signingSecret" type="password" required minLength={16} maxLength={500} autoComplete="new-password" className="mt-1 block w-full rounded-lg border bg-transparent px-3 py-2" />
        </label>
        <label className="text-sm font-medium">
          Retry delays (seconds)
          <input name="retryDelays" required defaultValue="60,300,1800,3600,21600" className="mt-1 block w-full rounded-lg border bg-transparent px-3 py-2" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy === "create" ? "Creating…" : "Create integration"}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Configured endpoints</h2>
        {webhooks.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No CRM webhooks configured.</p> : null}
        {webhooks.map((webhook) => {
          const recent = deliveries.filter((delivery) => delivery.webhookId === webhook.id).slice(0, 5);
          const deadLetters = deliveries.filter((delivery) =>
            delivery.webhookId === webhook.id && delivery.status === "dead_letter").length;
          return (
            <article key={webhook.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{webhook.name}</h3>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{webhook.endpointUrl}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {webhook.integrationKind} · {webhook.enabled ? "Enabled" : "Paused"} · {deadLetters} dead-lettered
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy === webhook.id} onClick={() => void toggle(webhook)} className="rounded border px-3 py-1.5 text-xs disabled:opacity-50">
                    {webhook.enabled ? "Pause" : "Enable"}
                  </button>
                  <ConfirmActionDialog title={`Remove ${webhook.name}?`} description="Queued and historical deliveries for this endpoint will also be deleted." actionLabel="Remove integration" onConfirm={() => void remove(webhook)}>
                    <button type="button" disabled={busy === webhook.id} className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300">Remove</button>
                  </ConfirmActionDialog>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Retry schedule: {webhook.retryDelaysSeconds.join("s, ")}s</p>
              {recent.length > 0 ? (
                <ul className="mt-3 divide-y rounded-lg border text-xs">
                  {recent.map((delivery) => (
                    <li key={delivery.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span className={delivery.status === "dead_letter" ? "font-medium text-red-600 dark:text-red-300" : "capitalize"}>{delivery.status.replace("_", " ")}</span>
                      <span className="text-muted-foreground">Attempts {delivery.attemptCount}{delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ""}</span>
                      {delivery.lastError ? <span className="w-full text-muted-foreground">{delivery.lastError}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
