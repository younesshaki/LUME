import { pathToFileURL } from "node:url";

const PRODUCTION_PROJECT_REF = "atsgdjwjtmqvtotbrowu";

const SUPABASE_URL_KEYS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_URL",
];

// Secrets that gate whole admin subsystems rather than a single feature. Each
// of these is read at the top of a route handler, and a missing value makes
// that handler return 503 forever — silently, because nothing in the build or
// the request path complains. On 2026-07-28 all three were absent from the
// production admin project: every one of the eight /api/cron/* workers had
// been answering 503 since launch, so managed feed sync, CRM webhook delivery,
// storage metering, lead digests, sold-vehicle archival and domain
// verification had never once run in production. Nothing detected it because
// the only build-time check covered Supabase isolation.
//
// Failing the build is the right severity: shipping an admin deployment whose
// background workers cannot run is worse than not shipping it.
const ADMIN_REQUIRED_PRODUCTION_KEYS = [
  ["CRON_SECRET", "every /api/cron/* worker returns 503 without it"],
  ["WEBHOOK_ENCRYPTION_KEY", "CRM webhook credentials cannot be decrypted"],
  ["INVENTORY_INTEGRATION_ENCRYPTION_KEY", "managed feed credentials cannot be decrypted"],
  ["SUPABASE_SERVICE_ROLE_KEY", "workers cannot bypass RLS to act across tenants"],
];

// Feature-gated rather than subsystem-gated: the product degrades gracefully
// without these, so they warn instead of failing the build.
const ADMIN_OPTIONAL_PRODUCTION_KEYS = [
  ["ANTHROPIC_API_KEY", "AI vehicle image descriptions stay disabled"],
];

// Shared conversation memory. Both values must be present together: the store
// only activates when it has a URL *and* a token, so half a pair is the same
// as none, and is more likely to be a half-finished provisioning than a
// deliberate choice.
//
// A warning rather than an error, deliberately. Without these the concierge
// keeps working on a per-instance in-memory store — bounded continuity, no
// cross-instance idempotency — which is a legitimate shape for a small
// deployment and, as of 2026-09-16, the shape every LUME environment actually
// runs. Failing the build over it would break every deploy for a degradation
// the product is designed to survive. Reporting nothing, on the other hand, is
// how the cron-secret outage went unnoticed for months.
const SHARED_MEMORY_KEYS = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];

/**
 * Shared conversation-memory readiness, as { warnings, mode }.
 *
 * Reports presence only. Values are never read into the message, so this is
 * safe to print in build logs.
 */
export function validateSharedConversationMemory(environment, app, expected) {
  if (app !== "admin" || (expected !== "production" && expected !== "staging")) {
    return { warnings: [], mode: "not-checked" };
  }
  const present = SHARED_MEMORY_KEYS.filter((key) => environment[key]?.trim());
  if (present.length === SHARED_MEMORY_KEYS.length) {
    return { warnings: [], mode: "shared" };
  }
  const missing = SHARED_MEMORY_KEYS.filter((key) => !environment[key]?.trim());
  if (present.length > 0) {
    return {
      warnings: [
        `${missing.join(" and ")} missing while ${present.join(" and ")} is set — shared conversation memory stays OFF until both are present; this looks like half-finished provisioning`,
      ],
      mode: "local",
    };
  }
  return {
    warnings: [
      `${missing.join(" and ")} not set — conversation memory is per-instance in ${expected}: continuity is not guaranteed across instances, and the duplicate-turn lease and compare-and-set writes protect only within one instance`,
    ],
    mode: "local",
  };
}

export function expectedEnvironment(environment, explicitExpected) {
  if (explicitExpected) return explicitExpected;
  if (environment.VERCEL_GIT_COMMIT_REF === "staging") return "staging";
  if (environment.VERCEL_ENV === "production") return "production";
  return null;
}

export function supabaseProjectRef(rawUrl) {
  if (!rawUrl) return null;
  try {
    const hostname = new URL(rawUrl).hostname;
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) return null;
    return hostname.slice(0, -suffix.length) || null;
  } catch {
    return null;
  }
}

/**
 * Missing admin worker secrets, as { errors, warnings }.
 *
 * Only enforced for `app === "admin"` on production: the public Vite build
 * shares this script and legitimately has none of these, and preview/staging
 * deployments are allowed to run without live worker credentials.
 */
export function validateAdminWorkerSecrets(environment, app, expected) {
  if (app !== "admin" || expected !== "production") return { errors: [], warnings: [] };
  const missing = (pairs) => pairs.flatMap(([key, consequence]) =>
    environment[key]?.trim() ? [] : [`${key} is required in production — ${consequence}`]);
  return {
    errors: missing(ADMIN_REQUIRED_PRODUCTION_KEYS),
    warnings: missing(ADMIN_OPTIONAL_PRODUCTION_KEYS).map((line) => line.replace(" is required in production —", " is not set —")),
  };
}

export function validateDeploymentEnvironment(environment, explicitExpected, app) {
  const expected = expectedEnvironment(environment, explicitExpected);
  if (!expected) return [];
  if (expected !== "production" && expected !== "staging") {
    return [`Unsupported deployment environment: ${expected}`];
  }

  const errors = [...validateAdminWorkerSecrets(environment, app, expected).errors];
  if (environment.LUME_ENVIRONMENT !== expected) {
    errors.push(`LUME_ENVIRONMENT must be ${expected}`);
  }

  const configuredUrls = SUPABASE_URL_KEYS.flatMap((key) => {
    const value = environment[key]?.trim();
    return value ? [[key, value]] : [];
  });
  if (!environment.SUPABASE_URL?.trim()) {
    errors.push("SUPABASE_URL is required");
  }

  const refs = configuredUrls.map(([key, value]) => [key, supabaseProjectRef(value)]);
  for (const [key, ref] of refs) {
    if (!ref) errors.push(`${key} must be a valid Supabase project URL`);
  }

  const validRefs = refs.flatMap(([, ref]) => (ref ? [ref] : []));
  if (new Set(validRefs).size > 1) {
    errors.push("All configured Supabase URLs must target the same project");
  }

  const activeRef = validRefs[0];
  if (expected === "production" && activeRef && activeRef !== PRODUCTION_PROJECT_REF) {
    errors.push("Production must target the configured production Supabase project");
  }
  if (expected === "staging" && activeRef === PRODUCTION_PROJECT_REF) {
    errors.push("Staging must not target the production Supabase project");
  }

  return errors;
}

function explicitExpectedFromArgs(args) {
  const argument = args.find((value) => value.startsWith("--expected="));
  return argument?.slice("--expected=".length);
}

function appFromArgs(args) {
  const argument = args.find((value) => value.startsWith("--app="));
  return argument?.slice("--app=".length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const explicitExpected = explicitExpectedFromArgs(args);
  const app = appFromArgs(args);
  const expected = expectedEnvironment(process.env, explicitExpected);
  for (const warning of validateAdminWorkerSecrets(process.env, app, expected).warnings) {
    console.warn(`[deployment-env] warning: ${warning}`);
  }
  const sharedMemory = validateSharedConversationMemory(process.env, app, expected);
  for (const warning of sharedMemory.warnings) {
    console.warn(`[deployment-env] warning: ${warning}`);
  }
  if (sharedMemory.mode !== "not-checked") {
    console.log(`[deployment-env] conversation memory mode: ${sharedMemory.mode}`);
  }
  const errors = validateDeploymentEnvironment(process.env, explicitExpected, app);
  if (errors.length > 0) {
    console.error(`[deployment-env] ${errors.join("; ")}`);
    process.exitCode = 1;
  } else if (expected) {
    console.log(`[deployment-env] ${expected} environment is isolated and consistent`);
  } else {
    console.log("[deployment-env] no deployment environment detected; check skipped");
  }
}
