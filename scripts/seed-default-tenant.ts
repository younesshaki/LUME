/**
 * One-time seed: provision a "default" tenant and load existing data into it.
 *
 * Run from repo root:
 *
 *   tsx scripts/seed-default-tenant.ts
 *
 * Requires (set via .env.local at repo root, or exported in your shell):
 *   SUPABASE_URL                  https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     server-only; bypasses RLS
 *   R2_PUBLIC_BASE_URL            for fetching the vehicles CSV
 *   SEED_OWNER_EMAIL              email of an existing Supabase auth user
 *                                 (or use SEED_OWNER_USER_ID directly)
 *
 * Optional:
 *   SEED_TENANT_SLUG=default
 *   SEED_TENANT_NAME="LUME"
 *
 * Idempotent: re-running with the same slug upserts the tenant, refreshes
 * the membership, replaces vehicles, and re-imports RAG chunks (deleted +
 * re-inserted, since embeddings are tied to the file).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";

type EmbeddedChunk = {
  id: string;
  text: string;
  category: string;
  embedding: number[];
};

const CSV_KEY = "vehicles-with-generated-images.csv";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✖ Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const r2Base = requireEnv("R2_PUBLIC_BASE_URL");
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const ownerUserId = process.env.SEED_OWNER_USER_ID;
  if (!ownerEmail && !ownerUserId) {
    console.error("✖ Provide SEED_OWNER_EMAIL or SEED_OWNER_USER_ID.");
    process.exit(1);
  }

  const slug = process.env.SEED_TENANT_SLUG ?? "default";
  const name = process.env.SEED_TENANT_NAME ?? "LUME";

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─── 1. Upsert tenant ─────────────────────────────────────────────────────
  console.log(`→ Upserting tenant slug="${slug}" name="${name}"`);
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .upsert({ slug, name, status: "active" }, { onConflict: "slug" })
    .select("id, slug, name")
    .single();
  if (tenantErr || !tenant) throw new Error(tenantErr?.message ?? "tenant upsert failed");
  console.log(`  ✓ tenant id=${tenant.id}`);

  // ─── 2. Resolve owner user id ─────────────────────────────────────────────
  let userId = ownerUserId ?? null;
  if (!userId && ownerEmail) {
    console.log(`→ Looking up auth user by email "${ownerEmail}"`);
    // admin.listUsers doesn't filter by email server-side; page until found.
    let page = 1;
    while (!userId) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const match = data.users.find(
        (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
      );
      if (match) userId = match.id;
      if (!data.users.length || data.users.length < 200) break;
      page++;
    }
    if (!userId) {
      console.error(
        `✖ No auth user with email ${ownerEmail}. Create the user first in Supabase Studio, then re-run.`
      );
      process.exit(1);
    }
  }
  console.log(`  ✓ owner user id=${userId}`);

  // ─── 3. Owner membership ──────────────────────────────────────────────────
  const { error: memberErr } = await supabase
    .from("tenant_members")
    .upsert({ tenant_id: tenant.id, user_id: userId!, role: "owner" });
  if (memberErr) throw new Error(memberErr.message);
  console.log("  ✓ tenant_members upserted (role=owner)");

  // ─── 4. Vehicles ──────────────────────────────────────────────────────────
  await seedVehicles(supabase, tenant.id, r2Base);

  // ─── 5. RAG chunks ────────────────────────────────────────────────────────
  await seedRagChunks(supabase, tenant.id);

  console.log("\n✓ Done.");
}

async function seedVehicles(
  supabase: ReturnType<typeof createClient<Database>>,
  tenantId: string,
  r2Base: string
) {
  console.log(`\n→ Fetching vehicles CSV from R2`);
  const csvUrl = `${r2Base.replace(/\/$/, "")}/${CSV_KEY}`;
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  console.log(`  ✓ parsed ${rows.length} rows`);

  // Wipe existing rows for this tenant so re-runs stay clean.
  console.log("→ Clearing existing vehicles for tenant");
  const { error: delErr } = await supabase
    .from("vehicles")
    .delete()
    .eq("tenant_id", tenantId);
  if (delErr) throw new Error(delErr.message);

  const inserts = rows
    .filter((r) => r.make && r.year)
    .map((r) => ({
      tenant_id: tenantId,
      external_id: r._primaryKey || r.listingId || null,
      stock_type: r.stockType || null,
      year: parseInt(r.year) || 0,
      make: r.make,
      model: r.model,
      trim: r.trim !== "[PREMIUM]" ? r.trim ?? "" : "",
      price: generatePrice(r.make, parseInt(r.year) || 2020, parseMileage(r), r._primaryKey),
      mileage: parseMileage(r),
      body_style: r.bodyStyle ?? "",
      exterior_color: r.exteriorColor !== "[PREMIUM]" ? r.exteriorColor ?? "" : "",
      interior_color: r.interiorColor !== "[PREMIUM]" ? r.interiorColor ?? "" : "",
      drivetrain: r.drivetrain ? normalizeDrivetrain(r.drivetrain) : "",
      fuel_type: r.fuelType ? normalizeFuelType(r.fuelType) : "",
      image_src: "",
      seller_city: r.sellerCity ?? "",
      seller_state: r.sellerState ?? "",
      is_special: false,
      special_image_src: null,
    }));

  console.log(`→ Inserting ${inserts.length} vehicles in batches of 500`);
  for (let i = 0; i < inserts.length; i += 500) {
    const batch = inserts.slice(i, i + 500);
    const { error } = await supabase.from("vehicles").insert(batch);
    if (error) throw new Error(`vehicles insert failed: ${error.message}`);
    process.stdout.write(`  ✓ ${Math.min(i + 500, inserts.length)}/${inserts.length}\r`);
  }
  console.log("");
}

async function seedRagChunks(
  supabase: ReturnType<typeof createClient<Database>>,
  tenantId: string
) {
  const embeddingsPath = resolve(
    process.cwd(),
    "src/lib/knowledge/embeddings.json"
  );
  console.log(`\n→ Reading ${embeddingsPath}`);
  let raw: string;
  try {
    raw = readFileSync(embeddingsPath, "utf8");
  } catch {
    console.warn("  ! embeddings.json not found — skipping RAG seed");
    return;
  }
  const chunks: EmbeddedChunk[] = JSON.parse(raw);
  console.log(`  ✓ ${chunks.length} chunks (dim=${chunks[0]?.embedding.length ?? "?"})`);

  // Clear and reseed.
  console.log("→ Clearing existing rag_chunks + rag_documents for tenant");
  await supabase.from("rag_chunks").delete().eq("tenant_id", tenantId);
  await supabase.from("rag_documents").delete().eq("tenant_id", tenantId);

  // Group chunks by category → one document per category.
  const byCategory = new Map<string, EmbeddedChunk[]>();
  for (const c of chunks) {
    const cat = c.category || "general";
    const arr = byCategory.get(cat) ?? [];
    arr.push(c);
    byCategory.set(cat, arr);
  }

  for (const [category, items] of byCategory) {
    const { data: doc, error: docErr } = await supabase
      .from("rag_documents")
      .insert({
        tenant_id: tenantId,
        title: `Seed: ${category}`,
        category,
        source: "seed:embeddings.json",
      })
      .select("id")
      .single();
    if (docErr || !doc) throw new Error(docErr?.message ?? "doc insert failed");

    const inserts = items.map((c) => ({
      tenant_id: tenantId,
      document_id: doc.id,
      external_id: c.id,
      text: c.text,
      category,
      embedding: c.embedding,
    }));

    for (let i = 0; i < inserts.length; i += 100) {
      const batch = inserts.slice(i, i + 100);
      const { error } = await supabase.from("rag_chunks").insert(batch);
      if (error) throw new Error(`rag_chunks insert failed: ${error.message}`);
    }
    console.log(`  ✓ ${category}: ${items.length} chunks`);
  }
}

// ─── helpers (ported from src/experience/vehicles/catalog.ts) ────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function parseMileage(row: Record<string, string>): number | null {
  if (!row.mileage || row.mileage === "[PREMIUM]") return null;
  const n = parseInt(row.mileage);
  return Number.isFinite(n) ? n : null;
}

function normalizeDrivetrain(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (v === "AWD" || v.startsWith("ALL")) return "AWD";
  if (v === "4WD" || v.startsWith("FOUR")) return "4WD";
  if (v === "FWD" || v.startsWith("FRONT")) return "FWD";
  if (v === "RWD" || v.startsWith("REAR")) return "RWD";
  return raw.trim();
}

function normalizeFuelType(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "gasoline" || v === "gas" || v.includes("unleaded")) return "Gasoline";
  if (v === "electric") return "Electric";
  if (v === "plug-in hybrid") return "Plug-In Hybrid";
  if (v === "hybrid") return "Hybrid";
  if (v === "diesel") return "Diesel";
  if (v.includes("flex") || v.includes("e85")) return "Flex Fuel";
  return raw.trim();
}

const PRICE_TIERS: { makes: string[]; min: number; max: number }[] = [
  { makes: ["Ferrari", "Lamborghini", "Rolls-Royce", "Maserati"], min: 180000, max: 650000 },
  { makes: ["Porsche", "Mercedes-Benz", "BMW", "Audi", "Lexus", "Land Rover", "Jaguar", "Genesis", "Cadillac", "Lincoln"], min: 55000, max: 185000 },
  { makes: ["Tesla", "Polestar", "Acura", "INFINITI", "Volvo", "Buick"], min: 32000, max: 85000 },
];
const PRICE_DEFAULT = { min: 18000, max: 58000 };

function generatePrice(make: string, year: number, mileage: number | null, id: string): number {
  const tier = PRICE_TIERS.find((t) => t.makes.includes(make)) ?? PRICE_DEFAULT;
  const hash = Math.abs(hashString(id || `${make}-${year}`));
  let price = tier.min + (hash % (tier.max - tier.min));
  const age = 2026 - year;
  if (age <= 1) price *= 1.18;
  else if (age <= 3) price *= 1.06;
  else if (age >= 10) price *= 0.68;
  else if (age >= 6) price *= 0.84;
  if (mileage !== null && mileage > 0) {
    if (mileage > 60000) price *= 0.82;
    else if (mileage > 25000) price *= 0.91;
    else if (mileage < 5000) price *= 1.07;
  }
  return Math.round(price / 500) * 500;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

main().catch((err) => {
  console.error("\n✖", err);
  process.exit(1);
});
