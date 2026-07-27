/**
 * Pure helpers for the tenant launch audit CLI (scripts/tenant-launch-audit.ts):
 * argument parsing and output serialization. Kept free of I/O so vitest can
 * cover them without a database. Category titles come from the evaluator —
 * the single source of truth.
 */
import {
  launchCheckCategoryTitle,
  launchReadinessSummary,
  type LaunchReadinessReport,
} from "../apps/admin/lib/launchReadiness";

export type LaunchAuditArgs = {
  tenant: string;
  profile: "pilot" | "public";
  format: "human" | "json";
};

export type ParseLaunchAuditArgsResult =
  | { ok: true; args: LaunchAuditArgs }
  | { ok: false; error: string };

const USAGE =
  "Usage: npm run audit:tenant-launch -- --tenant <slug> [--profile pilot|public] [--format human|json]";

export function parseLaunchAuditArgs(argv: readonly string[]): ParseLaunchAuditArgsResult {
  let tenant: string | null = null;
  let profile: LaunchAuditArgs["profile"] = "pilot";
  let format: LaunchAuditArgs["format"] = "human";

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--tenant") {
      if (!value || value.startsWith("--")) return { ok: false, error: `--tenant needs a slug.\n${USAGE}` };
      tenant = value;
      index += 1;
    } else if (flag === "--profile") {
      if (value !== "pilot" && value !== "public") {
        return { ok: false, error: `--profile must be pilot or public.\n${USAGE}` };
      }
      profile = value;
      index += 1;
    } else if (flag === "--format") {
      if (value !== "human" && value !== "json") {
        return { ok: false, error: `--format must be human or json.\n${USAGE}` };
      }
      format = value;
      index += 1;
    } else {
      return { ok: false, error: `Unknown argument "${flag}".\n${USAGE}` };
    }
  }

  if (!tenant || !/^[a-z0-9][a-z0-9-]*$/.test(tenant)) {
    return { ok: false, error: `A valid tenant slug is required.\n${USAGE}` };
  }
  return { ok: true, args: { tenant, profile, format } };
}

/** Stable machine-readable serialization (key order follows the evaluator). */
export function formatLaunchAuditJson(report: LaunchReadinessReport): string {
  return JSON.stringify(report, null, 2);
}

const STATUS_GLYPH = { pass: "✓", warning: "!", blocker: "✗" } as const;

export function formatLaunchAuditHuman(report: LaunchReadinessReport): string {
  const lines: string[] = [
    `LUME launch readiness — tenant ${report.tenantSlug} (${report.profile})`,
    `${launchReadinessSummary(report)} — ${report.blockerCount} blocker(s), ${report.warningCount} warning(s), ${report.passedCount} passed`,
    "",
  ];
  let currentCategory: string | null = null;
  for (const check of report.checks) {
    if (check.category !== currentCategory) {
      currentCategory = check.category;
      lines.push(launchCheckCategoryTitle(check.category));
    }
    lines.push(`  ${STATUS_GLYPH[check.status]} ${check.title} — ${check.explanation}`);
    const evidence = Object.entries(check.evidence)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" ");
    if (evidence) lines.push(`    evidence: ${evidence}`);
    if (check.remediationHref) lines.push(`    → fix: ${check.remediationHref}`);
  }
  return lines.join("\n");
}
