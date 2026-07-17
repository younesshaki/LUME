# Website Templates v1 — Design Contract

_Status: FOUNDATION CONTRACT. Written by Claude (Phase 2) after the repository
audit. Codex must read this before starting `feature/website-templates-experience`.
Schema and registry defined here are canonical — do not redefine or duplicate them._

## 1. Audit summary (verified against the repo, 2026-07-16)

| Surface | Current reality |
|---|---|
| Theme storage | Flat `TenantTheme` JSONB in `tenants.theme` (migration `019_tenant_theme.sql`) |
| Public read | `get_tenant_theme(p_slug)` SECURITY DEFINER RPC, granted to `anon` + `authenticated` |
| Public apply | `src/lib/tenantTheme.ts` → `applyTenantTheme()` sets inline CSS vars (`--theme-lume-*`) on `<html>`; sanitizes with `safeCssValue` (≤160 chars, no `;{}`), `safePublicAssetUrl` (http/https or root-relative only) |
| Visitor mode | `src/lib/theme/theme.ts` + `ThemeContext.tsx`: `light`/`dark`/`auto` in localStorage `lume.color-theme.v1`, resolved with `prefers-color-scheme`, applied as `data-theme` on `<html>` |
| **Light mode today** | **Hard-coded `!important` block** in `src/index.css` (`:root[data-theme="light"]`) that overrides the tenant's inline variables. Tenant colors effectively apply to dark mode only; light is a fixed product palette. ~15+ public CSS files also contain hard-coded dark values |
| Admin edit | `branding/BrandingClient.tsx` updates `tenants.theme` **directly from the browser client**; RLS `tenants_update_admin` (owner/admin) is the only gate. No server-side validation, no history, immediately live |
| Ownership precedent | `themeFromBrandingForm(form, baseTheme)` spreads the base theme first so keys the editor doesn't own (`header` from Navigation) survive a save — this pattern is load-bearing and must be preserved |
| Normalization precedent | `normalizeTenantTheme()` already tolerates unknown/malformed JSON — v2 extends this pattern |
| Storage | Buckets `tenant-logos`, `tenant-media`, `tenant-csvs`, `tenant-3d-models` (013), public read on logos+media, tenant-scoped write paths, storage quota system (048). Admin has an existing Assets library section |
| Admin IA | Website hub (`/admin/[tenant]/website`) already links: Pages & content, Header & navigation, Branding & theme, Media assets, plus a live-site iframe preview (`?preview=lume`) |
| Provisioning | `packages/db/src/provisioning.ts` seeds `DEFAULT_TENANT_THEME` on tenant insert |
| Admin dashboard's own appearance | separate system (`apps/admin/lib/themeTransition.ts`) — must never be conflated with Website design in UI copy |
| Migrations | Latest before this work: `065`; Phase 1 adds `066_customer_saved_vehicle_history`, so this foundation uses `067`. Additive only |

## 2. What a template controls / does not control

A **template** is a versioned visual preset for the public website.

**Controls (v1):** shared fonts, dock variant, cinematic intensity, dark-mode
colors, light-mode colors, per-mode `siteBackground` asset slot (image +
treatment), per-mode background treatment (overlay color/opacity, position,
size).

**Never controls:** inventory, customers, leads, loyalty, domains,
integrations, dealership contact data, page content, page block order,
navigation links (`theme.header` stays Navigation-owned), published page
revisions, visitor accounts, analytics history, logo/favicons (`theme.branding`
stays tenant-owned and survives template application).

## 3. SiteDesign schema (v2 theme document)

Stored in the existing `tenants.theme` JSONB column — **no new column**. The
discriminator is `schemaVersion`. Legacy documents (no `schemaVersion`) are
normalized at read time (§6); nothing is bulk-migrated.

```ts
// packages/types/src/siteDesign.ts (canonical; names final)
type SiteDesignMode = {
  colors?: {                       // same 10 keys as TenantTheme["colors"]
    ink?: string; muted?: string; soft?: string; line?: string; gold?: string;
    background?: string; panel?: string;
    dockItemBackground?: string; dockItemColor?: string; dockItemBorder?: string;
  };
  assets?: {
    siteBackground?: SiteBackgroundAsset;   // the only v1 slot
  };
};

type SiteBackgroundAsset = {
  url?: string;                    // validated: https/http or root-relative; tenant-owned or registry asset
  position?: "center" | "top" | "bottom";
  size?: "cover" | "contain";
  overlayColor?: string;           // safeCssValue rules
  overlayOpacity?: number;         // 0..1 clamp
};

type SiteDesign = {
  schemaVersion: 2;
  template: { key: string; version: number };   // e.g. { key: "luxury", version: 1 }
  shared: {
    fonts?: { experience?: string; body?: string };
    dockVariant?: TenantDockVariant;
    cinematicIntensity?: number;               // 0..1.5 clamp (existing rule)
  };
  modes: { dark: SiteDesignMode; light: SiteDesignMode };

  // Keys NOT owned by the design editor, preserved verbatim on every save:
  header?: TenantHeaderConfig;     // Navigation section owns this
  branding?: { logoUrl?; favicon32Url?; favicon192Url? };  // Branding uploads own this
  vehiclePricing?: { showPriceReductionSignal?: boolean };
};
```

**Asset-slot allowlist** is a finite const array (`["siteBackground"]` in v1).
New slots are added by extending the array + type — never by accepting client
keys. Arbitrary CSS, JS, HTML, non-http(s) URLs, and client-supplied storage
keys are rejected by the shared validator.

**Ownership boundaries:** the design editor owns `template`, `shared`, `modes`.
It must round-trip `header`, `branding`, `vehiclePricing`, and any unknown
future keys untouched (same contract `themeFromBrandingForm` honors today).

## 4. Template registry

`packages/types/src/siteTemplates.ts` (or sibling module in `@lume/types`):
plain data + pure functions, no React/browser imports, consumable by admin and
the public app. Single source of truth — **do not duplicate defaults in either
app**.

```ts
type SiteTemplate = {
  key: "luxury";                  // union grows with future templates
  version: 1;
  name: "Luxury";
  description: string;
  defaults: { shared: SiteDesign["shared"]; modes: SiteDesign["modes"] };
};
```

**Luxury v1 defaults:**
- `shared` + `modes.dark.colors` = today's `DEFAULT_TENANT_THEME` values
  (current dark look, unchanged).
- `modes.light.colors` = the palette currently hard-coded in `src/index.css`'s
  `:root[data-theme="light"]` block (ink `#211d16`, background `#f4efe5`, panel
  `rgba(255,252,246,.88)`, etc.) — promoted from CSS into data, then improved
  where readability requires. This is a deliberate light design, not an
  inversion.
- `modes.light.assets.siteBackground` = none by default; the light background
  fallback is the flat `background` color (safe by construction). Never fall
  back to a dark photograph in light mode.
- Registry assets, if any, are shared read-only product assets.

No DB CRUD/marketplace for templates in v1 — the audit found no requirement.

## 5. Mode resolution & fallback rules (public runtime — Codex implements)

Resolution order for any mode-scoped value, deterministic:

1. tenant override for the **active mode** (`design.modes[resolved]`),
2. active template's default for that mode (registry),
3. built-in safe fallback (current `:root` defaults / flat color).

Shared values: tenant `shared` → template `shared` → built-in.

Runtime contract:
- Active mode comes from the existing `data-theme` mechanism — unchanged
  persistence, unchanged toggle.
- The `!important` light block in `index.css` is **replaced** by per-mode
  variable application (apply the resolved mode's variables when `data-theme`
  changes). Keep a CSS-only fallback for first paint to avoid a wrong-mode
  flash.
- Malformed/unknown theme JSON must resolve to full Luxury defaults, never a
  hard failure (extends the existing `normalizeTenantTheme` behavior).
- Don't eagerly download the inactive mode's background where practical.

## 6. Legacy-theme compatibility

Read-time normalization, implemented once in the shared package:

- Document with `schemaVersion: 2` → validated and used as-is.
- Legacy flat document (no `schemaVersion`) → interpreted as
  **Luxury v1 + dark-mode overrides**: `colors` → `modes.dark.colors`,
  `fonts`/`dockVariant`(+`dock.variant`)/`cinematicIntensity`(+`cinematic.intensity`)
  → `shared`; `header`/`branding`/`vehiclePricing` carried through. Light mode
  = Luxury light defaults.
- **No destructive bulk migration of tenants.** A tenant's stored document is
  upgraded to v2 only when they next save/publish through the new server op.
- Existing dark appearance must render byte-equivalent for a legacy tenant
  (test-guarded).
- New tenants: provisioning seeds a v2 Luxury document (small change in
  `packages/db/src/provisioning.ts`).

## 7. Applying a template

Selecting a template **never** mutates the live site. Sequence: select →
preview → customize modes → review → **explicit publish**.

Apply semantics (server-side): replace only template-owned values
(`template`, `shared`, `modes`) with the registry defaults; preserve
`header`, `branding`, `vehiclePricing`, unknown keys, and all non-theme tenant
data. The confirmation UI (Phase 3) must list exactly: "changes: colors, fonts,
backgrounds, dock, cinematic — keeps: logo, favicons, pages, navigation,
contact, inventory, domains."

## 8. Publishing, revisions & rollback

New table (migration `067`, additive):

```sql
site_design_revisions (
  id uuid pk,
  tenant_id uuid not null references tenants on delete cascade,
  design jsonb not null,            -- the document being REPLACED (pre-publish snapshot)
  template_key text not null,
  template_version int not null,
  published_by uuid not null,       -- auth.users id (actor)
  created_at timestamptz not null default now()
)
```

- RLS: members read own tenant's revisions; **writes only via the server
  operation** (service-role) — no direct client insert policy.
- Bounded: publish prunes to the most recent **20** revisions per tenant.
- Publish flow (single server op): validate document → snapshot current
  `tenants.theme` into revisions → write new document → prune. Restore = publish
  of a stored revision (which itself snapshots first, so restore is undoable).
- Foundation exposes the restore API; surfacing it in UI is Phase 3-optional.

## 9. Server-side authorization

All design writes (save draft/publish/apply-template/restore) move to trusted
server operations in the admin app:

- Actor resolved from the Supabase session; role checked = **owner/admin**
  (matches existing `tenants_update_admin` RLS, which remains as
  defense-in-depth). Viewers cannot publish. Editors: the branding surface is
  already owner/admin in practice — v1 keeps owner/admin and documents it.
- Tenant ID from the authorized tenant context (`getTenantForUser` pattern),
  never from the request body.
- Full document validated server-side with the shared validator (same code the
  client uses — one source of truth).
- Asset URLs must pass `safePublicAssetUrl` AND (for tenant uploads) point at
  the tenant's own storage prefix or a registry asset. No cross-tenant reuse.
- Explicit column projections; no service-role key in any client component.

## 10. Asset storage foundation

- Bucket: **`tenant-media`** (exists, public-read, quota-tracked). Not
  `tenant-logos` (logo-only model).
- Key shape: `{tenant_id}/site-design/{mode}/{slot}-{uuid}.{ext}` — generated
  server-side; client never supplies keys (no traversal).
- Validation: MIME allowlist (`image/jpeg|png|webp|avif`), size cap (≤ 8 MB),
  dimension sanity where existing utilities support it.
- **No deletion of an old object while any live design or retained revision
  still references it.** v1 policy: uploads are never auto-deleted; cleanup is
  a future maintenance task (documented limitation).

## 11. Migration & rollback plan (this release)

- `067_site_design_revisions.sql` — table + RLS + indexes. Additive; no edits
  to applied migrations.
- Applied to **staging Supabase only** during this release. **Not applied to
  production** (release rule); production apply happens with the
  staging→main promotion, after user approval.
- Rollback of the feature: the code paths normalize legacy documents at read
  time, so reverting the code restores exact current behavior; the revisions
  table is inert without the code. No destructive change to `tenants.theme`
  semantics.

## 12. Phase boundaries (who builds what)

- **Foundation (Claude, this branch):** shared types + validator, Luxury
  registry, normalization, migration 067, server read/write/apply/publish/
  restore ops, focused tests, this document. No admin design UI.
- **Experience (Codex, after foundation merges):** Templates/Design screens in
  the Website hub, mode tabs (labels must say "Website … mode" to avoid
  confusion with the Admin dashboard's own appearance), upload UX, public
  runtime mode resolution per §5, per-mode CSS-variable application replacing
  the `!important` block, light-readability fixes in the hard-coded-dark CSS
  files, Playwright journeys.
