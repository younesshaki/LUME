/**
 * Single-entrypoint tenant provisioning (onboarding-backlog items 2/3/4/7).
 *
 *   npx tsx scripts/create-tenant.ts --slug acme --name "Acme Motors" \
 *     --owner-email owner@acme.com [--with-sample-data] [--force-pages]
 *
 * What it does, in order (idempotent throughout):
 *   1. Upserts the tenant (status=active).
 *   2. Resolves the owner (must already be a Supabase auth user) and upserts
 *      the owner membership.
 *   3. Inserts the default bot persona if the tenant has no active one
 *      (DB-side defaults supply name/tone/prompt/capabilities).
 *   4. Seeds the default pages via scripts/seed-default-pages.ts.
 *   5. --with-sample-data only: loads LUME's demo vehicles CSV + RAG chunks
 *      via scripts/seed-default-tenant.ts. Default is a BLANK tenant.
 *
 * Env: needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (and, for sample data,
 * R2_PUBLIC_BASE_URL). If not already exported, they are read from
 * apps/admin/.env.local, with R2_PUBLIC_BASE_URL falling back to the root
 * .env.local's VITE_R2_PUBLIC_BASE_URL — so no manual env assembly.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { targetsForAvailablePages } from "@lume/blocks";
import { DEFAULT_BOT_PERSONA_SYSTEM_PROMPT, defaultBotPersonaName } from "@lume/types";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));

type Args = {
  slug: string;
  name: string;
  ownerEmail?: string;
  ownerUserId?: string;
  withSampleData: boolean;
  forcePages: boolean;
};

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const slug = get("--slug")?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    fail("--slug is required (lowercase letters, digits, hyphens).");
  }
  const ownerEmail = get("--owner-email")?.trim().toLowerCase();
  const ownerUserId = get("--owner-user-id")?.trim();
  if (!ownerEmail && !ownerUserId) {
    fail("Provide --owner-email or --owner-user-id.");
  }
  return {
    slug,
    name: get("--name")?.trim() || slug,
    ownerEmail,
    ownerUserId,
    withSampleData: argv.includes("--with-sample-data"),
    forcePages: argv.includes("--force-pages"),
  };
}

/** Minimal KEY=VALUE .env loader — only fills vars not already set. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

function assembleEnv(repoRoot: string): void {
  loadEnvFile(resolve(repoRoot, "apps/admin/.env.local"));
  loadEnvFile(resolve(repoRoot, ".env.local"));
  if (!process.env.R2_PUBLIC_BASE_URL && process.env.VITE_R2_PUBLIC_BASE_URL) {
    process.env.R2_PUBLIC_BASE_URL = process.env.VITE_R2_PUBLIC_BASE_URL;
  }
}

function runSeedScript(repoRoot: string, script: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync("npx", ["tsx", resolve(repoRoot, "scripts", script)], {
    stdio: "inherit",
    env,
    cwd: repoRoot,
  });
  if (result.status !== 0) fail(`${script} failed (exit ${result.status}).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(SCRIPT_DIR, "..");
  assembleEnv(repoRoot);

  const url = process.env.SUPABASE_URL ?? fail("SUPABASE_URL missing (apps/admin/.env.local).");
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    fail("SUPABASE_SERVICE_ROLE_KEY missing (apps/admin/.env.local).");
  if (args.withSampleData && !process.env.R2_PUBLIC_BASE_URL) {
    fail("R2_PUBLIC_BASE_URL missing (needed for --with-sample-data).");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  console.log(`→ Upserting tenant slug="${args.slug}" name="${args.name}"`);
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .upsert({ slug: args.slug, name: args.name, status: "active" }, { onConflict: "slug" })
    .select("id, slug, name")
    .single();
  if (tenantErr || !tenant) fail(tenantErr?.message ?? "tenant upsert failed");
  console.log(`  ✓ tenant id=${tenant.id}`);

  // ── 2. Owner membership ────────────────────────────────────────────────────
  let userId = args.ownerUserId ?? null;
  if (!userId && args.ownerEmail) {
    console.log(`→ Looking up auth user "${args.ownerEmail}"`);
    let page = 1;
    while (!userId) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) fail(error.message);
      userId =
        data.users.find((u) => u.email?.toLowerCase() === args.ownerEmail)?.id ?? null;
      if (!data.users.length || data.users.length < 200) break;
      page++;
    }
    if (!userId) {
      fail(
        `No auth user with email ${args.ownerEmail}. Create the user first (Supabase Studio → Auth), then re-run.`
      );
    }
  }
  const { error: memberErr } = await supabase
    .from("tenant_members")
    .upsert({ tenant_id: tenant.id, user_id: userId!, role: "owner" });
  if (memberErr) fail(memberErr.message);
  console.log(`  ✓ owner membership (user ${userId})`);

  // ── 3. Default bot persona (skip if an active one exists) ─────────────────
  const { data: existingPersona, error: personaReadErr } = await supabase
    .from("bot_personas")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .maybeSingle();
  if (personaReadErr) fail(personaReadErr.message);
  if (existingPersona) {
    console.log("  ✓ active bot persona already present");
  } else {
    // Seed name and prompt explicitly. Inserting only tenant_id falls back to
    // the column defaults ('LUME Concierge' and ''), which ships the vendor
    // brand on the tenant's own storefront and silently discards
    // DEFAULT_BOT_PERSONA_SYSTEM_PROMPT — the code default only applies when
    // no persona row exists at all, and provisioning always creates one.
    const { error: personaErr } = await supabase
      .from("bot_personas")
      .insert({
        tenant_id: tenant.id,
        name: defaultBotPersonaName(tenant.name),
        system_prompt: DEFAULT_BOT_PERSONA_SYSTEM_PROMPT,
      });
    if (personaErr) fail(personaErr.message);
    console.log(`  ✓ default bot persona created (${defaultBotPersonaName(tenant.name)})`);
  }

  // ── 4. Pages ───────────────────────────────────────────────────────────────
  console.log("→ Seeding default pages");
  runSeedScript(repoRoot, "seed-default-pages.ts", {
    ...process.env,
    SEED_TENANT_SLUG: tenant.slug,
    ...(args.forcePages ? { FORCE: "1" } : {}),
  });

  // ── 3b. Lead notifications ─────────────────────────────────────────────────
  // tenant_settings.lead_email_enabled defaults to false and nothing ever
  // created the row, so every tenant in production captured leads silently —
  // a dealer would never learn a shopper had converted. Notifying the owner is
  // the only sane default for the product; a tenant can narrow it afterwards.
  // Delivery falls back to the platform sender until they verify their own.
  {
    const { error: settingsErr } = await supabase
      .from("tenant_settings")
      .upsert(
        {
          tenant_id: tenant.id,
          lead_email_enabled: true,
          lead_email_roles: ["owner"],
          lead_email_mode: "instant",
        },
        { onConflict: "tenant_id" },
      );
    if (settingsErr) fail(settingsErr.message);
    console.log("  ✓ lead notifications enabled for owners");
  }

  // ── 4b. Concierge routing targets ──────────────────────────────────────────
  // Without these the public concierge can describe a vehicle but has nowhere
  // to send the shopper: finance, trade-in, service and specials are all
  // unreachable. Every tenant in production shipped with an empty registry.
  console.log("→ Seeding concierge routing targets");
  {
    const { data: pages, error: pagesErr } = await supabase
      .from("pages")
      .select("slug")
      .eq("tenant_id", tenant.id)
      .is("archived_at", null);
    if (pagesErr) fail(pagesErr.message);
    // A target for a page the tenant does not have is a 404 the concierge
    // would confidently recommend.
    const targets = targetsForAvailablePages((pages ?? []).map((page) => page.slug));
    if (targets.length === 0) {
      console.log("  ✓ no dealer pages present; no targets to seed");
    } else {
      const { error: targetErr } = await supabase
        .from("concierge_targets")
        .upsert(
          targets.map((target) => ({
            tenant_id: tenant.id,
            key: target.key,
            label: target.label,
            kind: "route" as const,
            destination: target.destination,
            ai_description: target.aiDescription,
            is_conversion: target.isConversion,
            enabled: true,
            sort_order: target.sortOrder,
          })),
          { onConflict: "tenant_id,key" },
        );
      if (targetErr) fail(targetErr.message);
      console.log(`  ✓ ${targets.length} concierge targets seeded`);
    }
  }

  // ── 5. Sample data (opt-in) ────────────────────────────────────────────────
  if (args.withSampleData) {
    console.log("→ Loading sample vehicles + RAG chunks");
    runSeedScript(repoRoot, "seed-default-tenant.ts", {
      ...process.env,
      SEED_TENANT_SLUG: tenant.slug,
      SEED_TENANT_NAME: tenant.name,
      ...(userId ? { SEED_OWNER_USER_ID: userId } : {}),
    });
  }

  console.log(`
✓ Tenant "${tenant.slug}" provisioned.

Next steps for a real customer site:
  • Public site build for this tenant: VITE_LUME_TENANT=${tenant.slug} npm run build
    (per-tenant reachability is onboarding-backlog item 1 — no shared routing yet)
  • Admin: log in as the owner and visit /admin/${tenant.slug}
  • Import inventory + knowledge docs (blank unless --with-sample-data was used)
`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
