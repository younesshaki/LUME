export type Environment = Record<string, string | undefined>;
export const PRODUCTION_PROJECT = "atsgdjwjtmqvtotbrowu";
const previewKeys = [
  "WEB_PREVIEW_SUPABASE_URL",
  "WEB_PREVIEW_SUPABASE_ANON_KEY",
  "WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY",
  "WEB_PREVIEW_PROJECT_REF",
  "WEB_PREVIEW_HOSTS",
  "WEB_PREVIEW_ROOT_DOMAIN",
  "WEB_PREVIEW_DEFAULT_TENANT",
  "WEB_PREVIEW_CUSTOM_HOSTS",
  "WEB_PREVIEW_TEST_MODE",
];
const platformKeys = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_USE_ENV_PROXY",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_REF",
  "CI",
  "PORT",
  "NEXT_TELEMETRY_DISABLED",
];

/** Process allowlist: never pass this machine's generic production bindings. */
export function previewEnvironment(input: Environment): Environment {
  const output: Environment = {};
  for (const name of [...platformKeys, ...previewKeys])
    if (input[name] !== undefined) output[name] = input[name];
  output.WEB_PREVIEW_SANITIZED = "1";
  output.NEXT_TELEMETRY_DISABLED = "1";
  if (output.HTTPS_PROXY || output.https_proxy) output.NODE_USE_ENV_PROXY = "1";
  assertPreviewEnvironment(output);
  return output;
}

export function assertPreviewEnvironment(env: Environment) {
  // Vercel's serverless runtime does not execute npm start. Validate its own
  // project-scoped bindings directly, rather than requiring a build-only marker.
  if (env.VERCEL_ENV === "production")
    throw new Error("Phase 1 web cannot run as a production deployment");
  if (env.WEB_PREVIEW_TEST_MODE === "1" && env.VERCEL)
    throw new Error("Local test mode is forbidden on Vercel");
  const forbidden = Object.keys(env).filter(
    (name) =>
      /^(SUPABASE_|NEXT_PUBLIC_|VITE_|DEEPSEEK_|R2_|GH_TOKEN$|GITHUB_TOKEN$|VERCEL_TOKEN$|LUME_CHAT_|ANTHROPIC_|MOONSHOT_|AI_GATEWAY_|RESEND_|CRON_SECRET$|TURNSTILE_SECRET_KEY$|WEBHOOK_|INVENTORY_INTEGRATION_|UPSTASH_|VISITOR_SESSION_SECRET$)/.test(
        name,
      ) && env[name],
  );
  if (forbidden.length)
    throw new Error("Unisolated application bindings found in web process");
  if (
    !env.WEB_PREVIEW_SUPABASE_URL &&
    (env.WEB_PREVIEW_SUPABASE_ANON_KEY ||
      env.WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY)
  )
    throw new Error("Preview credentials require an explicit staging origin");
  if (env.WEB_PREVIEW_SUPABASE_URL) validateDatabase(env);
}

function validateDatabase(env: Environment) {
  let url: URL;
  try {
    url = new URL(env.WEB_PREVIEW_SUPABASE_URL!);
  } catch {
    throw new Error("Invalid preview database origin");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Invalid preview database origin");
  const localTest =
    env.WEB_PREVIEW_TEST_MODE === "1" &&
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1";
  const ref = env.WEB_PREVIEW_PROJECT_REF;
  if (
    !localTest &&
    (!ref ||
      !/^[a-z0-9]+$/.test(ref) ||
      ref === PRODUCTION_PROJECT ||
      url.origin !== `https://${ref}.supabase.co`)
  ) {
    throw new Error(
      "Preview requires an explicitly selected non-production Supabase project",
    );
  }
  for (const name of [
    "WEB_PREVIEW_SUPABASE_ANON_KEY",
    "WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    const value = env[name];
    if (!value || localTest) continue;
    if (value.split(".").length === 3) {
      let payload: { ref?: string; role?: string };
      try {
        payload = JSON.parse(
          Buffer.from(value.split(".")[1], "base64url").toString(),
        );
      } catch {
        throw new Error("Invalid preview credential format");
      }
      if (payload.ref !== ref || payload.ref === PRODUCTION_PROJECT)
        throw new Error("Preview credential project mismatch");
      const role = name.endsWith("ANON_KEY") ? "anon" : "service_role";
      if (payload.role !== role)
        throw new Error("Preview credential role mismatch");
    } else if (
      name.endsWith("ANON_KEY")
        ? !value.startsWith("sb_publishable_")
        : !value.startsWith("sb_secret_")
    ) {
      throw new Error("Unsupported preview credential format");
    }
  }
}

export function databaseConfiguration(env: Environment) {
  assertPreviewEnvironment(env);
  if (!env.WEB_PREVIEW_SUPABASE_URL || !env.WEB_PREVIEW_SUPABASE_ANON_KEY) {
    throw new Error(
      "Dedicated staging URL and anon binding are required for the preview",
    );
  }
  return {
    url: env.WEB_PREVIEW_SUPABASE_URL,
    anon: env.WEB_PREVIEW_SUPABASE_ANON_KEY,
    domainKey: env.WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY,
  };
}
