# Next.js Backend Migration Plan

## Purpose

This plan defines the migration from the current Vite-only frontend into a proper Next.js App Router application with a real backend layer. The main goals are:

- Move CSV-backed vehicle data out of the browser/public folder.
- Use Supabase as the source of truth for structured application data.
- Use Cloudflare R2 as the source of truth for media and import/export files.
- Keep the cinematic frontend experience intact while replacing browser-side data loading with server-owned APIs.
- Create a system that can grow into a real marketplace/admin workflow without rewriting the data layer again.

This is a major architecture migration. It should be implemented in phases, with each phase deployable and reversible.

## Current State

The project is currently a Vite React app.

Important current files:

- `src/App.tsx`
- `src/experience/ui/VehiclesPage.tsx`
- `src/experience/ui/VehicleDetailPage.tsx`
- `src/experience/vehicles/catalog.ts`
- `src/experience/vehicles/urlState.ts`
- `public/vehicles/vehicles-with-generated-images.csv`
- `public/vehicles/vehicle-type-*.webp`
- `src/lib/supabase.ts`
- `src/lib/authService.ts`
- `src/lib/eventsService.ts`
- `src/config/cdn.ts`
- `supabase/migrations/*.sql`
- `vercel.json`

Current issues:

- Vehicle inventory is loaded directly by the browser from `/vehicles/vehicles-with-generated-images.csv`.
- The CSV lives in `public/`, so it is fully exposed as a static asset.
- Generated vehicle prices are calculated client-side.
- Vehicle search, filters, sorting, saved state, compare state, and detail views are client-owned.
- Supabase is used directly from browser code for auth, profiles, story state, and events.
- R2 is only used as a public media CDN through `VITE_R2_PUBLIC_BASE_URL`.
- There is no server boundary for validating requests, protecting imports, rate limiting, centralizing data access, or hiding implementation details.

## Target Architecture

Use Next.js App Router as the application and backend framework.

Recommended target stack:

- **Next.js App Router** for frontend routing, server components, route handlers, metadata, and server actions.
- **Supabase Postgres** for structured data: vehicles, users/profiles, story events, inquiries, saved vehicles, compare sessions, imports, and admin data.
- **Supabase Auth** for current preview login and future authenticated user features.
- **Cloudflare R2** for media files, original CSV import files, processed import artifacts, generated vehicle images, product/showcase media, and backups.
- **Server-only Supabase clients** for trusted reads/writes that require service role privileges.
- **Browser Supabase client** only where direct auth/session behavior is needed.
- **Next.js route handlers** for public API reads and protected admin/import workflows.
- **Server-side import pipeline** for CSV ingestion into Supabase.

High-level request flow:

```txt
Browser
  -> Next.js pages/components
  -> Next.js route handlers / server actions
  -> Supabase Postgres for structured data
  -> Cloudflare R2 for media and raw import files
```

Vehicle data flow:

```txt
CSV upload/import source
  -> R2 raw import object
  -> Next.js import route or script
  -> CSV parser/normalizer
  -> Supabase vehicles tables
  -> Next.js vehicle APIs/server components
  -> Vehicles UI
```

Media flow:

```txt
Vehicle/product media
  -> R2 object storage
  -> Supabase stores object keys/metadata
  -> Next.js returns signed or public URLs depending on asset type
  -> UI renders via centralized media helper
```

## Recommended Repository Shape

There are two viable migration strategies.

### Option A: In-place Next.js Migration

Convert the current repo from Vite to Next.js directly.

Pros:

- One app, one deployment.
- No long-term monorepo complexity.
- Easier once migration is complete.

Cons:

- Larger single PR.
- Requires careful routing and CSS migration.
- Higher risk of breaking the cinematic experience during conversion.

### Option B: Parallel Next.js App Then Cutover

Create a Next.js app alongside the existing Vite app temporarily.

Possible structure:

```txt
apps/web-next/
src/
public/
supabase/
```

Pros:

- Lower risk while building the backend.
- Current app remains shippable during migration.
- Easier to compare behavior before cutover.

Cons:

- Temporary duplication.
- Requires asset/import path discipline.
- Final cleanup pass needed.

Recommended approach: **Option A if the project can tolerate a migration branch**, otherwise Option B. Since this is a major backend move, a dedicated long-lived branch is acceptable either way.

## Next.js App Router Structure

Recommended final structure for an in-place migration:

```txt
app/
  layout.tsx
  page.tsx
  vehicles/
    page.tsx
    loading.tsx
    error.tsx
    [vehicleId]/
      page.tsx
      loading.tsx
      error.tsx
  products/
    page.tsx
    [productId]/
      page.tsx
  showcase/
    page.tsx
  contact/
    page.tsx
  admin/
    page.tsx
  api/
    vehicles/
      route.ts
    vehicles/[vehicleId]/
      route.ts
    vehicle-inquiries/
      route.ts
    saved-vehicles/
      route.ts
    compare/
      route.ts
    media/
      sign/
        route.ts
    admin/
      vehicle-imports/
        route.ts
      vehicle-imports/[importId]/
        route.ts
      vehicle-imports/[importId]/process/
        route.ts
src/
  components/
  experience/
  lib/
    server/
    supabase/
    r2/
    vehicles/
middleware/proxy layer if needed later
```

Notes:

- Use App Router route handlers, not Pages Router API routes.
- Use server components for data-loaded pages where possible.
- Use client components for interactive cinematic scenes, filters, modals, audio, compare, save toggles, and WebGL.
- Keep heavy 3D/showcase code dynamically imported.
- Avoid moving every component at once if an adapter shell can preserve behavior.

## Environment Variables

Current Vite variables use `VITE_*`. Next.js should split public and server-only variables.

### Public Browser Variables

Use only for values safe to expose:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=
NEXT_PUBLIC_SUPABASE_STORAGE_URL=
NEXT_PUBLIC_ENABLE_LOCAL_CHAT=
```

### Server-only Variables

Never expose these to browser code:

```env
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_BASE_URL=
R2_ENDPOINT=
VEHICLE_IMPORT_SECRET=
ACCESS_PASSWORD=
OLLAMA_HOST=
```

Rules:

- No service role key in client bundles.
- No R2 write credentials in client bundles.
- All upload/import/delete operations go through server code.
- Keep `ACCESS_PASSWORD` server-side. Do not ship it to the browser.

## Supabase Schema Plan

Keep existing auth/profile/story tables, but add marketplace-specific tables.

### Vehicles

```sql
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  listing_id text,
  vin_hash text,
  stock_type text not null,
  year integer not null,
  make text not null,
  model text not null,
  trim text,
  price integer,
  price_source text not null default 'estimated',
  mileage integer,
  body_style text,
  exterior_color text,
  interior_color text,
  drivetrain text,
  fuel_type text,
  transmission text,
  engine text,
  mpg text,
  seller_type text,
  seller_name text,
  seller_city text,
  seller_state text,
  listing_url text,
  status text not null default 'active',
  raw_payload jsonb not null default '{}',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index vehicles_make_model_idx on vehicles(make, model);
create index vehicles_year_idx on vehicles(year desc);
create index vehicles_price_idx on vehicles(price);
create index vehicles_mileage_idx on vehicles(mileage);
create index vehicles_location_idx on vehicles(seller_state, seller_city);
create index vehicles_stock_type_idx on vehicles(stock_type);
create index vehicles_body_style_idx on vehicles(body_style);
create index vehicles_fuel_type_idx on vehicles(fuel_type);
create index vehicles_drivetrain_idx on vehicles(drivetrain);
create index vehicles_status_idx on vehicles(status);
```

For full text search:

```sql
alter table vehicles
add column search_vector tsvector generated always as (
  setweight(to_tsvector('english', coalesce(make, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(model, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(trim, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(body_style, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(fuel_type, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(drivetrain, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(seller_city, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(seller_state, '')), 'B')
) stored;

create index vehicles_search_idx on vehicles using gin(search_vector);
```

### Vehicle Images

```sql
create table vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  r2_key text not null,
  public_url text,
  alt text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  source text not null default 'generated',
  created_at timestamptz not null default now()
);

create index vehicle_images_vehicle_id_idx on vehicle_images(vehicle_id, sort_order);
```

### Vehicle Imports

```sql
create table vehicle_imports (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'uploaded',
  r2_raw_key text not null,
  r2_processed_key text,
  filename text not null,
  rows_total integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_failed integer not null default 0,
  error_summary jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
```

### Vehicle Inquiries

```sql
create table vehicle_inquiries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  message text,
  status text not null default 'demo',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index vehicle_inquiries_vehicle_id_idx on vehicle_inquiries(vehicle_id);
create index vehicle_inquiries_created_at_idx on vehicle_inquiries(created_at desc);
```

### Saved Vehicles

```sql
create table saved_vehicles (
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vehicle_id)
);
```

### Compare Sessions

Compare can stay client-local initially, but if server persistence is desired:

```sql
create table vehicle_compare_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  vehicle_ids uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## RLS And Security Policy

Recommended RLS:

- Public/anon users can read active vehicles and public image metadata.
- Authenticated users can save/unsave their own vehicles.
- Authenticated or anon users can submit inquiries, but rate limiting should happen at the Next route handler level.
- Only admins can create vehicle imports, process imports, update vehicles, or read all inquiries.
- Service role is used only in Next server code and scripts.

Example policies:

```sql
alter table vehicles enable row level security;
create policy "public reads active vehicles"
on vehicles for select
using (status = 'active');

alter table vehicle_images enable row level security;
create policy "public reads vehicle images"
on vehicle_images for select
using (
  exists (
    select 1 from vehicles v
    where v.id = vehicle_images.vehicle_id
    and v.status = 'active'
  )
);

alter table saved_vehicles enable row level security;
create policy "users read own saved vehicles"
on saved_vehicles for select
using (auth.uid() = user_id);

create policy "users insert own saved vehicles"
on saved_vehicles for insert
with check (auth.uid() = user_id);

create policy "users delete own saved vehicles"
on saved_vehicles for delete
using (auth.uid() = user_id);
```

Admin operations should use the existing `am_i_admin()` function or a server-only check with service role.

## R2 Object Strategy

Use R2 as the canonical file store for:

- Raw import CSV files.
- Processed import files.
- Vehicle images.
- Product images.
- Showcase videos/audio/models.
- Export/backups.

Recommended key structure:

```txt
imports/vehicles/raw/{yyyy}/{mm}/{importId}/{filename}.csv
imports/vehicles/processed/{yyyy}/{mm}/{importId}/normalized.json
imports/vehicles/errors/{yyyy}/{mm}/{importId}/errors.json
vehicles/images/{vehicleId}/{imageId}.webp
vehicles/placeholders/{type}.webp
products/{productId}/{variant}.webp
showcase/{chapterId}/video/{quality}/{file}
showcase/{chapterId}/audio/{file}
showcase/{chapterId}/models/{file}
```

Rules:

- Store R2 keys in Supabase, not full URLs, wherever possible.
- Generate full URLs through one media helper.
- Public static media can use public R2 URLs.
- Sensitive import files should not be publicly readable.
- Use signed URLs for admin-only import downloads.
- Keep raw CSV import files in R2 even after data is imported into Supabase.

## CSV Import Pipeline

CSV files should no longer live in `public/`.

Recommended flow:

1. Admin uploads CSV through a protected admin route.
2. Next.js route stores the raw CSV in R2.
3. Insert a `vehicle_imports` row with status `uploaded`.
4. Admin triggers processing, or processing starts immediately.
5. Server downloads/streams the CSV from R2.
6. Server parses using a robust CSV parser, not manual string splitting.
7. Normalize fields:
   - Stock type
   - Year
   - Make/model/trim
   - Price
   - Mileage
   - Body style
   - Fuel type
   - Drivetrain
   - Location
   - Image keys
8. Upsert vehicles into Supabase by `source_key` or `listing_id`.
9. Upsert vehicle image metadata.
10. Write normalized JSON and error report to R2.
11. Update `vehicle_imports` counts and status.

Import statuses:

```txt
uploaded
processing
completed
completed_with_errors
failed
cancelled
```

Important:

- Import should be idempotent.
- Do not delete old vehicles automatically unless the import source is authoritative.
- Mark missing vehicles inactive only when an import is explicitly configured as a full replacement.
- Store raw row payloads in `vehicles.raw_payload` for debugging.

## API Contracts

### GET `/api/vehicles`

Query params:

```txt
query
sort
page
pageSize
stockType
make
model
bodyStyle
fuelType
drivetrain
state
city
yearMin
yearMax
mileageMax
priceMin
priceMax
```

Response:

```ts
type VehiclesResponse = {
  items: VehicleSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: VehicleFacets;
};
```

Notes:

- Filtering and sorting should happen in Supabase/Postgres.
- The server should clamp `pageSize`.
- Recommended max `pageSize`: 48.
- Return facets for filter UI.

### GET `/api/vehicles/[vehicleId]`

Response:

```ts
type VehicleDetailResponse = {
  vehicle: VehicleDetail;
};
```

Return `404` if missing or inactive.

### POST `/api/vehicle-inquiries`

Payload:

```ts
type CreateVehicleInquiryInput = {
  vehicleId: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
};
```

Behavior:

- Validate input server-side.
- Insert into `vehicle_inquiries`.
- Log a `story_events` or dedicated marketplace event if useful.
- Rate limit by IP/session.
- Return a demo success response until real seller routing exists.

### GET/POST/DELETE `/api/saved-vehicles`

Behavior:

- Requires authenticated user.
- Reads/writes `saved_vehicles`.
- Browser can fall back to localStorage for unauthenticated preview mode if desired.

### POST `/api/admin/vehicle-imports`

Behavior:

- Requires admin.
- Accepts upload metadata or multipart file.
- Writes raw CSV to R2.
- Creates `vehicle_imports`.

### POST `/api/admin/vehicle-imports/[importId]/process`

Behavior:

- Requires admin.
- Runs import processing.
- Updates Supabase.
- Writes processed artifacts to R2.

## Vehicle Query Implementation

Current client-side helpers in `src/experience/vehicles/catalog.ts` should become shared logic only for types/formatting, or move server-side.

Recommended split:

```txt
src/lib/vehicles/types.ts
src/lib/vehicles/format.ts
src/lib/vehicles/filters.ts
src/lib/server/vehicles/queries.ts
src/lib/server/vehicles/importer.ts
```

Server query responsibilities:

- Validate and normalize query params.
- Build Supabase/Postgres query.
- Apply full-text search.
- Apply exact filters.
- Apply standard marketplace sorting:
  - Recommended
  - Price: Low to High
  - Price: High to Low
  - Newest Year
  - Oldest Year
  - Mileage: Low to High
  - Mileage: High to Low
- Return paginated results and facets.

Recommended `Recommended` sort:

- For now: `created_at desc`, then `year desc`.
- Later: add explicit `featured_score`, `is_featured`, or editorial ranking.

## Supabase Client Strategy

Create separate clients:

```txt
src/lib/supabase/browser.ts
src/lib/supabase/server.ts
src/lib/supabase/admin.ts
```

Browser client:

- Uses `NEXT_PUBLIC_SUPABASE_URL`.
- Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Only used in client components where live auth/session behavior is required.

Server client:

- Uses anon key plus request cookies when reading user session in server code.
- Used for user-scoped server reads.

Admin client:

- Uses service role key.
- Server-only.
- Used for imports, admin reads, writes that bypass RLS intentionally.

Hard rule:

- Add `import "server-only"` to server/admin modules.

## Authentication Migration

Current preview auth creates Supabase users from a username and shared access password. The current password value is shipped to browser code through Vite. In the Next version, move password validation server-side.

Recommended auth flow:

1. Client submits username/password to `/api/auth/preview-login`.
2. Server validates `ACCESS_PASSWORD`.
3. Server uses Supabase Auth to sign in or register.
4. Server returns session handling response.
5. Browser stores/uses Supabase session as appropriate.

Better long-term option:

- Keep Supabase Auth for current app continuity.
- Later replace the shared preview password with invite codes stored in Supabase.

Invite table:

```sql
create table invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
```

## Admin Architecture

Admin should become a real backend surface.

Admin capabilities:

- View users/profiles/events.
- View marketplace inquiries.
- Upload CSV imports.
- Process imports.
- See import history and errors.
- Mark vehicles active/inactive.
- Override estimated price.
- Assign/update R2 image keys.
- Feature vehicles if needed later.

Admin checks:

- Use existing `profiles.is_admin`.
- Use existing `am_i_admin()` RPC.
- Server route handlers should validate admin status before executing privileged operations.

## RAG / Chatbot Migration

Current RAG reads embedded chunks and optionally receives vehicles from client context.

Target:

- Vehicle matching for chatbot should happen server-side.
- The chatbot route should query Supabase for relevant vehicles based on extracted filters.
- Location, price, make/model, body style, fuel, drivetrain, and year should use the same server query layer as `/api/vehicles`.
- The chatbot should disclose that marketplace prices/images are demo estimates until verified data is connected.

Recommended route:

```txt
POST /api/chat
```

Responsibilities:

- Validate message.
- Retrieve knowledge context.
- Query vehicle inventory if message has vehicle intent.
- Call local Ollama or future hosted model from server side.
- Stream response if/when chat UX supports it.

Do not expose internal Ollama host directly to the browser in production.

## Media Helper Migration

Current `src/config/cdn.ts` uses `import.meta.env`.

Next version:

```txt
src/lib/media/public-url.ts
src/lib/server/r2/client.ts
src/lib/server/r2/signed-url.ts
```

Public helper:

```ts
export function mediaUrl(key: string): string {
  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL}/${key}`;
}
```

Server R2 client:

- Use S3-compatible SDK.
- Use server-only credentials.
- Support upload, download, list, delete, signed URL.

## Caching Strategy

Use caching carefully because vehicle inventory can change after imports.

Recommended:

- Cache public vehicle list responses briefly.
- Use cache tags if using cached server functions.
- Invalidate vehicle cache after imports complete.
- Product/showcase media can be cached aggressively at the CDN level.
- Admin/import routes should not be cached.

Initial safe policy:

- `/api/vehicles`: `Cache-Control: private, no-store` during migration.
- After stable: cache anonymous query responses for 60 seconds.
- R2 static assets: long immutable cache for versioned keys.

## Deployment Changes

Current `vercel.json` is configured for Vite:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Next.js migration should remove:

- `outputDirectory: "dist"`
- SPA fallback rewrite to `/index.html`

Recommended Next deployment:

```json
{
  "installCommand": "npm install --legacy-peer-deps",
  "buildCommand": "next build",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

Package scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

## Migration Phases

### Phase 0: Decision And Branch Setup

Tasks:

- Decide in-place migration vs parallel app.
- Create a long-lived branch, for example `next-backend-migration`.
- Freeze large feature work during routing/data migration.
- Document current behavior with screenshots and smoke-test steps.

Deliverables:

- Branch created.
- Migration checklist confirmed.
- Current Vite app still builds.

### Phase 1: Data Model And Supabase Migrations

Tasks:

- Add Supabase migrations for vehicles, vehicle_images, vehicle_imports, vehicle_inquiries, saved_vehicles.
- Add indexes and RLS.
- Add admin policies/functions.
- Add seed/dev migration path for current CSV data.

Deliverables:

- Supabase schema supports marketplace data.
- Local or remote Supabase migration applies cleanly.
- No frontend behavior changed yet.

### Phase 2: R2 Server Utilities

Tasks:

- Add server-only R2 client.
- Add helpers for upload/download/head/signed URL.
- Define object key helpers.
- Add scripts/checks for vehicle assets and import files.

Deliverables:

- Server can write raw CSV import files to R2.
- Server can read a CSV back from R2.
- Existing public media helper still works.

### Phase 3: Import Pipeline

Tasks:

- Move current `public/vehicles/vehicles-with-generated-images.csv` into R2 as a raw import file.
- Build importer to parse CSV from R2.
- Normalize rows.
- Upsert into Supabase.
- Store image metadata.
- Write processed/error artifacts to R2.
- Add admin-only route or script to run import.

Deliverables:

- Vehicle data exists in Supabase.
- CSV no longer needs to be publicly accessible.
- Import is repeatable.

### Phase 4: Next.js App Shell

Tasks:

- Install Next.js and required config.
- Add `app/layout.tsx`.
- Port global CSS and fonts.
- Port current root app shell.
- Replace Vite-specific APIs:
  - `import.meta.env` -> `process.env.NEXT_PUBLIC_*`
  - Vite aliases -> Next aliases
  - `index.html` metadata -> App Router metadata
- Ensure cinematic components that need browser APIs are client components.

Deliverables:

- Next app boots locally.
- Home/gate route renders.
- Existing product/showcase pages still load.

### Phase 5: Vehicle Backend APIs

Tasks:

- Implement `GET /api/vehicles`.
- Implement `GET /api/vehicles/[vehicleId]`.
- Implement `POST /api/vehicle-inquiries`.
- Implement saved vehicle APIs if keeping server persistence.
- Add validation and response types.

Deliverables:

- Vehicles UI can read from backend API.
- Detail page reads from backend API.
- Inquiry modal writes to Supabase.

### Phase 6: Vehicles UI Migration

Tasks:

- Replace CSV client loader with API data fetching.
- Keep URL search state.
- Move filtering/sorting/pagination to server API.
- Keep compare local or wire saved vehicles to Supabase.
- Replace generated client price logic with DB field `price` and `price_source`.
- Keep demo labels while data is estimated.

Deliverables:

- Vehicle marketplace no longer fetches CSV from `public`.
- Search/sort/filter behavior matches current UI.
- Detail page is deep-linkable.

### Phase 7: Auth And Events Migration

Tasks:

- Create Next-compatible Supabase browser/server/admin clients.
- Move preview password validation server-side.
- Ensure existing profile/session/story event behavior still works.
- Update event logging to optionally go through a server route for privileged logic.

Deliverables:

- Login works.
- Existing admin access still works.
- Story events continue writing to Supabase.

### Phase 8: Admin Import UI

Tasks:

- Add admin page section for vehicle imports.
- Upload CSV.
- Trigger processing.
- Display import status, counts, and errors.
- Link to raw/processed R2 artifacts through signed URLs.

Deliverables:

- Non-developer admin can refresh vehicle inventory.
- Import failures are visible and debuggable.

### Phase 9: RAG/Chatbot Server Migration

Tasks:

- Move vehicle matching into server query layer.
- Add chat route if not already server-owned.
- Hide Ollama host from browser.
- Update knowledge/embeddings flow after chunk changes.

Deliverables:

- Chatbot and marketplace use same vehicle data source.
- Location-filtered vehicle answers match UI.

### Phase 10: Cutover And Cleanup

Tasks:

- Remove public CSV.
- Remove Vite config and scripts.
- Remove SPA rewrites.
- Remove browser-only Supabase service assumptions.
- Update README/deployment docs.
- Add final smoke tests.

Deliverables:

- App deploys as Next.js.
- No CSV is publicly exposed.
- Backend APIs own vehicle data.

## Testing Plan

Unit tests:

- Vehicle query param parsing.
- Vehicle API validation.
- CSV parser/normalizer.
- Import upsert logic.
- R2 key generation.
- Media URL helpers.

Integration tests:

- Import current CSV into test Supabase.
- Query vehicles by make/model/location.
- Detail endpoint returns image metadata.
- Inquiry endpoint writes row.
- Saved vehicle endpoints enforce ownership.

Browser smoke tests:

- Preview login.
- Vehicles page search/sort/filter.
- Vehicle detail page.
- Inquiry modal.
- Saved/compare behavior.
- Admin import page.
- Product/showcase navigation.

Build checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- R2 asset check
- Supabase migration dry run

## Observability

Add structured server logs for:

- Vehicle API query duration.
- Import start/finish/fail.
- Rows inserted/updated/failed.
- R2 upload/download errors.
- Inquiry submission.
- Auth/admin denial.

Optional later:

- Store marketplace events in a dedicated `marketplace_events` table.
- Add dashboard views for inventory health.

## Rollback Strategy

The migration must be reversible until cutover is complete.

Rollback rules:

- Keep current Vite branch deployable until Next cutover is verified.
- Do not delete `public/vehicles/vehicles-with-generated-images.csv` until Supabase-backed vehicles are live.
- Keep raw CSV import files in R2.
- Imports should not destructively delete vehicle rows by default.
- Use feature flag:

```env
NEXT_PUBLIC_VEHICLES_DATA_SOURCE=supabase
```

Allowed values:

```txt
csv
supabase
```

During migration:

- `csv` can use current behavior.
- `supabase` uses backend APIs.

After cutover:

- Remove `csv` fallback.

## Key Risks

- **Routing migration risk:** The current app is state-screen driven, not route-driven. Next migration needs careful route mapping.
- **Browser-only code risk:** WebGL, audio, `window`, `localStorage`, and `document` usage must be isolated in client components.
- **Auth risk:** Current access password is browser-visible. Moving it server-side changes auth flow and must be tested thoroughly.
- **Data quality risk:** Current vehicle prices are estimated and real seller fields are masked. The UI must keep demo language until verified data exists.
- **Import risk:** CSV parsing and upserts can silently corrupt data if normalization is weak. Keep raw payloads and error reports.
- **R2 permissions risk:** Public media and private import files need different access paths.
- **Cache invalidation risk:** Vehicle imports must invalidate or bypass stale API/cache responses.

## Non-goals For First Migration

Do not include these in the first backend migration unless absolutely required:

- Real payment/booking flow.
- Real seller/dealer messaging.
- Radius search without coordinates.
- Complex recommendation ranking.
- Multi-tenant marketplace permissions.
- Replacing Supabase Auth with another auth provider.
- Rebuilding the cinematic showcase UX.

## Success Criteria

The migration is successful when:

- The app runs on Next.js App Router.
- Vehicle CSV files are no longer fetched from `public/`.
- Raw CSV imports live in R2.
- Structured vehicle data lives in Supabase.
- Vehicle list/detail APIs read from Supabase.
- Vehicle images are referenced through R2 keys/URLs.
- Inquiry submissions write to Supabase.
- Auth still works.
- Story events still write to Supabase.
- Admin can import or trigger import of vehicle CSV files.
- RAG/chatbot vehicle answers use the same data source as the UI.
- Production build succeeds.
- Current vehicle marketplace UX remains intact or improves.

## Suggested First PR Breakdown

1. **Schema PR:** Supabase migrations for marketplace tables and RLS.
2. **R2 utilities PR:** Server-only R2 client, object key helpers, import file upload/download utilities.
3. **Importer PR:** CSV import script/route that writes vehicles to Supabase.
4. **Next shell PR:** Introduce Next App Router and migrate core app shell.
5. **Vehicle API PR:** Add vehicle list/detail/inquiry APIs.
6. **Vehicles UI PR:** Switch vehicles UI from CSV to backend API.
7. **Auth/admin PR:** Move preview password validation server-side and add admin import UI.
8. **RAG PR:** Move vehicle chatbot lookup to server query layer.
9. **Cleanup PR:** Remove Vite/public CSV fallback and update deployment docs.

## Claude Code Review Questions

Ask Claude Code to specifically review:

- Whether in-place Next migration or parallel app migration is safer for this repo.
- Whether the proposed Supabase schema is too broad or missing critical constraints.
- Whether vehicle imports should run inside Next route handlers, scripts, or a separate job worker.
- Whether R2 private/public bucket separation is needed immediately.
- Whether saved vehicles should be server-backed in phase one or remain localStorage until auth UX is finalized.
- Whether the current screen-state navigation should be replaced fully by routes or adapted temporarily.
- Whether the migration should target one large branch or multiple stacked PRs.

## Plan Review Notes

The following notes were added after a critical review of this plan. They flag strengths, concerns, gaps, and a recommended alternative path. Read these before committing to execution.

### What's Strong

- **Phasing is sound.** Schema → R2 → import pipeline → app shell → APIs → UI cutover is the right order. Each phase is independently shippable.
- **Raw CSVs in R2 even after import** is correct. The first time an import goes sideways and you need the original, you'll be glad it's there.
- **Three Supabase clients (browser/server/admin) with `import "server-only"`** is the right pattern. Many teams skip the admin separation and regret it.
- **R2 keys in Supabase, not full URLs** lets you rotate CDN domains without a data migration.
- **Feature flag (`NEXT_PUBLIC_VEHICLES_DATA_SOURCE=csv|supabase`)** for cutover is exactly the right pattern.
- **Non-goals section** is honest and prevents scope creep.
- **RLS policies and `am_i_admin()` reuse** are reasonable starters.

### Concerns

#### 1. Scope is enormous

This isn't a backend migration — it's a framework migration **plus** a backend migration **plus** an admin tool **plus** a CSV import pipeline **plus** an auth refactor **plus** a chatbot refactor. Ten phases is realistic only if treated as multi-month work. If executed in two weeks, something will break badly. The plan should explicitly call out an estimated timeline range and the option to descope.

Realistic estimate for full execution: **6–8 weeks** for one experienced engineer working steadily, longer with interruptions.

#### 2. Vite → Next.js is the riskiest part and is buried in Phase 4

The codebase has WebGL, audio, cinematic showcases, lazy-loaded scenes, and screen-state navigation. Phase 4 is described in eight bullet points but is realistically 60% of the migration risk. It deserves its own sub-plan covering:

- Which components become server vs client.
- What breaks at `'use client'` boundaries.
- How Suspense interacts with the audio engine.
- How route transitions affect cinematic state.
- What happens to the many `import.meta.env` references scattered through the codebase.
- How the gate/intro flow maps to App Router metadata and layouts.

#### 3. Question this migration's necessity at all

The plan never asks: **do we actually need Next.js, or do we just need a backend?** Alternatives that should be ruled out explicitly:

- Keep Vite, add a separate Next.js or Hono API service (smaller migration, no framework swap).
- Keep Vite, use Supabase Edge Functions for the protected operations (no new framework).
- Keep Vite, add a thin serverless functions layer on Vercel (`/api` only).

The only thing in this plan that *requires* Next.js is server components for vehicle pages, and the project can live without those. SEO benefits exist but a marketplace concept demo doesn't need them yet.

**This decision deserves its own document.** See `nextjs-vs-backend-only-comparison.md` (or whatever the alternative plan is named) for an apples-to-apples comparison.

#### 4. The screen-state navigation rewrite is hand-waved

The current app uses `AppScreen` state, not routes. Switching to App Router means rewriting every navigation handler, every back button, every `playSound("nav.toX")` trigger, every gate/intro flow. That's not a phase, that's the project. The plan should detail:

- How the gate flow, showcase chapters, and product detail navigation map to routes.
- What happens to all the `onNavigateTo*` props that thread through every page component.
- Whether route transitions can preserve cinematic continuity or whether the experience becomes choppier.

#### 5. Schema is overly broad for a first migration

`vehicle_compare_sessions` and even `saved_vehicles` are speculative — the vehicles plan explicitly says compare and save are local-only demo features. Building server tables for them now is premature.

**Recommendation:** Cut these from Phase 1. Add later when there is a real authenticated user flow.

#### 6. Cache strategy is too vague

`Cache-Control: private, no-store` during migration is fine, but the "after stable: 60 seconds" plan ignores that vehicle imports invalidate everything.

**Recommendation:** Use Next's `revalidateTag` with a `vehicles` tag and call it from the import completion handler. This belongs in the plan, not a footnote.

#### 7. No mention of streaming for imports

A 1,000-row CSV is small, but if this becomes a real marketplace it'll grow to 100k+. The import path should stream from R2 → parse → batch upsert (e.g., 500 rows per batch). Loading the full CSV into memory works now and silently breaks later.

#### 8. Rate limiting is mentioned for inquiries but not implemented

"Rate limit by IP/session" is one line. Decide now:

- Vercel KV / Upstash Redis (durable, cross-instance).
- Supabase table with a check function (slower but no extra service).
- Next.js middleware with in-memory store (fastest, but per-instance only).

Without this, the inquiry endpoint is a spam vector on day one.

#### 9. No mention of Vercel AI Gateway or moving off Ollama

The chatbot phase says "hide Ollama host from browser" but doesn't address the real question: is Ollama staying in production? Self-hosted Ollama on a Linux box is fine for dev but not for a real deployment.

**Recommendation:** Mention the AI SDK + Vercel AI Gateway path as the production target, even if Ollama stays for local dev. The Gateway gives provider fallbacks, observability, and zero-data-retention without rewriting the chat code.

#### 10. No data migration path for existing Supabase data

The plan adds tables but doesn't address whether existing `profiles`, `story_events`, etc. need any changes for Next compatibility. Probably fine, but worth one line confirming nothing breaks.

#### 11. `vercel.json` example is outdated

Project config on Vercel now favors `vercel.ts` with `@vercel/config`, especially for projects with non-trivial routing/headers. The plan should use that:

```ts
// vercel.ts
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'next build',
  framework: 'nextjs',
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};
```

#### 12. Auth migration is risky and underspecified

Moving the access password server-side changes the entire login flow. The plan needs:

- What happens to existing user sessions during cutover?
- Does the Supabase user model change?
- How are stored cookies migrated?
- What's the rollback path if login breaks for existing users?

"Server returns session handling response" is one line covering several days of work.

#### 13. No mention of preview deployments for testing the migration

With this much risk, every PR should have:

- A Vercel preview URL.
- A separate Supabase branch (Supabase supports branching).
- A way to test imports against an isolated database before touching prod.

The plan doesn't mention either.

### Missing From the Plan

- **Testing strategy for the cinematic experience** during/after migration. Visual regression tests? Manual smoke test checklist?
- **Bundle size impact analysis.** Next adds significant runtime; for a cinematic site with WebGL this matters.
- **Image optimization migration.** Currently R2 is used directly; Next has `<Image>` with optimization. Decide whether to use it or bypass it for R2 directly.
- **Error tracking.** Sentry or equivalent should be added in Phase 4, not after launch.
- **Monitoring for the import pipeline** beyond logs.
- **Kill switch plan.** If the migration is halfway done and something urgent comes up, can you pause and ship from main?

### Recommendation

Before executing this plan, push back hard and ask:

1. **Do we need Next.js, or just a backend?** Document why Next is required vs. adding a small API layer to the existing Vite app.
2. **Can the vehicles backend ship before the framework migration?** Vite can call `/api/*` route handlers deployed as separate Vercel functions today. You get most of the benefits (data in Supabase, CSV in R2, server-validated inquiries) without touching the cinematic frontend.
3. **What's the actual deadline driver?** If there isn't one, this is a 6–8 week project. If there is one, scope down to "vehicles data in Supabase, CSV out of public/" and skip Next entirely for now.

The plan as written is technically competent but it's solving multiple problems at once. The phasing is good if all of it is actually needed. If not, it's three months of work for what could be one month of focused backend additions.

**See the companion document `vite-backend-only-migration-plan.md` for the alternative path.**

