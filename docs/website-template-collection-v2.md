# Website template collection v2

## Product decision

LUME ships five built-in, source-controlled website templates:

| Key | Name | Primary dealership job |
| --- | --- | --- |
| `luxury` | Luxury | Curated premium inventory |
| `capital` | Capital | Financing confidence |
| `ignition` | Ignition | Test-drive conversion |
| `concierge` | Concierge | Appointment booking |
| `exchange` | Exchange | Trade-in conversations |

Luxury remains the compatibility default. Existing tenant designs therefore do
not change unless an authorized Admin user explicitly publishes another
template.

The additional templates are meaningfully different through an allowlisted
visual strategy, deliberate dark and light palettes, motion character, and a
product-owned conversion module. A template never replaces tenant content,
inventory, navigation, branding, domains, leads, or Page Builder revisions.

## Template contract

The runtime-safe registry in `@lume/types` is the only source of built-in
template definitions. Each definition contains:

- a stable key and version;
- shared design defaults;
- independent dark and light defaults;
- an allowlisted specialty;
- finite visual traits for layout, surfaces, corners, motion, and alignment;
- product-owned conversion copy and action identifiers.

Template action identifiers are mapped to known LUME experiences by the public
application. The registry does not accept raw routes, CSS, HTML, JavaScript, or
tenant-authored component names.

The persisted `SiteDesign` remains schema version 2. A tenant document stores
the selected template key/version plus validated design overrides. Visual and
conversion metadata remains registry-owned, so adding this collection does not
expand the trusted database document or duplicate registry data.

## Working-draft and version model

LUME keeps exactly one durable working draft for each tenant and template pair.
This is the best v1 trade-off for dealerships:

- switching templates does not discard prior customization;
- a dealer never has to understand branches or name arbitrary variants;
- autosave can protect in-progress work across browsers;
- storage remains bounded and the Templates gallery can offer a simple
  “Continue editing” state.

Published history remains independent. The existing revision system retains the
20 most recent published designs per tenant, regardless of template. Publishing
is always explicit and atomically stores the previous live design before
replacing it. Restoring a revision does not delete template drafts.

Draft writes are trusted server operations. The server resolves the authorized
tenant, validates the complete design, verifies tenant ownership of uploaded
backgrounds, and then upserts the `(tenant_id, template_key)` row. Direct browser
writes are not granted.

## Public rendering and fallbacks

The public runtime resolves the active design as follows:

1. validate the tenant document;
2. resolve its template key, falling back to Luxury for unknown keys;
3. select `modes.dark` or `modes.light` from the visitor's persisted preference;
4. merge tenant mode overrides over that template's defaults;
5. resolve background as tenant mode asset, then template mode asset, then the
   mode's safe built-in color;
6. expose the finite template key/layout metadata to product-owned components.

Only the active mode's custom background is requested. Light mode is not a
filter or inversion of dark mode; every template ships a readable light palette.
Malformed tenant data cannot select arbitrary layouts or actions and falls back
to Luxury.

## Specialty experiences

The specialty module supplements the tenant's existing home content. It does
not mutate Page Builder data.

- Capital explains the next finance step without claiming approval, rates, or
  payments that the dealership has not supplied.
- Ignition emphasizes a vehicle-specific test-drive request.
- Concierge emphasizes a prepared appointment with a dealership specialist.
- Exchange starts a dealer-reviewed trade-in conversation without presenting a
  fictitious instant valuation.
- Luxury preserves the current curated browse-and-contact posture.

All actions use existing public routes or inquiry surfaces. If a specialized
workflow is unavailable, the safe fallback is inventory browsing or the
existing contact/inquiry flow.

## Rollback and release safety

- Migration `072_site_design_drafts.sql` is additive and must be applied before
  relying on cross-device draft persistence.
- Until it is applied, published designs and the public site continue to work;
  Admin reports a draft-save error instead of publishing implicitly.
- Rolling back application code leaves the draft table unused and leaves live
  tenant themes unchanged.
- Rolling back a published design uses the existing design revision restore
  operation.
- Built-in template versions are immutable after release. A material default
  change increments that template's version rather than silently changing an
  already published design's meaning.
