"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantDomain } from "@lume/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  normalizeDomainInput,
  rowToTenantDomain,
  validateDomainInput,
  verificationHost,
} from "@/lib/domains";

type DomainsClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialDomains: TenantDomain[];
};

type StatusState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function DomainsClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialDomains,
}: DomainsClientProps) {
  const router = useRouter();
  const [domains, setDomains] = useState(initialDomains);
  const [domainInput, setDomainInput] = useState("");
  const [status, setStatus] = useState<StatusState>({ type: "idle", message: "" });
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function addDomain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateDomainInput(domainInput);
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    const domain = normalizeDomainInput(domainInput);
    setStatus({ type: "saving", message: "Adding domain..." });
    try {
      const { data, error } = await createSupabaseBrowserClient()
        .from("tenant_domains")
        .insert({ tenant_id: tenantId, domain })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      setDomains((current) => [rowToTenantDomain(data), ...current]);
      setDomainInput("");
      setStatus({ type: "success", message: "Domain added. Add the TXT record below to verify ownership." });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to add domain.",
      });
    }
  }

  async function removeDomain(domain: TenantDomain) {
    const confirmed = window.confirm(`Remove ${domain.domain}?`);
    if (!confirmed) return;

    setRemovingId(domain.id);
    setStatus({ type: "saving", message: "Removing domain..." });
    try {
      const { error } = await createSupabaseBrowserClient()
        .from("tenant_domains")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", domain.id);
      if (error) throw new Error(error.message);
      setDomains((current) => current.filter((item) => item.id !== domain.id));
      setStatus({ type: "success", message: "Domain removed." });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to remove domain.",
      });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Domains</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage custom public domains for {tenantName} <code>/{tenantSlug}</code>.
        </p>
      </header>

      {status.message && <StatusBanner type={status.type} message={status.message} />}

      <form
        onSubmit={addDomain}
        className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <label className="block text-sm font-medium">
          Add domain
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={domainInput}
              onChange={(event) => {
                setDomainInput(event.target.value);
                setStatus({ type: "idle", message: "" });
              }}
              placeholder="example.com"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
            <button
              type="submit"
              disabled={status.type === "saving"}
              className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              Add Domain
            </button>
          </div>
        </label>
      </form>

      <div className="space-y-4">
        {domains.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-muted-foreground dark:border-neutral-700">
            No custom domains have been added yet.
          </div>
        )}
        {domains.map((domain) => (
          <article
            key={domain.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{domain.domain}</h2>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      domain.verified
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                    }`}
                  >
                    {domain.verified ? "Verified" : "Pending verification"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Added {formatDate(domain.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void removeDomain(domain)}
                disabled={removingId === domain.id}
                className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                {removingId === domain.id ? "Removing..." : "Remove"}
              </button>
            </div>

            {!domain.verified && (
              <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
                <p className="font-medium">DNS verification</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add this TXT record at your DNS provider, then ask an admin to run verification.
                </p>
                <dl className="mt-3 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
                  <dd className="font-mono text-xs">TXT</dd>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Host</dt>
                  <dd className="break-all font-mono text-xs">{verificationHost(domain.domain)}</dd>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Value</dt>
                  <dd className="break-all font-mono text-xs">{domain.verificationToken}</dd>
                </dl>
              </div>
            )}
          </article>
        ))}
      </div>
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
