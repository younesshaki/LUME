-- 087_rag_knowledge_lifecycle_hybrid_search.sql
-- Draft/publish lifecycle, durable indexing jobs, visibility-safe hybrid RAG.
-- Existing legacy rows are promoted to published revision 1 so deploying the
-- lifecycle does not create a knowledge outage. No legacy row is deleted.

alter table public.rag_documents
  add column if not exists content text not null default '',
  add column if not exists status text not null default 'draft',
  add column if not exists visibility text not null default 'public',
  add column if not exists revision integer not null default 1,
  add column if not exists published_revision integer,
  add column if not exists published_at timestamptz,
  add column if not exists embedding_status text not null default 'not_indexed',
  add column if not exists embedding_model text,
  add column if not exists indexed_at timestamptz,
  add column if not exists indexing_error text;

alter table public.rag_documents
  drop constraint if exists rag_documents_status_check,
  add constraint rag_documents_status_check
    check (status in ('draft', 'published', 'archived')),
  drop constraint if exists rag_documents_visibility_check,
  add constraint rag_documents_visibility_check
    check (visibility = 'public'),
  drop constraint if exists rag_documents_revision_check,
  add constraint rag_documents_revision_check
    check (revision >= 1 and (published_revision is null or published_revision between 1 and revision)),
  drop constraint if exists rag_documents_content_bounds_check,
  add constraint rag_documents_content_bounds_check
    check (char_length(content) <= 200000),
  drop constraint if exists rag_documents_indexing_error_bounds_check,
  add constraint rag_documents_indexing_error_bounds_check
    check (indexing_error is null or char_length(indexing_error) <= 500),
  drop constraint if exists rag_documents_embedding_status_check,
  add constraint rag_documents_embedding_status_check
    check (embedding_status in ('not_indexed', 'pending', 'indexed', 'lexical_only', 'failed'));

alter table public.rag_chunks
  add column if not exists revision integer not null default 1,
  add column if not exists chunk_index integer not null default 0,
  add column if not exists content_hash text,
  add column if not exists embedding_model text,
  add column if not exists fts tsvector generated always as
    (to_tsvector('english', coalesce(text, ''))) stored;

-- Legacy chunks predate ordering metadata. Give each document a stable order
-- before creating the uniqueness constraint, then reconstruct the editable
-- source text and preserve the corpus as its first published revision.
with ordered as (
  select id,
    row_number() over (partition by document_id order by created_at, id) - 1 as position
  from public.rag_chunks
)
update public.rag_chunks chunk
set chunk_index = ordered.position::integer,
    revision = 1
from ordered
where chunk.id = ordered.id;

update public.rag_documents document
set content = legacy.content,
    status = 'published',
    visibility = 'public',
    revision = 1,
    published_revision = 1,
    published_at = coalesce(document.updated_at, document.created_at, now()),
    indexed_at = coalesce(document.updated_at, document.created_at, now()),
    embedding_status = case when legacy.has_embedding then 'indexed' else 'lexical_only' end,
    embedding_model = case when legacy.has_embedding then 'nomic-embed-text' else null end
from (
  select document_id,
    string_agg(text, E'\n\n' order by chunk_index) as content,
    bool_or(embedding is not null) as has_embedding
  from public.rag_chunks
  group by document_id
) legacy
where document.id = legacy.document_id
  and document.content = '';

create unique index if not exists rag_chunks_document_revision_index_uidx
  on public.rag_chunks (document_id, revision, chunk_index);
create index if not exists rag_chunks_fts_idx on public.rag_chunks using gin (fts);
create index if not exists rag_documents_publication_idx
  on public.rag_documents (tenant_id, status, visibility, published_revision);
create unique index if not exists rag_chunks_document_external_uidx
  on public.rag_chunks (document_id, external_id);

create table if not exists public.rag_indexing_jobs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.rag_documents(id) on delete cascade,
  revision integer not null check (revision >= 1),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retrying', 'completed', 'dead_letter', 'superseded')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, revision)
);
create index if not exists rag_indexing_jobs_tenant_idx
  on public.rag_indexing_jobs (tenant_id);
create index if not exists rag_indexing_jobs_ready_idx
  on public.rag_indexing_jobs (next_attempt_at, created_at)
  where status in ('pending', 'retrying');
create index if not exists rag_indexing_jobs_stale_claim_idx
  on public.rag_indexing_jobs (claimed_at, created_at)
  where status = 'processing';
alter table public.rag_indexing_jobs enable row level security;
revoke all on table public.rag_indexing_jobs from anon, authenticated;
grant all on table public.rag_indexing_jobs to service_role;

-- Chunks are no longer directly public. Public chat is a server route and the
-- retrieval RPC below exposes only published/public revisions.
drop policy if exists "rag_chunks_select_public_active" on public.rag_chunks;
revoke select on table public.rag_chunks from anon;

create or replace function public.enqueue_rag_indexing_job(
  p_tenant_id uuid,
  p_document_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision integer;
  v_job_id uuid;
begin
  if not public.user_has_tenant_role(p_tenant_id, array['owner', 'admin', 'editor']) then
    raise exception 'not authorized';
  end if;
  select revision into v_revision from public.rag_documents
  where id = p_document_id and tenant_id = p_tenant_id and status <> 'archived';
  if not found then raise exception 'document not found'; end if;
  insert into public.rag_indexing_jobs (tenant_id, document_id, revision)
  values (p_tenant_id, p_document_id, v_revision)
  on conflict (document_id, revision) do update
    set status = 'pending', attempt_count = 0, next_attempt_at = now(),
        claimed_at = null, completed_at = null, last_error = null, updated_at = now()
  returning id into v_job_id;
  update public.rag_documents set embedding_status = 'pending', indexing_error = null
  where id = p_document_id and tenant_id = p_tenant_id;
  return v_job_id;
end;
$$;

create or replace function public.save_rag_document(
  p_tenant_id uuid,
  p_document_id uuid,
  p_title text,
  p_category text,
  p_source text,
  p_content text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id uuid; v_existing public.rag_documents%rowtype;
begin
  if not public.user_has_tenant_role(p_tenant_id, array['owner', 'admin', 'editor']) then
    raise exception 'not authorized';
  end if;
  if nullif(btrim(p_title), '') is null or char_length(p_title) > 160 then raise exception 'invalid title'; end if;
  if nullif(btrim(p_category), '') is null or char_length(p_category) > 80 then raise exception 'invalid category'; end if;
  if nullif(btrim(p_content), '') is null or char_length(p_content) > 200000 then raise exception 'invalid content'; end if;
  if p_source is not null and char_length(p_source) > 500 then raise exception 'invalid source'; end if;
  if p_document_id is null then
    insert into public.rag_documents (tenant_id, title, category, source, content)
    values (p_tenant_id, btrim(p_title), btrim(p_category), nullif(btrim(p_source), ''), p_content)
    returning id into v_id;
    return v_id;
  end if;
  select * into v_existing from public.rag_documents
  where id = p_document_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'document not found'; end if;
  update public.rag_documents set
    title = btrim(p_title), category = btrim(p_category), source = nullif(btrim(p_source), ''),
    content = p_content,
    revision = case when v_existing.content is distinct from p_content or v_existing.category is distinct from btrim(p_category)
      then v_existing.revision + 1 else v_existing.revision end,
    status = case when v_existing.status = 'archived' then 'draft' else v_existing.status end,
    embedding_status = case when v_existing.content is distinct from p_content or v_existing.category is distinct from btrim(p_category)
      then 'not_indexed' else v_existing.embedding_status end,
    indexing_error = null
  where id = p_document_id and tenant_id = p_tenant_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.archive_rag_document(p_tenant_id uuid, p_document_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_archived boolean;
begin
  if not public.user_has_tenant_role(p_tenant_id, array['owner', 'admin', 'editor']) then
    raise exception 'not authorized';
  end if;
  update public.rag_documents set status = 'archived', embedding_status = 'not_indexed'
  where id = p_document_id and tenant_id = p_tenant_id;
  v_archived := found;
  update public.rag_indexing_jobs set status = 'superseded', completed_at = now(),
    updated_at = now()
  where document_id = p_document_id and tenant_id = p_tenant_id
    and status in ('pending', 'processing', 'retrying');
  return v_archived;
end;
$$;

create or replace function public.claim_rag_indexing_jobs(p_limit integer default 5)
returns setof public.rag_indexing_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id from public.rag_indexing_jobs
    where (status in ('pending', 'retrying') and next_attempt_at <= now())
       or (status = 'processing' and claimed_at <= now() - interval '10 minutes')
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.rag_indexing_jobs job
  set status = 'processing', claimed_at = now(), attempt_count = attempt_count + 1,
      updated_at = now()
  from candidates where job.id = candidates.id
  returning job.*;
end;
$$;

create or replace function public.complete_rag_indexing_job(
  p_job_id uuid,
  p_chunks jsonb,
  p_embedding_model text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_job public.rag_indexing_jobs%rowtype;
begin
  select * into v_job from public.rag_indexing_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'processing' then return false; end if;
  if not exists (select 1 from public.rag_documents where id = v_job.document_id and tenant_id = v_job.tenant_id and revision = v_job.revision and status <> 'archived') then
    update public.rag_indexing_jobs set status = 'superseded', completed_at = now(), updated_at = now() where id = p_job_id;
    return false;
  end if;
  delete from public.rag_chunks where document_id = v_job.document_id and revision = v_job.revision;
  insert into public.rag_chunks
    (tenant_id, document_id, revision, chunk_index, external_id, text, category, content_hash, embedding, embedding_model)
  select v_job.tenant_id, v_job.document_id, v_job.revision,
    (item->>'index')::integer, item->>'externalId', item->>'text', item->>'category',
    item->>'contentHash',
    case when item ? 'embedding' and jsonb_typeof(item->'embedding') = 'array'
      then (item->>'embedding')::vector(768) else null end,
    p_embedding_model
  from jsonb_array_elements(p_chunks) item;
  update public.rag_documents set status = 'published', published_revision = v_job.revision,
    published_at = now(), indexed_at = now(), embedding_model = p_embedding_model,
    embedding_status = case when p_embedding_model is null then 'lexical_only' else 'indexed' end,
    indexing_error = null
  where id = v_job.document_id and tenant_id = v_job.tenant_id;
  update public.rag_indexing_jobs set status = 'completed', completed_at = now(),
    last_error = null, updated_at = now() where id = p_job_id;
  return true;
end;
$$;

create or replace function public.fail_rag_indexing_job(p_job_id uuid, p_error text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_job public.rag_indexing_jobs%rowtype; v_next text;
begin
  select * into v_job from public.rag_indexing_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'processing' then return 'stale'; end if;
  v_next := case when v_job.attempt_count >= 5 then 'dead_letter' else 'retrying' end;
  update public.rag_indexing_jobs set status = v_next,
    next_attempt_at = now() + make_interval(mins => least(60, (power(2, attempt_count)::integer))),
    last_error = left(p_error, 500), updated_at = now() where id = p_job_id;
  update public.rag_documents set embedding_status = 'failed', indexing_error = left(p_error, 500)
  where id = v_job.document_id and tenant_id = v_job.tenant_id and revision = v_job.revision;
  return v_next;
end;
$$;

create or replace function public.hybrid_rag_chunks_for_tenant(
  p_tenant_id uuid,
  p_query_text text,
  p_query_embedding vector(768) default null,
  p_match_count integer default 7
)
returns table (
  id uuid,
  document_id uuid,
  text text,
  category text,
  score double precision,
  source text,
  document_title text,
  document_revision integer,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with eligible as (
    select chunk.* from public.rag_chunks chunk
    join public.rag_documents document on document.id = chunk.document_id
    join public.tenants tenant on tenant.id = chunk.tenant_id
    where chunk.tenant_id = p_tenant_id and tenant.status = 'active'
      and document.status = 'published' and document.visibility = 'public'
      and chunk.revision = document.published_revision
  ), lexical as (
    select e.id, row_number() over (order by ts_rank_cd(e.fts, websearch_to_tsquery('english', p_query_text)) desc) rank
    from eligible e where nullif(btrim(p_query_text), '') is not null
      and e.fts @@ websearch_to_tsquery('english', p_query_text) limit 50
  ), semantic as (
    select e.id, row_number() over (order by e.embedding <=> p_query_embedding) rank
    from eligible e where p_query_embedding is not null and e.embedding is not null limit 50
  ), fused as (
    select coalesce(l.id, s.id) id,
      coalesce(1.0 / (60 + l.rank), 0) + coalesce(1.0 / (60 + s.rank), 0) score,
      case when l.id is not null and s.id is not null then 'hybrid'
           when s.id is not null then 'semantic' else 'lexical' end source
    from lexical l full join semantic s on s.id = l.id
  )
  select e.id, e.document_id, e.text, e.category, f.score, f.source,
    document.title, e.revision, document.published_at
  from fused f
  join eligible e on e.id = f.id
  join public.rag_documents document on document.id = e.document_id
  order by f.score desc, e.chunk_index asc
  limit greatest(1, least(coalesce(p_match_count, 7), 20));
$$;

revoke all on function public.claim_rag_indexing_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_rag_indexing_job(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.fail_rag_indexing_job(uuid, text) from public, anon, authenticated;
revoke all on function public.hybrid_rag_chunks_for_tenant(uuid, text, vector, integer) from public, anon, authenticated;
revoke all on function public.match_rag_chunks_for_tenant(uuid, vector, integer) from public, anon, authenticated;
revoke all on function public.enqueue_rag_indexing_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_rag_document(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.archive_rag_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_rag_indexing_jobs(integer) to service_role;
grant execute on function public.complete_rag_indexing_job(uuid, jsonb, text) to service_role;
grant execute on function public.fail_rag_indexing_job(uuid, text) to service_role;
grant execute on function public.hybrid_rag_chunks_for_tenant(uuid, text, vector, integer) to service_role;
grant execute on function public.match_rag_chunks_for_tenant(uuid, vector, integer) to service_role;
grant execute on function public.enqueue_rag_indexing_job(uuid, uuid) to authenticated, service_role;
grant execute on function public.save_rag_document(uuid, uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.archive_rag_document(uuid, uuid) to authenticated, service_role;

comment on table public.rag_indexing_jobs is 'Durable, revision-scoped indexing queue for tenant knowledge documents.';
comment on function public.hybrid_rag_chunks_for_tenant is 'Visibility-safe RRF retrieval over the currently published revision only.';
