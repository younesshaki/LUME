# Vite Backend-Only Migration Plan

## Purpose

This document is the alternative to `nextjs-backend-migration-plan.md`. It defines a path that solves the same backend problems — moving CSV data out of the browser, getting structured data into Supabase, and routing media through R2 — **without** migrating the frontend off Vite.

The goal is to deliver the actual value (real backend, real data layer, server-validated writes, admin import pipeline) in a fraction of the time and risk, and to defer the framework migration to a moment when there is a real product reason for it.

## When to Choose This Plan

Choose this plan if any of these are true:

- The cinematic frontend works well today and rewriting routing/transitions is a risk you don't want to take.
- The product is still a concept/demo, so SEO, server components, and edge rendering aren't yet load-bearing.
- You want backend value shipped in weeks, not months.
- You want to keep the door open to Next.js later without locking in now.
- The team is small and a long-running migration branch would block other work.

Choose the Next.js plan instead if:

- You need server-rendered vehicle detail pages for SEO or sharing.
- You need streaming AI responses with React Server Components.
- You're committing to a real, public marketplace with growth assumptions that justify the framework cost.

## Core Idea

Keep the existing Vite SPA exactly as it is. Add a thin server layer for the things that genuinely need a server:

- Reading vehicle data from Supabase.
- Validating and writing inquiries.
- Hiding the Ollama host and access password.
- Running CSV imports against R2 + Supabase.

Everything else — routing, screen state, cinematic experience, audio system, WebGL, gate flow — stays untouched.

## Expanded Backend Direction For What Comes Next

The backend should not be designed only around the current vehicles page. The next product direction is broader:

- Store reusable website components.
- Store raw and processed CSV files.
- Store user/project data.
- Make components, data, and prior user context reusable by LLM workflows called through backend APIs.
- Keep browser code out of storage credentials, service-role database access, and LLM context assembly.

The recommended architecture is:

```txt
Vite frontend
  -> backend API layer
  -> Supabase Postgres for structured truth
  -> Cloudflare R2 for files/assets/source snapshots
  -> pgvector or equivalent vector search for retrieval
  -> LLM provider API, called only from server code
```

The important rule is that the backend becomes the brain. The browser should request actions and display results, but the backend should decide:

- Which user/project data is visible.
- Which components are relevant.
- Which CSV rows or documents are relevant.
- Which files are pulled from R2.
- What compact context is sent to an LLM.
- What generated result gets stored, versioned, audited, or discarded.

This keeps the current frontend stable while creating a serious backend foundation for future AI-assisted building.

## Target Architecture

```txt
Browser (Vite SPA, unchanged)
  -> /api/* serverless functions on Vercel
  -> Supabase Postgres (structured data)
  -> Cloudflare R2 (media + raw imports)
  -> Ollama / AI Gateway (server-side only)
```

Two viable backend hosts:

- **Vercel Functions** in the same repo (`/api` directory). Deploys with the Vite frontend. Recommended.
- **Supabase Edge Functions**. Tighter integration with Supabase but separate deployment and tooling.

This plan assumes Vercel Functions because it keeps the project as a single deployable unit.

## Repository Shape

The current simple shape is fine for the vehicle backend. For the broader backend, the clean long-term shape is a small monorepo:

```txt
apps/
  web/                      current Vite React app
  api/                      backend API service

packages/
  shared/                   shared TypeScript types, schemas, constants
  database/                 Supabase types, migrations, query helpers
  storage/                  R2 helpers and object key builders
  ai/                       retrieval, embeddings, prompt/context assembly
```

This can be introduced gradually. The first implementation can still use the simpler single-repo shape below, then move into `apps/` and `packages/` once the backend surface grows.

```txt
LUME/
  src/                       (Vite frontend, unchanged)
  api/                       (new — Vercel Functions)
    vehicles/
      index.ts               (GET /api/vehicles)
      [vehicleId].ts         (GET /api/vehicles/:id)
    vehicle-inquiries.ts     (POST /api/vehicle-inquiries)
    chat.ts                  (POST /api/chat)
    ai/
      context.ts             (POST /api/ai/context)
      generate.ts            (POST /api/ai/generate)
    components/
      index.ts               (GET/POST /api/components)
      [componentId].ts       (GET/PATCH /api/components/:id)
      [componentId]/
        versions.ts          (GET/POST /api/components/:id/versions)
    files/
      index.ts               (POST /api/files)
      [fileId].ts            (GET /api/files/:id)
      [fileId]/
        signed-url.ts        (POST /api/files/:id/signed-url)
    csv-imports/
      index.ts               (GET/POST /api/csv-imports)
      [importId].ts          (GET /api/csv-imports/:id)
      [importId]/
        process.ts           (POST /api/csv-imports/:id/process)
    auth/
      preview-login.ts       (POST /api/auth/preview-login)
    admin/
      vehicle-imports/
        index.ts             (POST /api/admin/vehicle-imports)
        [importId]/
          process.ts         (POST /api/admin/vehicle-imports/:id/process)
  server/                    (new — server-only code, imported by /api functions)
    supabase/
      admin.ts               (service role client)
      server.ts              (request-scoped client)
    r2/
      client.ts
      keys.ts
      signed-url.ts
    vehicles/
      queries.ts
      importer.ts
    auth/
      preview-password.ts
    components/
      queries.ts
      versions.ts
      extractor.ts
    files/
      metadata.ts
      uploads.ts
    csv/
      importer.ts
      normalizer.ts
    ai/
      context.ts
      embeddings.ts
      retrieval.ts
      llm.ts
      prompts.ts
    rateLimit.ts
  supabase/
    migrations/              (existing, extended)
  public/                    (static assets, CSV removed in Phase 4)
  vercel.ts                  (project config)
```

Rules:

- `server/` is never imported by `src/`. Enforce with an ESLint rule or a tsconfig path restriction.
- `/api/*` files import from `server/`.
- `src/` calls `/api/*` over fetch. No direct Supabase admin or R2 access from the browser.

## Backend Domains Beyond Vehicles

The backend should be organized around domains, not around individual UI screens.

Recommended backend domains:

```txt
components          reusable website components and their metadata
component_versions  immutable snapshots of component source/assets
files               R2-backed file registry
csv_imports         raw CSV files, parsed rows, import errors
projects            user/project ownership boundaries
users               profiles, roles, preferences
knowledge           documents/chunks used for retrieval
ai                  retrieval, context assembly, LLM calls, generation logs
admin               privileged import/moderation/maintenance workflows
vehicles            current marketplace dataset and APIs
```

Recommended API groups:

```txt
/api/components
/api/components/:componentId
/api/components/:componentId/versions
/api/files
/api/files/:fileId
/api/files/:fileId/signed-url
/api/csv-imports
/api/csv-imports/:importId
/api/csv-imports/:importId/process
/api/projects
/api/users/me
/api/ai/context
/api/ai/chat
/api/ai/generate
/api/admin/*
```

This lets the LLM layer reuse the same backend primitives that normal UI workflows use. Avoid building a separate "AI database" that diverges from product data.

## Environment Variables

Vite already uses `VITE_*` for browser-exposed values. Keep that. Add server-only variables that are visible only to Vercel Functions, never to Vite's bundler.

### Browser-Exposed (Vite)

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_R2_PUBLIC_BASE_URL=
VITE_ENABLE_LOCAL_CHAT=
VITE_VEHICLES_DATA_SOURCE=         (csv | api — feature flag for cutover)
```

### Server-Only (Vercel Functions only)

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
ACCESS_PASSWORD=
OLLAMA_HOST=
VEHICLE_IMPORT_SECRET=
LLM_PROVIDER=
LLM_API_KEY=
EMBEDDING_MODEL=
AI_GATEWAY_API_KEY=
```

Hard rule: any variable without the `VITE_` prefix is invisible to the bundler and stays server-side. Vite enforces this automatically — no extra config needed.

## Supabase Schema

Use the same schema as the Next.js plan. None of the table designs depend on Next. Apply migrations the same way.

Recommended trim for the first ship:

- `vehicles` — full schema as in the Next plan.
- `vehicle_images` — full schema.
- `vehicle_imports` — full schema.
- `vehicle_inquiries` — full schema.
- **Skip** `saved_vehicles` until authenticated user flows are real. Use `localStorage` in the meantime.
- **Skip** `vehicle_compare_sessions` until there's a real reason to persist compare server-side.

Apply RLS as in the Next plan. The Vite frontend uses the existing Supabase browser client (anon key) for reads that benefit from realtime/auth, but vehicle reads should go through `/api/vehicles` so the server can shape responses, paginate, and add facets cleanly.

## Extended Supabase Schema For Components, CSVs, And LLM Reuse

Do not store reusable website components only as files. Store both:

```txt
R2
  raw source files
  generated previews
  screenshots
  CSV originals
  export artifacts
  backups

Supabase
  metadata
  ownership
  version history
  R2 object keys
  extracted searchable text
  props/dependency schemas
  embedding/chunk references
  audit events
```

Recommended first tables:

```txt
projects
components
component_versions
component_assets
files
csv_imports
csv_rows
knowledge_documents
knowledge_chunks
embedding_jobs
llm_sessions
llm_messages
llm_tool_calls
audit_events
```

### Projects

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Components

```sql
create table components (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  type text not null default 'website_component',
  framework text not null default 'react',
  description text,
  tags text[] not null default '{}',
  current_version_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index components_project_id_idx on components(project_id);
create index components_tags_idx on components using gin(tags);
```

### Component Versions

Component versions should be immutable. A new edit creates a new version instead of overwriting the old one.

```sql
create table component_versions (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references components(id) on delete cascade,
  version integer not null,
  source_r2_key text not null,
  preview_image_r2_key text,
  extracted_text text,
  props_schema jsonb not null default '{}',
  dependencies jsonb not null default '{}',
  compiled_metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(component_id, version)
);

alter table components
add constraint components_current_version_fk
foreign key (current_version_id) references component_versions(id);
```

### Component Assets

```sql
create table component_assets (
  id uuid primary key default gen_random_uuid(),
  component_version_id uuid not null references component_versions(id) on delete cascade,
  file_id uuid,
  r2_key text not null,
  asset_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

### Files

`files` is the central registry for anything stored in R2.

```sql
create table files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  r2_key text not null unique,
  bucket text not null,
  filename text not null,
  content_type text,
  size_bytes bigint,
  visibility text not null default 'private',
  checksum text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index files_project_id_idx on files(project_id);
create index files_visibility_idx on files(visibility);
```

### CSV Imports And Rows

The existing vehicle import model can be generalized for future CSV datasets.

```sql
create table csv_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  file_id uuid references files(id) on delete set null,
  dataset_type text not null,
  status text not null default 'uploaded',
  rows_total integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_failed integer not null default 0,
  error_summary jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table csv_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references csv_imports(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  row_number integer not null,
  normalized_payload jsonb not null default '{}',
  raw_payload jsonb not null default '{}',
  searchable_text text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index csv_rows_import_id_idx on csv_rows(import_id);
create index csv_rows_project_id_idx on csv_rows(project_id);
```

### Knowledge And Embeddings

Use Supabase `pgvector` first unless scale proves it is not enough.

```sql
create extension if not exists vector;

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  title text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  metadata jsonb not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index knowledge_chunks_project_id_idx on knowledge_chunks(project_id);
create index knowledge_chunks_embedding_idx on knowledge_chunks using ivfflat (embedding vector_cosine_ops);
```

The embedding dimension must match the chosen embedding model. If the model changes, add a new embedding column/table or re-embed in a controlled migration.

### LLM Sessions And Audit Trail

```sql
create table llm_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  purpose text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table llm_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references llm_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table llm_tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references llm_sessions(id) on delete cascade,
  tool_name text not null,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

## Component Storage Strategy

When a user stores a website component, the backend should:

1. Validate the user/project permissions.
2. Store raw source files or a zipped source snapshot in R2.
3. Store previews/screenshots/assets in R2.
4. Insert or update the `components` record.
5. Create an immutable `component_versions` row.
6. Extract searchable text from source, props, dependencies, notes, and metadata.
7. Create or update knowledge documents/chunks for retrieval.
8. Queue embedding generation.

Example storage split:

```txt
R2 key
  components/{projectId}/{componentId}/versions/{version}/source.zip
  components/{projectId}/{componentId}/versions/{version}/preview.webp
  components/{projectId}/{componentId}/versions/{version}/metadata.json

Supabase
  components.name
  components.tags
  component_versions.source_r2_key
  component_versions.props_schema
  component_versions.dependencies
  knowledge_chunks.content
  knowledge_chunks.embedding
```

The LLM should generally retrieve metadata and extracted snippets first. Only fetch full source from R2 when the model needs to modify, inspect, or regenerate the component.

## General File And CSV Storage Strategy

All uploaded files should go through the backend:

```txt
browser
  -> POST /api/files or signed upload init
  -> R2 object
  -> files row in Supabase
```

For CSVs:

```txt
browser/admin
  -> upload CSV
  -> raw file in R2
  -> csv_imports row
  -> process/import route
  -> parsed rows in csv_rows or domain-specific tables
  -> knowledge chunks for LLM retrieval when appropriate
```

Raw CSV files should stay in R2 permanently unless there is a legal/user deletion reason. Parsed rows can be re-generated from raw files if importer logic changes.

## LLM Retrieval And Generation Flow

The browser should never assemble LLM context directly. It should send a request to the backend, and the backend should retrieve context.

Recommended flow:

```txt
User asks LLM to build, reuse, or inspect something
  -> frontend calls /api/ai/chat or /api/ai/generate
  -> backend validates user/session/project
  -> backend classifies intent
  -> backend searches components, CSV rows, docs, vehicle data, and user/project context
  -> backend fetches R2 source/assets only when needed
  -> backend builds a compact context packet
  -> backend calls the LLM provider API
  -> backend stores messages, tool calls, generated files, and audit events
  -> frontend displays response
```

Retrieval priorities:

1. Current project context.
2. User-owned components and component versions.
3. Project CSV rows and imported datasets.
4. Existing docs and brand guidelines.
5. Vehicle/product data when the user intent requires it.
6. Global reusable templates only after project-specific context.

The backend should expose a debug endpoint for development:

```txt
POST /api/ai/context
```

This endpoint returns the retrieved context without calling the LLM. It makes it much easier to debug why the LLM reused the wrong component or ignored a CSV row.

## LLM Provider Strategy

Keep LLM calls server-side behind a small adapter:

```txt
server/ai/llm.ts
server/ai/providers/openai.ts
server/ai/providers/anthropic.ts
server/ai/providers/ollama.ts
server/ai/providers/vercel-ai-gateway.ts
```

Local development can keep Ollama. Production should be able to use a hosted provider or Vercel AI Gateway without changing frontend code.

The backend should log:

- provider
- model
- input token estimate
- output token estimate
- retrieval sources used
- latency
- errors
- generated artifact IDs

Do not expose provider keys, Ollama hosts, retrieval internals, or R2 signed URLs directly to the browser unless the route explicitly authorizes that access.

## R2 Strategy

Identical to the Next plan. R2 is independent of frontend framework choice:

- `imports/vehicles/raw/{yyyy}/{mm}/{importId}/{filename}.csv`
- `imports/vehicles/processed/{yyyy}/{mm}/{importId}/normalized.json`
- `vehicles/images/{vehicleId}/{imageId}.webp`
- `vehicles/placeholders/{type}.webp`
- `components/{projectId}/{componentId}/versions/{version}/source.zip`
- `components/{projectId}/{componentId}/versions/{version}/preview.webp`
- `components/{projectId}/{componentId}/versions/{version}/metadata.json`
- `csv/{projectId}/{importId}/raw/{filename}.csv`
- `csv/{projectId}/{importId}/processed/normalized.json`
- `csv/{projectId}/{importId}/errors/errors.json`
- `ai/{projectId}/generations/{sessionId}/{artifactId}`

Public media uses public R2 URLs through the existing `src/config/cdn.ts` helper. Private import files are accessed only via signed URLs generated server-side.

## CSV Import Pipeline

Same flow as the Next plan, hosted on Vercel Functions instead of Next route handlers:

1. Admin uploads CSV to `POST /api/admin/vehicle-imports`.
2. Function streams the CSV to R2 and creates a `vehicle_imports` row.
3. Admin triggers `POST /api/admin/vehicle-imports/:id/process`.
4. Function streams the CSV from R2, parses, normalizes, and batch-upserts to Supabase.
5. Writes processed/error artifacts back to R2.
6. Updates the import row.

**Streaming + batching is mandatory** even for the current 1,000-row CSV. The cost is small now and it scales without rewrites. Use a streaming CSV parser (`csv-parse` or `papaparse` in stream mode), batch upserts in groups of 500, and `revalidate` any cached vehicle responses after completion.

Vercel Functions have a 300s default timeout on all plans, which is more than enough for the current dataset. If imports ever exceed that, move processing to a queue (Vercel Queues or a separate worker) — but don't build for that need until it exists.

## API Contracts

Identical contracts to the Next plan. The only difference is the host (Vercel Functions vs Next route handlers). All shapes, query params, and response types match so the eventual upgrade path to Next is a copy/paste with minor adjustments.

- `GET /api/vehicles` — list with filters, sort, pagination, facets.
- `GET /api/vehicles/:vehicleId` — detail.
- `POST /api/vehicle-inquiries` — validated, rate-limited.
- `POST /api/auth/preview-login` — server-validated access password.
- `POST /api/chat` — RAG + Ollama, server-only.
- `POST /api/admin/vehicle-imports` — admin upload.
- `POST /api/admin/vehicle-imports/:importId/process` — admin trigger.

## Vehicles UI Migration (Frontend Side)

Smaller than the Next plan because routing and rendering don't change.

In `src/experience/vehicles/catalog.ts`:

- Keep type definitions and formatters.
- Replace `loadVehicles()` (CSV fetch) with `fetchVehicles(filters)` that calls `/api/vehicles`.
- Move `filterVehicles`, `sortVehicles`, and `searchVehicles` to the server. The browser sends params, the server returns filtered results and facets.

Behind a feature flag (`VITE_VEHICLES_DATA_SOURCE=csv|api`):

- `csv`: keeps current behavior for safety during migration.
- `api`: routes through the new backend.

Once the API path is verified, flip the flag and remove the CSV path.

The vehicles UI components (`VehiclesPage`, filters, cards) stay almost untouched. The only change is the data source hook.

## Auth Migration

Move the access password to the server with one new endpoint:

```txt
POST /api/auth/preview-login
  body: { username, password }
  returns: { session } from Supabase
```

The browser client sends the credentials, the server validates `ACCESS_PASSWORD` (now server-only) and uses Supabase Auth to sign the user in. The browser stores the returned session like before.

This is a one-day change, not a multi-phase migration. Existing user sessions continue working because the Supabase auth model isn't changing.

## RAG / Chat Migration

Move `src/lib/ragService.ts` server-side as `server/chat/rag.ts`, exposed via `POST /api/chat`. The Vite frontend sends the user's message; the server runs the RAG pipeline, queries Supabase for vehicles when intent is detected, and calls Ollama (or Vercel AI Gateway later) from server code.

Benefits:

- Ollama host is hidden.
- Vehicle answers use the same Supabase data as the UI — no divergence.
- Future swap to a hosted model (DeepSeek, Claude, etc.) is a one-file change.

The frontend `OllamaChat.tsx` component changes from "call Ollama directly" to "call `/api/chat`." Streaming via Server-Sent Events is straightforward on Vercel Functions if needed later.

## Migration Phases

The vehicle migration phases below are still valid. For the broader backend direction, add the component/file/AI foundation as a parallel track after the core server layer is in place.

### Phase 1: Schema And RLS (1–2 days)

- Add Supabase migrations for `vehicles`, `vehicle_images`, `vehicle_imports`, `vehicle_inquiries`.
- Add indexes, full-text search vector, RLS policies.
- No frontend or API changes yet.

### Phase 2: R2 Server Utilities (1 day)

- Add `server/r2/client.ts`, `server/r2/keys.ts`, `server/r2/signed-url.ts`.
- Verify upload/download/signed URL from a local script.
- No production traffic involved.

### Phase 3: Import Pipeline (3–5 days)

- Move existing CSV into R2 as a raw import object.
- Build streaming importer in `server/vehicles/importer.ts`.
- Add `POST /api/admin/vehicle-imports` and `.../[importId]/process`.
- Run the import once. Verify Supabase has all 1,000 rows.
- CSV stays in `public/` for now as a safety net.

### Phase 4: Vehicle Read APIs (2–3 days)

- Add `GET /api/vehicles` with filters, sort, pagination, facets.
- Add `GET /api/vehicles/:vehicleId`.
- Add `POST /api/vehicle-inquiries` with validation and rate limiting.

Validation: zod or similar.
Rate limiting: Upstash Redis (free tier) keyed by IP, 5 requests/min for inquiries.

### Phase 5: Vehicles UI Cutover (2–3 days)

- Add `VITE_VEHICLES_DATA_SOURCE` flag.
- Add `fetchVehicles(filters)` API client.
- Update `VehiclesPage` and `VehicleDetailPage` to use the API path when flag is `api`.
- Verify behavior matches CSV path.
- Flip flag in production. Monitor.

### Phase 6: Auth + Chat Server-Side (2–3 days)

- Add `POST /api/auth/preview-login`. Move `ACCESS_PASSWORD` server-only.
- Move `ragService.ts` to `server/chat/rag.ts`. Add `POST /api/chat`.
- Update `OllamaChat.tsx` to call `/api/chat` instead of Ollama directly.
- Remove `OLLAMA_HOST` from browser-exposed env.

### Phase 7: Admin Import UI (3–5 days)

- Add an admin section for vehicle imports inside the existing admin page.
- Upload form, status display, error log links via signed R2 URLs.
- Reuses existing `am_i_admin()` check on the server.

### Phase 8: Cleanup (1 day)

- Remove `public/vehicles/vehicles-with-generated-images.csv`.
- Remove the `csv` branch of the data-source flag.
- Update README and deployment docs.
- Run full smoke test.

**Total realistic timeline: 2–4 weeks of focused work** vs. 6–8 weeks for the Next.js plan.

## Broader Backend Build Order For Components, CSVs, Users, And LLMs

Once the server foundation exists, build the AI-ready backend in this order:

### Track A: Backend Foundation

- Add `/api` function conventions.
- Add shared validation helpers.
- Add request auth/session helpers.
- Add Supabase admin client.
- Add R2 client and file metadata registry.
- Add rate limiting and structured logging.

Deliverable: backend routes can safely read/write Supabase and R2 without exposing server credentials to the browser.

### Track B: File Storage Layer

- Implement `POST /api/files`.
- Implement signed upload/download URLs.
- Store file metadata in `files`.
- Support public/private visibility.
- Add object key helpers for components, CSVs, previews, and generated artifacts.

Deliverable: any future feature can store files in R2 and reference them through Supabase.

### Track C: Component Storage

- Add `projects`, `components`, `component_versions`, and `component_assets`.
- Add component create/update/version endpoints.
- Store source snapshots in R2.
- Store metadata, props schema, dependencies, and extracted text in Supabase.
- Treat versions as immutable.

Deliverable: website components can be stored, versioned, searched, and later reused by an LLM.

### Track D: General CSV Storage

- Add generic `csv_imports` and `csv_rows`.
- Store raw CSVs in R2.
- Parse and normalize rows server-side.
- Keep row payloads for debugging and LLM retrieval.
- Allow domain-specific importers, such as vehicles, to write into their own structured tables.

Deliverable: CSV files are no longer loose assets; they become managed datasets.

### Track E: Knowledge And Embeddings

- Add `knowledge_documents` and `knowledge_chunks`.
- Add embedding generation jobs.
- Chunk component source, component metadata, CSV rows, docs, and brand/project notes.
- Store embeddings in Supabase `pgvector`.
- Add vector search helpers scoped by project/user permissions.

Deliverable: backend can retrieve relevant reusable context before calling an LLM.

### Track F: LLM API Layer

- Implement `POST /api/ai/context` for retrieval debugging.
- Implement `POST /api/ai/chat`.
- Implement `POST /api/ai/generate`.
- Add provider adapter layer for Ollama/local dev and hosted providers in production.
- Store sessions, messages, tool calls, generated artifacts, and audit events.

Deliverable: LLM calls become backend-owned and can reuse components, CSV rows, files, and project context safely.

Recommended timeline for this broader backend after the vehicle backend foundation:

| Scope | Estimate |
|---|---:|
| File storage + metadata registry | 2–4 days |
| Component storage + versioning | 4–7 days |
| Generic CSV storage/imports | 3–5 days |
| Knowledge chunks + embeddings | 4–7 days |
| LLM context/chat/generate APIs | 5–10 days |
| Admin/debug surfaces for all of the above | 5–10 days |

Total for a useful first version: **3–5 focused weeks** after the basic backend foundation is in place.

Total for a production-hardened version with admin tools, monitoring, and strong permission coverage: **6–8 calendar weeks**.

## Deployment

Existing `vercel.json` keeps SPA fallback for the Vite frontend. Add a `vercel.ts` for cleaner config and to declare functions:

```ts
// vercel.ts
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/(.*)', destination: '/api/$1' },
    { source: '/(.*)', destination: '/index.html' },
  ],
  functions: {
    'api/admin/vehicle-imports/[importId]/process.ts': {
      maxDuration: 300,
    },
  },
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

Crucial: the `/api/(.*)` rewrite **must come before** the SPA fallback or every API call will return `index.html`.

## Caching

Simpler than the Next plan because Vercel Functions don't have built-in cache tags.

- `GET /api/vehicles`: `Cache-Control: private, no-store` during migration. Later, switch to `s-maxage=60, stale-while-revalidate=300` for anonymous queries.
- After successful imports, send a `purge` request to Vercel's cache via the dashboard or API. Or use a versioned cache key (`?v=<importId>`) on the client.
- R2 static assets: long immutable cache for versioned keys (already the case).

If cache invalidation gets complex, that's a real signal to consider Next.js for `revalidateTag`. But for the current scale, manual purge or short TTL is fine.

## Rate Limiting

Use Upstash Redis (free tier covers more than enough for a demo) via the official SDK. Wrap inquiry and chat endpoints:

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 m"),
});
```

Per-IP key. Reject with `429` and a `Retry-After` header.

## Monitoring And Observability

- Use Vercel's built-in function logs for the first phase.
- Add structured logs for import start/finish/fail, rows processed, R2 errors.
- Add Sentry (free tier) for error tracking on both `src/` and `server/`. One-day setup.
- Log inquiry submissions to a `marketplace_events` Supabase table if useful.

## Testing

- **Unit tests:** Vitest for query param parsing, CSV normalizer, R2 key generation, validation schemas.
- **Integration tests:** Run the importer against a Supabase branch in CI; assert row counts and field correctness.
- **Browser smoke tests:** Manual checklist for vehicles search, detail, inquiry, login, admin import.
- **Build checks:** `npm run typecheck`, `npm test`, `npm run build`.

## Rollback Strategy

Same feature flag pattern as the Next plan, simpler in execution:

- `VITE_VEHICLES_DATA_SOURCE=csv` keeps the old path live.
- `VITE_VEHICLES_DATA_SOURCE=api` uses the new backend.
- Flip in Vercel env vars. Redeploy. No code changes needed for rollback.
- Keep raw CSV in R2 even after public CSV is removed.
- Imports never destructively delete rows by default.

## Comparison to Next.js Plan

| Concern | Next.js Plan | Vite Backend-Only Plan |
|---|---|---|
| Timeline | 6–8 weeks | 2–4 weeks |
| Risk to cinematic UX | High (route migration, client/server boundaries) | None (frontend untouched) |
| SEO benefits | Yes (server components) | No (still SPA) |
| Image optimization | Built-in `<Image>` | Manual via R2 |
| Streaming AI responses | Easy with RSC | Possible via SSE, slightly more code |
| Dev experience | Hot reload, but slower builds | Vite stays fast |
| Future flexibility | Already on Next | Easy to migrate later (APIs are portable) |
| Lines of code changed | Thousands | Hundreds |
| New tools/concepts to learn | Next App Router, RSC, server actions | One new directory (`/api`) |

## Migration Path to Next.js Later

Designed in: this plan does not lock you out of Next.js. If you later decide you need server components, SEO, or AI streaming:

1. Most of `server/` and `/api/` ports directly to Next route handlers (rename, move, keep logic).
2. Supabase schema, RLS, R2 keys, importer logic — all unchanged.
3. The framework migration becomes a frontend-only project with a fully working backend already in place. Risk drops dramatically.

This is the strongest argument for this plan: **it doesn't preclude Next.js, it de-risks it.**

## Risks Specific to This Plan

- **No server components** means vehicle pages remain client-rendered. Search engines won't index them. For a concept demo, this is fine.
- **No streaming SSR.** First paint is the SPA shell, then data loads. Same as today.
- **Two deployment targets within Vercel** (static SPA + functions). Not really separate, but mentally different. The `vercel.json` rewrite ordering matters.
- **Cache invalidation** is manual or short-TTL. Acceptable for current scale; revisit if traffic grows.
- **`/api/` files are isolated functions** — no shared layout, no shared metadata, no middleware-style request pipeline beyond what you build in `server/`. For the volume of endpoints in this plan, that's fine.

## Non-Goals

Same as the Next plan, plus:

- Server-rendered pages.
- Edge runtime optimizations.
- Suspense-based loading orchestration.
- React Server Components.

These are deferred, not abandoned. Move to Next.js when there's a concrete reason.

## Success Criteria

The migration is successful when:

- The app still runs on Vite with no cinematic regressions.
- Vehicle CSV files are no longer fetched from `public/`.
- Raw CSV imports live in R2.
- Structured vehicle data lives in Supabase.
- Vehicle list/detail/inquiry APIs read from Supabase.
- Auth password is server-only.
- Ollama host is server-only.
- Admin can run vehicle imports through a UI.
- RAG chatbot uses the same Supabase data as the UI.
- Production build succeeds.
- Total backend code lives in `/api/` and `server/`, never imported by `src/`.

For the broader backend direction, success also means:

- Website components are stored as versioned backend records.
- Component source and previews live in R2, with metadata in Supabase.
- CSV uploads are tracked, parsed, and reusable by project.
- User/project boundaries are enforced server-side.
- Knowledge chunks and embeddings exist for components, CSV rows, docs, and project context.
- LLM requests go through backend APIs only.
- The backend, not the browser, decides what context is sent to the LLM.
- LLM sessions, messages, tool calls, generated artifacts, and audit events are persisted.
- The frontend can ask for generation/reuse without knowing R2 keys, service-role credentials, provider keys, or retrieval internals.

## First PR Breakdown

1. **Schema PR:** Supabase migrations for vehicles, images, imports, inquiries + RLS.
2. **R2 utilities PR:** Server-only R2 client + key helpers.
3. **Importer PR:** Streaming importer + admin upload/process endpoints. CSV imported into Supabase.
4. **Vehicles API PR:** `GET /api/vehicles`, `GET /api/vehicles/:id`, `POST /api/vehicle-inquiries`.
5. **Vehicles UI cutover PR:** Feature flag + API client. Flip flag in prod.
6. **Auth + chat PR:** `POST /api/auth/preview-login`, `POST /api/chat`. Remove browser env exposure.
7. **Admin import UI PR.**
8. **Cleanup PR:** Remove public CSV, remove flag.

For the broader component/LLM backend, continue with:

9. **File registry PR:** `files` table, `/api/files`, R2 signed URLs, object key helpers.
10. **Projects/components schema PR:** `projects`, `components`, `component_versions`, `component_assets`.
11. **Component storage PR:** component create/version endpoints, source snapshots in R2, metadata extraction.
12. **Generic CSV PR:** `csv_imports`, `csv_rows`, generic importer, project-scoped datasets.
13. **Knowledge PR:** `knowledge_documents`, `knowledge_chunks`, embedding jobs, vector search helpers.
14. **AI context PR:** `/api/ai/context` retrieval debugging endpoint.
15. **AI generation PR:** `/api/ai/chat`, `/api/ai/generate`, provider adapter, session/message/tool-call logging.
16. **Admin/debug PR:** views for files, imports, components, embeddings, LLM sessions, and retrieval sources.

## Decision Recommendation

If asked to recommend one path:

- **For LUME today (concept demo, small team, cinematic UX is the value):** this plan.
- **For LUME in 6–12 months (real marketplace, growth, SEO matters):** Next.js plan, executed on top of this plan's backend.

The two plans are not mutually exclusive over time. They are mutually exclusive *right now*. Pick the one that matches the current product reality.
