"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TenantDomain } from "@lume/types";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import {
  domainDnsInstructions,
  domainDnsRecommendations,
  normalizeDomainInput,
  validateDomainInput,
} from "@/lib/domains";
import { addTenantDomain, removeTenantDomain } from "./actions";

type DomainsClientProps = {
  tenantSlug: string;
  tenantName: string;
  customDomainLimit: number;
  initialDomains: TenantDomain[];
};

type StatusState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function DomainsClient({
  tenantSlug,
  tenantName,
  customDomainLimit,
  initialDomains,
}: DomainsClientProps) {
  const router = useRouter();
  const [domains, setDomains] = useState(initialDomains);
  const [domainInput, setDomainInput] = useState("");
  const [status, setStatus] = useState<StatusState>({ type: "idle", message: "" });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const atDomainLimit = customDomainLimit >= 0 && domains.length >= customDomainLimit;

  async function addDomain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (atDomainLimit) {
      setStatus({ type: "error", message: domainLimitMessage(customDomainLimit) });
      return;
    }
    const validationError = validateDomainInput(domainInput);
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    const domain = normalizeDomainInput(domainInput);
    setStatus({ type: "saving", message: "Adding domain..." });
    try {
      const result = await addTenantDomain(tenantSlug, domain);
      if (result.error || !result.domain) throw new Error(result.error ?? "Unable to add domain.");
      const addedDomain = result.domain;
      setDomains((current) => [addedDomain, ...current]);
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
    setRemovingId(domain.id);
    try {
      const result = await removeTenantDomain(tenantSlug, domain.id);
      if (result.error) throw new Error(result.error);
      setDomains((current) => current.filter((item) => item.id !== domain.id));
      toast.success(`Removed ${domain.domain}`);
      router.refresh();
    } catch (error) {
      toast.error("Unable to remove domain", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRemovingId(null);
    }
  }

  async function verifyDomain(domain: TenantDomain) {
    setVerifyingId(domain.id);
    setStatus({ type: "saving", message: `Checking ${domain.domain}…` });
    try {
      const response = await fetch(`/api/domains/${encodeURIComponent(domain.id)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json() as { domain?: TenantDomain; error?: string };
      if (!response.ok || !payload.domain) {
        throw new Error(payload.error ?? "Unable to verify domain.");
      }
      const checkedDomain = payload.domain;
      setDomains((current) => current.map((item) =>
        item.id === checkedDomain.id ? checkedDomain : item));
      setStatus({
        type: checkedDomain.verified ? "success" : "idle",
        message: checkedDomain.verified
          ? `${checkedDomain.domain} is verified.`
          : checkedDomain.verificationStatus === "failed"
            ? "Verification still failed. Review the DNS values below and try again."
            : "DNS is not verified yet. Propagation can take several minutes.",
      });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to verify domain.",
      });
    } finally {
      setVerifyingId(null);
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Custom domain allowance</span>
          <span className="font-medium text-foreground">
            {domains.length} / {customDomainLimit < 0 ? "Unlimited" : customDomainLimit}
          </span>
        </div>
        {atDomainLimit ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {domainLimitMessage(customDomainLimit)} Remove a domain or change plans to add another.
          </p>
        ) : null}
        <label className="block text-sm font-medium">
          Add domain
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              name="domain"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={atDomainLimit || status.type === "saving"}
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
              disabled={atDomainLimit || status.type === "saving"}
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
                        : domain.verificationStatus === "failed"
                          ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                    }`}
                  >
                    {domain.verified
                      ? "Verified"
                      : domain.verificationStatus === "failed"
                        ? "Verification failed"
                        : "Pending verification"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Added {formatDate(domain.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!domain.verified ? (
                  <button
                    type="button"
                    disabled={verifyingId === domain.id}
                    onClick={() => void verifyDomain(domain)}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    {verifyingId === domain.id ? "Checking…" : "Check verification"}
                  </button>
                ) : null}
                <ConfirmActionDialog
                  title={`Remove ${domain.domain}?`}
                  description="The domain stops routing to this site and its verification record becomes invalid. You can add it again later, but it will need to be re-verified."
                  actionLabel="Remove domain"
                  onConfirm={() => void removeDomain(domain)}
                >
                  <button
                    type="button"
                    disabled={removingId === domain.id}
                    className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    {removingId === domain.id ? "Removing..." : "Remove"}
                  </button>
                </ConfirmActionDialog>
              </div>
            </div>

            {!domain.verified && (
              <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
                <p className="font-medium">DNS verification</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add each record below at your DNS provider, then check verification again.
                </p>
                {domainDnsInstructions(domain).map((instruction, index) => (
                  <dl key={`${instruction.type}-${instruction.host}-${index}`} className="mt-3 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
                    <dd className="font-mono text-xs">{instruction.type}</dd>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Host</dt>
                    <dd className="break-all font-mono text-xs">{instruction.host}</dd>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Value</dt>
                    <dd className="break-all font-mono text-xs">{instruction.value}</dd>
                  </dl>
                ))}
                {domain.verificationStatus === "failed" && domainDnsRecommendations(domain).length > 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Vercel routing targets: {domainDnsRecommendations(domain).join(" or ")}
                  </p>
                ) : null}
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

function domainLimitMessage(limit: number): string {
  if (limit <= 0) return "Your current plan does not include a custom domain.";
  return `Your current plan includes ${limit} custom domain${limit === 1 ? "" : "s"}.`;
}
