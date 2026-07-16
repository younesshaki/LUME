import { pathToFileURL } from "node:url";

const PRODUCTION_PROJECT_REF = "atsgdjwjtmqvtotbrowu";

const SUPABASE_URL_KEYS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_URL",
];

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

export function validateDeploymentEnvironment(environment, explicitExpected) {
  const expected = expectedEnvironment(environment, explicitExpected);
  if (!expected) return [];
  if (expected !== "production" && expected !== "staging") {
    return [`Unsupported deployment environment: ${expected}`];
  }

  const errors = [];
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const explicitExpected = explicitExpectedFromArgs(process.argv.slice(2));
  const expected = expectedEnvironment(process.env, explicitExpected);
  const errors = validateDeploymentEnvironment(process.env, explicitExpected);
  if (errors.length > 0) {
    console.error(`[deployment-env] ${errors.join("; ")}`);
    process.exitCode = 1;
  } else if (expected) {
    console.log(`[deployment-env] ${expected} environment is isolated and consistent`);
  } else {
    console.log("[deployment-env] no deployment environment detected; check skipped");
  }
}
