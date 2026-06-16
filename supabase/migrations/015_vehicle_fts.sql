-- 015_vehicle_fts.sql
-- Vehicle full-text search — SCRUM-210. Adds a generated tsvector column over
-- the human-meaningful vehicle fields plus a GIN index, so the admin (and the
-- bot's find_vehicles tool) can run fast fuzzy/keyword search instead of
-- pulling the whole catalog into memory.
--
-- The column is GENERATED ALWAYS so it stays in sync automatically — no
-- trigger, no app code to maintain. Weights: make/model highest (A), trim and
-- body style (B), colors and year (C).

alter table public.vehicles
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(make, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(model, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(trim, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body_style, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(exterior_color, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(fuel_type, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(year::text, '')), 'C')
  ) stored;

create index if not exists vehicles_search_vector_idx
  on public.vehicles using gin (search_vector);
