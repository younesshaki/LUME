-- 059_vehicle_image_descriptions.sql
-- SCRUM-109. Durable, service-only image-description jobs. Model calls happen
-- in a guarded worker; upload confirmation only enqueues.

alter table public.vehicle_images
  add column if not exists ai_description text,
  add column if not exists ai_description_status text,
  add column if not exists ai_description_model text,
  add column if not exists ai_description_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicle_images_ai_description_bounded'
      and conrelid = 'public.vehicle_images'::regclass
  ) then
    alter table public.vehicle_images
      add constraint vehicle_images_ai_description_bounded check (
        ai_description is null or char_length(ai_description) between 1 and 12000
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicle_images_ai_description_status_valid'
      and conrelid = 'public.vehicle_images'::regclass
  ) then
    alter table public.vehicle_images
      add constraint vehicle_images_ai_description_status_valid check (
        ai_description_status is null
        or ai_description_status in ('pending', 'processing', 'completed', 'failed')
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicle_images_ai_description_model_bounded'
      and conrelid = 'public.vehicle_images'::regclass
  ) then
    alter table public.vehicle_images
      add constraint vehicle_images_ai_description_model_bounded check (
        ai_description_model is null or char_length(ai_description_model) between 1 and 200
      );
  end if;
end;
$$;

create table if not exists public.vehicle_image_description_jobs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  image_id uuid not null unique references public.vehicle_images(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'retrying', 'completed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_image_description_jobs_due_idx
  on public.vehicle_image_description_jobs (next_attempt_at)
  where status in ('pending', 'retrying');
create index if not exists vehicle_image_description_jobs_stale_idx
  on public.vehicle_image_description_jobs (updated_at)
  where status = 'delivering';

alter table public.vehicle_image_description_jobs enable row level security;
create policy "vehicle_image_description_jobs_select_member"
  on public.vehicle_image_description_jobs for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create trigger vehicle_image_description_jobs_set_updated_at
  before update on public.vehicle_image_description_jobs
  for each row execute function public.set_updated_at();

create or replace function public.enqueue_vehicle_image_description(
  p_tenant_id uuid,
  p_image_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
begin
  if not exists (
    select 1 from public.vehicle_images
    where id = p_image_id and tenant_id = p_tenant_id
  ) then return null; end if;

  insert into public.vehicle_image_description_jobs (tenant_id, image_id)
  values (p_tenant_id, p_image_id)
  on conflict (image_id) do update set
    next_attempt_at = case
      when public.vehicle_image_description_jobs.status in ('pending', 'retrying')
        then least(public.vehicle_image_description_jobs.next_attempt_at, now())
      else public.vehicle_image_description_jobs.next_attempt_at
    end
  returning id into v_job_id;

  update public.vehicle_images set
    ai_description_status = case
      when ai_description_status = 'completed' then ai_description_status else 'pending' end,
    ai_description_updated_at = now()
  where id = p_image_id and tenant_id = p_tenant_id;
  return v_job_id;
end;
$$;

create or replace function public.claim_vehicle_image_description_jobs(p_limit integer default 10)
returns table (
  id uuid,
  tenant_id uuid,
  image_id uuid,
  r2_key text,
  content_type text,
  byte_size bigint,
  attempt_count integer,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  vehicle_trim text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select job.id
    from public.vehicle_image_description_jobs job
    where (
      (job.status in ('pending', 'retrying') and job.next_attempt_at <= now())
      or (job.status = 'delivering' and job.updated_at <= now() - interval '15 minutes')
    )
    order by job.next_attempt_at, job.id
    for update skip locked
    limit least(greatest(p_limit, 1), 25)
  ), claimed as (
    update public.vehicle_image_description_jobs job set
      status = 'delivering', attempt_count = job.attempt_count + 1, last_error = null
    from due where job.id = due.id
    returning job.*
  ), marked as (
    update public.vehicle_images image set
      ai_description_status = 'processing',
      ai_description_updated_at = now()
    from claimed where image.id = claimed.image_id
    returning image.id
  )
  select claimed.id, claimed.tenant_id, claimed.image_id, image.r2_key,
    image.content_type, image.byte_size, claimed.attempt_count,
    vehicle.year, vehicle.make, vehicle.model, vehicle.trim
  from claimed
  join marked on marked.id = claimed.image_id
  join public.vehicle_images image on image.id = claimed.image_id
  join public.vehicles vehicle on vehicle.id = image.vehicle_id;
$$;

create or replace function public.complete_vehicle_image_description_job(
  p_job_id uuid,
  p_attempt_count integer,
  p_description text,
  p_model text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_image_id uuid;
begin
  select image_id into v_image_id
  from public.vehicle_image_description_jobs
  where id = p_job_id and status = 'delivering' and attempt_count = p_attempt_count
  for update;
  if v_image_id is null then return false; end if;

  update public.vehicle_images set
    ai_description = p_description,
    ai_description_status = 'completed',
    ai_description_model = p_model,
    ai_description_updated_at = now()
  where id = v_image_id;
  update public.vehicle_image_description_jobs set
    status = 'completed', completed_at = now(), last_error = null
  where id = p_job_id;
  return true;
end;
$$;

create or replace function public.fail_vehicle_image_description_job(
  p_job_id uuid,
  p_attempt_count integer,
  p_next_attempt_at timestamptz,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_image_id uuid;
  v_dead_letter boolean := p_next_attempt_at is null;
begin
  select image_id into v_image_id
  from public.vehicle_image_description_jobs
  where id = p_job_id and status = 'delivering' and attempt_count = p_attempt_count
  for update;
  if v_image_id is null then return false; end if;

  update public.vehicle_image_description_jobs set
    status = case when v_dead_letter then 'dead_letter' else 'retrying' end,
    next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
    last_error = left(coalesce(p_error, 'Image description failed.'), 500)
  where id = p_job_id;
  update public.vehicle_images set
    ai_description_status = case when v_dead_letter then 'failed' else 'pending' end,
    ai_description_updated_at = now()
  where id = v_image_id;
  return true;
end;
$$;

revoke all on function public.enqueue_vehicle_image_description(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_vehicle_image_description_jobs(integer)
  from public, anon, authenticated;
revoke all on function public.complete_vehicle_image_description_job(uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_vehicle_image_description_job(uuid, integer, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_vehicle_image_description(uuid, uuid) to service_role;
grant execute on function public.claim_vehicle_image_description_jobs(integer) to service_role;
grant execute on function public.complete_vehicle_image_description_job(uuid, integer, text, text) to service_role;
grant execute on function public.fail_vehicle_image_description_job(uuid, integer, timestamptz, text) to service_role;

comment on column public.vehicle_images.ai_description is
  'Raw vision-model text used for ALT text and RAG enrichment.';
