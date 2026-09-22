import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/087_rag_knowledge_lifecycle_hybrid_search.sql",
  ),
  "utf8",
);

describe("knowledge lifecycle migration contract", () => {
  it("removes anonymous direct chunk access", () => {
    expect(migration).toContain(
      'drop policy if exists "rag_chunks_select_public_active" on public.rag_chunks',
    );
    expect(migration).toContain(
      "revoke select on table public.rag_chunks from anon",
    );
    expect(migration).toContain(
      "revoke all on function public.match_rag_chunks_for_tenant(uuid, vector, integer) from public, anon, authenticated",
    );
  });

  it("retrieves only the current public published revision for an active tenant", () => {
    expect(migration).toContain("document.status = 'published'");
    expect(migration).toContain("document.visibility = 'public'");
    expect(migration).toContain("chunk.revision = document.published_revision");
    expect(migration).toContain("tenant.status = 'active'");
  });

  it("keeps queue internals service-only while editor RPCs enforce a role", () => {
    expect(migration).toContain(
      "revoke all on table public.rag_indexing_jobs from anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.claim_rag_indexing_jobs(integer) to service_role",
    );
    expect(migration).toContain(
      "user_has_tenant_role(p_tenant_id, array['owner', 'admin', 'editor'])",
    );
    expect(migration).toMatch(
      /archive_rag_document[\s\S]+?security definer[\s\S]+?user_has_tenant_role/,
    );
  });

  it("backfills legacy rows without deleting the existing corpus", () => {
    const backfill = migration.slice(
      migration.indexOf("with ordered as"),
      migration.indexOf("create unique index"),
    );
    expect(backfill).toContain("status = 'published'");
    expect(backfill).toContain("published_revision = 1");
    expect(backfill).not.toMatch(/delete\s+from/i);
  });

  it("publishes chunks and document state in one database function", () => {
    const start = migration.indexOf(
      "create or replace function public.complete_rag_indexing_job",
    );
    const end = migration.indexOf(
      "create or replace function public.fail_rag_indexing_job",
    );
    const completion = migration.slice(start, end);
    expect(completion).toContain("delete from public.rag_chunks");
    expect(completion).toContain("insert into public.rag_chunks");
    expect(completion).toContain("published_revision = v_job.revision");
    expect(completion).toContain("status = 'completed'");
  });
});
