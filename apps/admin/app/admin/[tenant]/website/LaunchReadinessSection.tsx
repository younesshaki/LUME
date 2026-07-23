"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Copy,
  ExternalLink,
  XCircle,
} from "lucide-react";
import {
  LAUNCH_CHECK_CATEGORY_ORDER,
  launchCheckCategoryTitle,
  launchReadinessSummary,
  type LaunchCheck,
  type LaunchCheckCategory,
  type LaunchCheckStatus,
  type LaunchProfile,
  type LaunchReadinessReport,
} from "@/lib/launchReadiness";

type LaunchReadinessSectionProps = {
  pilotReport: LaunchReadinessReport | null;
  publicReport: LaunchReadinessReport | null;
  tenantSlug: string;
  publicSiteBaseUrl: string;
  loadError?: boolean;
};

const PROFILES: Array<{ id: LaunchProfile; label: string }> = [
  { id: "pilot", label: "Pilot" },
  { id: "public", label: "Public" },
];

const STATUS_ICON: Record<LaunchCheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warning: AlertTriangle,
  blocker: XCircle,
};

const STATUS_ICON_CLASS: Record<LaunchCheckStatus, string> = {
  pass: "text-emerald-500",
  warning: "text-amber-500",
  blocker: "text-red-500",
};

/**
 * Dealer Launch Certification readout: renders the pre-computed pilot and
 * public LaunchReadinessReports and lets the operator flip between them
 * client-side. Read-only by design — the only actions are open preview,
 * copy the report, and scroll to the first blocker.
 */
export default function LaunchReadinessSection({
  pilotReport,
  publicReport,
  tenantSlug,
  publicSiteBaseUrl,
  loadError = false,
}: LaunchReadinessSectionProps) {
  const [profile, setProfile] = useState<LaunchProfile>("pilot");
  const report = profile === "pilot" ? pilotReport : publicReport;

  const previewHref = useMemo(() => {
    const base = publicSiteBaseUrl.replace(/\/+$/, "");
    return `${base}?tenant=${encodeURIComponent(tenantSlug)}`;
  }, [publicSiteBaseUrl, tenantSlug]);

  const grouped = useMemo(() => {
    const groups = new Map<LaunchCheckCategory, LaunchCheck[]>();
    for (const category of LAUNCH_CHECK_CATEGORY_ORDER) {
      groups.set(category, []);
    }
    for (const check of report?.checks ?? []) {
      groups.get(check.category)?.push(check);
    }
    return LAUNCH_CHECK_CATEGORY_ORDER.map((category) => ({
      category,
      checks: groups.get(category) ?? [],
    })).filter((group) => group.checks.length > 0);
  }, [report]);

  const firstBlocker = report?.checks.find((check) => check.status === "blocker");
  const totalChecks = report?.checks.length ?? 0;
  const passedCount = report?.passedCount ?? 0;
  const passedPercent = totalChecks === 0 ? 0 : Math.round((passedCount / totalChecks) * 100);

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success("Launch report copied to clipboard.");
    } catch {
      toast.error("Could not copy the report — clipboard access was blocked.");
    }
  };

  const scrollToFirstBlocker = () => {
    if (!firstBlocker) return;
    document
      .getElementById(`launch-check-${firstBlocker.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const badgeClass = !report?.ready
    ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
    : report.warningCount > 0
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400";

  return (
    <section
      aria-labelledby="launch-readiness-heading"
      className="rounded-xl border border-neutral-200 dark:border-neutral-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <h2 id="launch-readiness-heading" className="text-sm font-semibold">
            Launch readiness
          </h2>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Pilot runs on the preview URL with lenient checks; public launch requires a verified
            domain, complete branding, and lead notifications.
          </p>
        </div>
        <div
          role="group"
          aria-label="Launch profile"
          className="flex items-center gap-0.5 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800"
        >
          {PROFILES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={profile === id}
              onClick={() => setProfile(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                profile === id
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError || !report ? (
        <p role="alert" className="p-4 text-sm text-red-600 dark:text-red-400">
          The launch readiness report could not be loaded. Refresh the page to try again; the rest
          of Website Studio is unaffected.
        </p>
      ) : (
        <>
          <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
            <div aria-live="polite" className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
              >
                {report.ready ? "Ready" : "Not ready"}
              </span>
              <p className="text-sm text-muted-foreground">{launchReadinessSummary(report)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950/60 dark:text-red-400">
                <XCircle className="size-3" aria-hidden="true" />
                {report.blockerCount} blocker{report.blockerCount === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                <AlertTriangle className="size-3" aria-hidden="true" />
                {report.warningCount} warning{report.warningCount === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                {report.passedCount} passed
              </span>
            </div>

            <div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalChecks}
                aria-valuenow={report.passedCount}
                aria-label={`${report.passedCount} of ${totalChecks} checks passing`}
              >
                <div
                  className={`h-full rounded-full ${
                    report.blockerCount > 0 ? "bg-neutral-400 dark:bg-neutral-600" : "bg-emerald-500"
                  }`}
                  style={{ width: `${passedPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {report.blockerCount > 0 ? (
                  <>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {report.blockerCount} blocker{report.blockerCount === 1 ? "" : "s"} to fix
                    </span>{" "}
                    — {report.passedCount} of {totalChecks} checks passing
                  </>
                ) : (
                  <>
                    {report.passedCount} of {totalChecks} checks passing ({passedPercent}%)
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open public preview
              </a>
              <button
                type="button"
                onClick={copyReport}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copy report JSON
              </button>
              {firstBlocker && (
                <button
                  type="button"
                  onClick={scrollToFirstBlocker}
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                  Go to next blocker
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {grouped.map((group) => (
              <div key={group.category} className="p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {launchCheckCategoryTitle(group.category)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {group.checks.map((check) => {
                    const Icon = STATUS_ICON[check.status];
                    return (
                      <li
                        key={check.id}
                        id={`launch-check-${check.id}`}
                        className="flex items-start gap-3 rounded-lg bg-muted/40 p-3 scroll-mt-24"
                      >
                        <Icon
                          className={`mt-0.5 size-4 shrink-0 ${STATUS_ICON_CLASS[check.status]}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="text-sm font-medium">{check.title}</p>
                            {check.remediationHref && (
                              <Link
                                href={check.remediationHref}
                                className="shrink-0 text-xs font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-muted-foreground dark:hover:text-white"
                              >
                                Fix in {remediationLabel(check.remediationHref)}
                              </Link>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {check.explanation}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground/80">
                            {formatEvidence(check.evidence)}
                          </p>
                        </div>
                        <span className="sr-only">{check.status}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** "…/admin/acme/vehicles" → "Vehicles". */
function remediationLabel(href: string): string {
  const segment = href.split("/").filter(Boolean).pop() ?? href;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function formatEvidence(evidence: LaunchCheck["evidence"]): string {
  const parts = Object.entries(evidence).map(([key, value]) =>
    value === null ? `${key}: none` : `${key}: ${String(value)}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "No additional evidence.";
}
