-- 088_concierge_internal_traces.sql
--
-- Full-fidelity concierge traces for explicitly approved internal test tenants.
-- These records are written only by trusted server routes. They are deliberately
-- not exposed through Supabase's Data API: raw visitor/assistant text belongs in
-- LUME's controlled evaluation dataset, not a browser-readable table.

create table if not exists public.concierge_traces (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null,
  conversation_id text not null check (char_length(conversation_id) between 1 and 200),
  turn integer check (turn is null or turn >= 0),
  trace_mode text not null check (trace_mode = 'internal_full'),
  source text not null check (source in ('deterministic', 'interpreted', 'model', 'tool', 'error')),
  status text not null default 'completed'
    check (status in ('completed', 'failed', 'stream_incomplete', 'duplicate')),
  user_message text not null check (char_length(user_message) <= 12000),
  assistant_response text check (assistant_response is null or char_length(assistant_response) <= 30000),
  state_before jsonb not null default '{}'::jsonb check (jsonb_typeof(state_before) = 'object'),
  state_after jsonb not null default '{}'::jsonb check (jsonb_typeof(state_after) = 'object'),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  tool_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_summary) = 'array'),
  retrieval jsonb not null default '{}'::jsonb check (jsonb_typeof(retrieval) = 'object'),
  model jsonb not null default '{}'::jsonb check (jsonb_typeof(model) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint concierge_traces_tenant_request_unique unique (tenant_id, request_id)
);

create index if not exists concierge_traces_tenant_created_idx
  on public.concierge_traces (tenant_id, created_at desc);
create index if not exists concierge_traces_tenant_conversation_idx
  on public.concierge_traces (tenant_id, conversation_id, created_at asc);

alter table public.concierge_traces enable row level security;
revoke all on table public.concierge_traces from anon, authenticated;
grant all on table public.concierge_traces to service_role;

comment on table public.concierge_traces is
  'Service-role-only full concierge evaluation traces for explicit internal test tenants.';
