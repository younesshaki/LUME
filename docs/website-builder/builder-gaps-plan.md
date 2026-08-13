# Website builder: gaps and plan

Status: agreed 2026-07-30. Four phases, each independently shippable.

Decisions taken up front:

- **Variants are first-class on `BlockDescriptor`** — not per-block enums, not
  separate block types.
- **Site chrome stays config-driven** with named layout variants. Block-based
  header/footer is explicitly deferred, not rejected.
- **Order: fix the live bug, then surface the VDP, then build variants, then
  chrome.**

---

## What is actually true today

Findings from reading the code at `2e5b09f`, not assumptions.

| Area | Reality |
|---|---|
| VDP editing | **Engine already exists.** `vehicle-detail` block is registered (`blockTypes.ts:862`), and `VehicleDetailPageRendererRoute` renders a published page with slug `vehicle` in place of the hardcoded VDP, falling back cleanly when absent. |
| VDP adoption | **Zero.** No tenant has a `vehicle` page (checked all 3 in production). Not in `defaultPages.ts`, not in `dealerPageTemplates.ts`, no UI affordance. |
| Header overlap | **Structural layout bug**, described below. |
| Header config | `TenantHeaderConfig` has exactly three fields: `maxNavItems`, `showCta`, `ctaLabel`. |
| Footer config | **None.** `SiteFooter.tsx` is fully hardcoded. (`footer-contact` is a page *block*, unrelated to site chrome.) |
| Block variants | **No concept.** 32 blocks, one design each. Sole precedent is an ad-hoc enum: `cardStyle: ["classic","notch","bento"]` on featured-vehicles. |

### The header bug, precisely

`src/components/layout/SiteHeader/SiteHeader.tsx:109`:

```tsx
<div className="hidden md:flex absolute left-1/2 -translate-x-1/2">
```

The nav is absolutely positioned and centre-translated, so it is **removed from
flex flow**. The logo (left) and the actions/visitor tab (right) reserve no
space for it. As tab count grows the nav expands in both directions from centre
and overlaps them. `overflow-hidden` on the header element (line 87) then clips
the result instead of revealing it.

`maxNavItems` allows up to 10 (`HEADER_NAV_LIMITS`), so the configuration
actively invites the failure. Overflow beyond `maxNavItems` is currently only
reachable via the mobile menu — desktop has no overflow affordance at all.

---

## Phase 1 — Header layout (fix the live bug)

Smallest change, highest visibility. Ships alone.

1. Replace the absolute-centred nav with a real three-track layout
   (`grid-template-columns: auto 1fr auto`) so the nav is a flow participant
   and the logo/actions cannot be overlapped by construction.
2. Remove the blanket `overflow-hidden`; scope any clipping to what needs it.
3. Add a measured desktop overflow ("More" menu): when the visible items do not
   fit the centre track, move the tail into a dropdown. This makes rendering
   resilient regardless of what `maxNavItems` is set to.
4. Keep `maxNavItems` as an author *preference*, no longer a correctness
   dependency.

**Verification.** Render at 1, 6, and 10 nav items across narrow/medium/wide
viewports and assert the logo, nav, and action cluster never intersect. Unit
test the fits/overflow calculation directly — geometry logic in a pure function,
not asserted through the DOM.

**Risk.** Touches the chrome every tenant renders. Mitigated by being
layout-only, with no data or config change.

---

## Phase 2 — VDP editing (surface what exists)

No new rendering capability. This is a template plus discoverability.

1. Add a `vehicle` page template to `dealerPageTemplates.ts`: a `vehicle-detail`
   block plus the blocks that belong around it (finance calculator, trade-in
   prompt, CTA banner).
2. Seed it for new tenants via `seed-default-pages.ts` / `create-tenant.ts`, the
   same path that seeds the other dealer pages.
3. Surface it in the admin Pages list as a distinct entry, and when absent offer
   an explicit **Create vehicle detail page** action.
4. Existing tenants: offer creation rather than backfilling silently. A dealer's
   live VDP should not change layout without them asking.

**UX point that matters more than the code.** This page is not *a* page — it is
the layout applied to *every* vehicle. The admin must say so plainly, and the
preview must render against a real sample vehicle. Getting this wrong invites a
dealer to write copy about one car onto all of them.

**Verification.** Create the page for one tenant, load a real
`/vehicles/:id` URL, confirm the page-builder document renders; then unpublish
and confirm the hardcoded fallback returns. Both directions, not just the happy
path.

---

## Phase 3 — Variants system (the multiplier)

This is the piece that turns "one trade-in form" into "pick a trade-in form",
and it is the machinery Phase 4 reuses.

### Shape

```ts
type BlockVariant = {
  id: string;
  label: string;
  description?: string;
  /** Bundled SVG key — not a remote URL, so it survives the artifact CSP. */
  thumbnailKey?: string;
};

type BlockDescriptor<P> = {
  // ...existing
  variants?: readonly BlockVariant[];
};
```

Every block declaring `variants` gets a reserved `variant` prop. Introduce a
`withVariants(descriptor, variants)` helper so the prop, its schema entry, and
its default are added in one place rather than hand-rolled 32 times.

### Rules

- **Unknown or missing `variant` resolves to the first declared variant.** A
  live page must never fail to render because a variant id was removed or
  renamed. Fail soft, and cover it with a test — this is the rule most likely to
  be quietly broken later.
- Switching variant **preserves props**. Shared fields keep their content; that
  is the whole advantage over separate block types.
- The renderer switches on `props.variant`; the editor gets **one** variant
  picker component used by every block.

### Rollout

Pilot on `trade-in-form` with three genuine variants (classic / three-step
wizard / compact inline), then extend to `lead-capture-form`, `hero`, and
`finance-calculator`.

Leave `cardStyle` on featured-vehicles alone for now — it is a card *style*
within one layout, not a variant of the block. Folding it in is a judgement call
worth making after the pilot, not before.

### Preview

Variant changes must propagate through `previewProtocol.ts` to the live preview
iframe, or the picker is guesswork.

**Verification.** Unit tests for validation and the unknown-variant fallback;
each variant rendered and reviewed; and a saved page confirmed still rendering
after a deploy that adds a variant.

---

## Phase 4 — Chrome variants and configuration

Built on Phase 3's variant vocabulary.

### Header

Extend `TenantHeaderConfig`:

- `variant`: `centred` | `left` | `split` | `minimal`
- `logoPlacement`, `sticky`
- `ctas`: an array of `{ label, href, style }` — replacing the single
  `showCta`/`ctaLabel` pair
- `showVisitorTab`

**Back-compat is mandatory, not optional.** Every live tenant depends on
`showCta`/`ctaLabel`. They must keep working, read as a single-CTA fallback when
`ctas` is absent. A tenant that never opens the new UI must render identically.

### Footer

New `TenantFooterConfig`, since none exists:

- `variant`: `columns` | `stacked` | `minimal`
- `columns`, `showSocial`, `socialLinks`, `legalLinks`, `showNewsletter`

### Admin

Header and Footer sections in the Website hub, each with a variant picker and
live preview — the same picker component Phase 3 introduces.

**Verification.** Every variant at 1, 6, and 10 nav items (Phase 1's resilience
is what makes this tractable). Confirm existing tenants are pixel-unchanged
until they opt in.

---

## Cross-cutting

- **Thumbnails**: bundled SVG, not remote images. Simpler, and CSP-safe.
- **Test coverage**: `src/` is the thinnest-tested area in the repo (~1:9.6
  test:code, against ~1:2.9 in `packages/*`). Phases 1 and 4 land squarely in
  it. Add tests deliberately rather than relying on the existing ratio.
- **Deferred, on purpose**: block-based header/footer. Revisit once dealers have
  used the variants and we know whether the flexibility is actually wanted.
