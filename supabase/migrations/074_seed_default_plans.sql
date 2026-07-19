-- Seed LUME's default plan catalog rows (Basic / Pro / Ultra).
--
-- These rows make plans assignable to tenants via public.subscriptions.
-- What each plan *means* (feature entitlements such as chat.actions, display
-- copy, prices) lives in the typed catalog at packages/types/src/plans.ts,
-- keyed by plans.name — keep the names below in sync with PLAN_IDS there.
-- plans.limits stays empty for now: quota enforcement treats an absent limit
-- as unmetered, and real limits/prices land when billing launches.
--
-- Additive and idempotent; safe to re-run.

insert into public.plans (name, monthly_price_cents, limits)
values
  ('basic', 0, '{}'::jsonb),
  ('pro', 0, '{}'::jsonb),
  ('ultra', 0, '{}'::jsonb)
on conflict (name) do nothing;
