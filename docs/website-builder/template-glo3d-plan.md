# Template Glo3D — implementation plan (Claude Code + Codex)

- **Date:** 2026-09-28
- **Owner's goal:** a sixth website template, **Template Glo3D**, finished tonight by
  Claude Code and Codex working in parallel. It ships for every tenant and is
  applied to the three demo dealerships.
- **Integration branch:** `feat/template-glo3d` (from `origin/main` `e7ab8b7ff`),
  worktree `~/Documents/LUME-glo3d`.
- **Shared log:** `~/Documents/LUME-glo3d/docs/website-builder/GLO3D_LOG.md`
  (append-only; see §9).
- **Approval:** the owner approved sourcing stock photography from the web,
  the production data writes in §7, and a production release through the
  normal `staging` → `main` flow.

---

## 1. What Template Glo3D is

A professional **automotive editorial + inventory utility** website template.
The first screen must say "this is a car dealership": real vehicle
photography, inventory, dealership information and clear conversion. It must
not say "an AI made a Tailwind landing page".

References in spirit only (never clone them): Porsche Finder, Romans
International, AutoTrader, Cars & Bids. The principles to take from them:

- strong real photography;
- a clear vehicle information hierarchy and visible prices;
- restrained typography;
- practical search and filters;
- dealership contact details;
- thin dividers, flat solid surfaces and deliberate whitespace.

It works for independent, franchise and premium dealers. The tenant's logo,
colours and photos give it personality; the template supplies the structure.

### Banned in Glo3D

- Glassmorphism and permanent backdrop blur.
- Decorative gradients: radial, aurora, blobs, gradient text or borders.
- Effects: glow, border beams, particles, meteors, animated grids, cursor
  spotlight, 3D tilt cards.
- Giant radii, pills everywhere, and floating icon circles.
- A centred-headline-with-glow hero.
- Generic "Trusted Excellence" copy.
- Motion for its own sake.

These effects stay in the other five templates. Glo3D takes a restrained
path; nothing is deleted globally.

### Visual system

| Element | Rule |
|---|---|
| Surfaces | Light mode: white / near-white. Dark mode: graphite / near-black. Occasional solid dark bands. |
| Accent | The tenant's colour (the `gold` role). The template provides only the fallback. |
| Borders | 1px neutral dividers, preferred over shadows. |
| Radius | 0–8px; cards at most 8px. No pills except real status badges. |
| Type | Existing font infrastructure. Hierarchy comes from size, weight and space. Uppercase only for tiny eyebrows and metadata. |
| Icons | `lucide-react` only, used sparingly: mileage, fuel, transmission, phone, location, calendar, search, filter, saved. |
| Motion | CSS transitions ≤150ms on hover and focus. No new animation library. Respect `prefers-reduced-motion`. |
| Contrast | Body text ≥ 4.5:1 and large text or UI ≥ 3:1, in both modes. Enforced by a test (§8). |

---

## 2. Repository facts (verified 2026-09-28)

These correct assumptions in the original brief.

1. **Templates are keyed by string, not number.** The only registry is
   `packages/types/src/siteTemplates.ts`: `SITE_TEMPLATES` with keys
   `luxury`, `capital`, `ignition`, `concierge` and `exchange`. Glo3D is key
   **`glo3d`**, display name **"Template Glo3D"**, and it is added sixth.
   `getSiteTemplate()` silently falls back to Luxury for unknown keys, so a
   key missing from the registry fails silently.
2. **There is no database constraint on template keys.**
   `site_design_revisions` and `site_design_drafts` store free text
   (1–64 chars), so **no migration is needed**.
3. **Choosing a template never touches pages.** The admin Templates section
   (`apps/admin/app/admin/[tenant]/templates/`) creates a *design* working
   draft, and publishing goes through `publish_site_design`. Pages are
   separate. Starter pages for Glo3D (§6) are an explicit, opt-in path and
   never overwrite a tenant's pages.
4. **The styling hook already exists.** `applyTenantSiteDesign()` sets
   `data-lume-template`, `data-lume-template-layout` and
   `data-lume-template-specialty` on `<html>`. Template CSS is scoped by
   these attributes in `src/experience/ui/SiteTemplates.css`,
   `src/components/site/TemplateHomeExperience/*.css` and
   `src/components/site/TemplateConversionPanel/*.css`. Glo3D adds a new
   layout value, **`automotive-editorial`**, and all Glo3D CSS is scoped to
   `[data-lume-template="glo3d"]` (or that layout). There are no global
   overrides.
5. **Every template defines both modes.** Visitors have a light/dark toggle.
   Glo3D defines full palettes for both.
6. **The gooey nav is a build-wide flag.** `VITE_ENABLE_GOOEY_NAV` is read
   at build time in `SiteHeader.tsx` and is on in production. Glo3D needs a
   **runtime** rule: gooey only when the flag is on **and** the active
   template allows it. Glo3D does not.
7. **The admin template preview is drawn from template data** (the
   `TemplatePreview` component in `TemplatesClient.tsx`), not from
   screenshots. Glo3D needs a preview rendering for the new layout.
8. **A test enforces live-preview accuracy.**
   `src/lib/pageBuilder/previewFieldCoverage.test.tsx` fails if any editor
   field has no visible effect. On 2026-09-28 the Hero's unused
   `backgroundImageKey` and `mediaUrl` fields were removed from the editor.
   New Hero media props are welcome **only together with their rendering**.
9. **Inventory search already works through the URL.** The inventory page
   reads `make`, `model`, price and new/used filters from its URL
   (`encodeVehicleUrlState`), so the search hero can link into real filters.
   No new inventory API is needed.
10. **Component sources available here:**
    - shadcn MCP, with registries `@7ovr`, `@efferd`, `@launchui` and
      `@kokonutui` in `components.json` (`@aceternity` and `@magicui` are
      registered but **banned** for Glo3D);
    - HyperUI, Flowbite (free, MIT) and Meraki UI as **copy-and-adapt**
      HTML/Tailwind.
    - Tailark's registry rejected access; use its GitHub source (MIT) if at
      all.
    - No Flowbite or Pexels MCP is configured.
    - Never use Tailwind Plus/UI (its licence forbids site builders),
      Aceternity or Magic UI. For anything found via 21st.dev, verify the
      original licence first.
11. **Template images:** a template's per-mode background is a
    `SiteBackgroundAsset` URL. Block images come through props. Media is
    served from R2 (`mediaUrl(key)`, bucket `lume`).

---

## 3. Decisions (made; don't re-litigate)

| Topic | Decision |
|---|---|
| Key / name | `glo3d` / "Template Glo3D", description: "Automotive editorial layout focused on inventory, photography, dealership information, and conversion." |
| Layout value | New `SiteTemplateVisual.layout` member: `automotive-editorial`. Visual: corners `structured`, surface `solid`, motion `measured`, heroAlignment `split`. |
| Specialty | Reuse **`test-drive`**; the primary action is `browse-inventory`. No new specialty value, so admin labels stay untouched. |
| Visibility | Available to **every tenant** in the Templates picker. |
| Default mode | Light. |
| Fallback palette | Light: background `#ffffff`, panel `#f6f7f9`, ink `#0f1115`, muted `#5b6270`, line `#e3e6eb`, gold (accent) `#1f5eff`. Dark: background `#0e1013`, panel `#161a20`, ink `#f3f5f8`, muted `#a3aab6`, line `#262b33`, gold `#5b8dff`. The tenant's accent overrides `gold`. Final values must pass the contrast test. |
| Fonts | Existing infrastructure only: a clean sans for body and headings. No new webfont unless the registry already supports it per template. |
| Hero variants | The existing `hero` block gains an optional `variant`: `classic` (the current look, default for templates 1–5), `split`, `search` and `fullBleed`. Plus optional `mediaUrl`, `mediaAlt`, `mediaPosition` and `overlayStrength`. Stored pages without `variant` render exactly as today. Glo3D's starter pages use `split`, `search` or `fullBleed`. |
| Photography | Real, licensed stock photography only: Unsplash or Pexels licence (free commercial use), or dealer-supplied. No AI images, no renders as inventory, no hotlinking. Everything goes to R2 under `templates/glo3d/`. |
| Contact / hours | Shown only where the data already exists (map-hours block, footer config). No new tenant fields and no migration tonight. |
| Fake functionality | None: no ratings, APR, history scores, 360° views or "Reserve now". The finance calculator *does* exist and may be used. |

---

## 4. Work split

The split follows file ownership, so the lanes never edit the same file.

| | **Claude Code — public rendering lane** | **Codex — assets, admin & content lane** |
|---|---|---|
| Branch / worktree | `feat/glo3d-public` · `~/Documents/LUME-glo3d-public` | `feat/glo3d-assets-admin` · `~/Documents/LUME-glo3d-admin` |
| Owns | `packages/types/src/siteTemplates.ts` (+test) · `packages/blocks/src/blockTypes.ts` (hero schema only) · `src/**` (header, footer, blocks, inventory, vehicle detail, template CSS) · `e2e/layout/**` · `playwright.layout.config.ts` | `apps/admin/**` (Templates picker preview, Design page if needed) · starter-page content (new `packages/blocks/src/glo3dStarterPages.ts` + its test) · `scripts/**` (image upload, apply-template) · R2 `templates/glo3d/*` · `docs/template-glo3d-sources.md` |
| Why | The whole public look depends on the registry and block schemas. One agent owning them avoids conflicting edits. | Image sourcing is web research plus upload work. The admin preview and starter content are data-driven and depend only on the contracts in §5. |
| Release | Public-site smoke test on production. | Runs the release (`staging` → `main`), applies Glo3D to the three demo tenants. |

If either lane needs the other's file, it posts `need:` in the log and
waits. It never edits the file.

---

## 5. Contracts (published first, so both lanes can work in parallel)

Claude publishes these by **checkpoint 1**, as a commit on
`feat/template-glo3d` that Codex rebases onto:

1. **Registry entry:** `glo3d` in `SITE_TEMPLATES` with the palette, fonts,
   visual, specialty and conversion copy from §3. It also adds
   `automotive-editorial` to the layout union.
2. **Hero schema:** `variant` (`classic` | `split` | `search` | `fullBleed`),
   plus `mediaUrl`, `mediaAlt`, `mediaPosition` (`left` | `right`) and
   `overlayStrength` (0–80). All are optional and backward compatible.
3. **Image-key contract:** the list of image slots Codex fills. These R2
   keys are `.webp`, max 2400px wide, with a 1200px variant `-1200.webp`:

   | Key | Used for | Orientation |
   |---|---|---|
   | `templates/glo3d/hero-showroom` | split / fullBleed hero (home) | landscape 3:2 |
   | `templates/glo3d/hero-road` | fullBleed hero alternative | landscape 16:9 |
   | `templates/glo3d/search-hero` | inventory search hero | wide 21:9 |
   | `templates/glo3d/dealership-exterior` | feature band: the dealership | landscape |
   | `templates/glo3d/service-bay` | feature band: service | landscape |
   | `templates/glo3d/financing-desk` | feature band: financing | landscape |
   | `templates/glo3d/trade-in-keys` | trade-in CTA / band | landscape |
   | `templates/glo3d/delivery-handover` | trust / about | landscape |
   | `templates/glo3d/detail-interior` | gallery | landscape |
   | `templates/glo3d/detail-wheel` | gallery | square-ish |
   | `templates/glo3d/detail-headlight` | gallery | square-ish |
   | `templates/glo3d/team` | about / team page | landscape |
   | `templates/glo3d/site-background-light` / `-dark` | template `siteBackground` (subtle, optional) | wide |

   Content: real cars and dealership settings, no people's faces front and
   centre (licence-safe), no visible third-party brand marketing, and
   neutral tones that work under any tenant accent colour.

---

## 6. Task lists

### Claude Code — public lane

- **K1 · Contracts (→ checkpoint 1).** Registry entry + test, layout value,
  and the hero schema + editor fields (§5). Also the runtime nav rule:
  `useGooeyNav = buildFlag && template.visual.layout !== "automotive-editorial"`.
- **K2 · Header and footer shell.** Keep every behaviour (logo, configured
  nav, More, CTAs, visitor button, phone menu, sticky, active page).
  - Header: HyperUI/Meraki header structure (MIT) — solid surface,
    1px bottom border, simple underline active state, one primary CTA, no
    blur or gooey.
  - Footer: HyperUI split footer (MIT) built on `footerContent()` —
    dealership name and logo, nav, contact and hours where the data exists,
    social and legal links, cookie preferences. No gradient bleed, pulsing
    dot or ornaments.
- **K3 · Hero variants.**
  - `split`: Flowbite/HyperUI split hero — eyebrow, headline, copy, one or
    two CTAs, photo.
  - `search`: Flowbite search hero — make, model, max price and new/used,
    submitting to the real inventory URL state.
  - `fullBleed`: image, restrained overlay, left-aligned copy.
  - `classic` stays pixel-identical for templates 1–5. Each new prop must
    render (the preview-field test).
- **K4 · Inventory.** Glo3D vehicle card, adapted from HyperUI "product card
  with image, price, content and details":
  - Content in order: photo 4:3 → year make model → trim → price →
    condition badge (real state only) → mileage · transmission · drivetrain
    · fuel → location → "View vehicle".
  - Card style: 1px border, radius ≤ 8px.
  - Grid, filter toolbar, sort, result count and load-more reuse the existing
    behaviour, restyled only. Applies to the `vehicle-inventory` block and
    the built-in inventory page.
- **K5 · Vehicle detail.** Flat marketplace hierarchy: gallery →
  title/trim → price → core specs → CTA cluster → dealer contact →
  finance/trade-in CTAs → full specs → description. Use separators, not
  floating cards.
- **K6 · Blocks, restyled for Glo3D.**
  - `DealershipSection`: left-aligned, action on the right, dividers.
  - `FeatureBand`: 55/45 image and text, alternating sides.
  - `cta-banner`: solid strip.
  - `announcement-bar`: flat and compact.
  - `statement-list`: numbered editorial rows.
  - `rich-text`: prose width.
  - `product-grid`: flat underline filter, no spotlight or animated pill.
  - `showcase-gallery`: flat editorial grid, lead image + two.
  - Trust and forms: flat.

  All scoped to Glo3D; the other five templates are unchanged.
- **K7 · Tests** (§8, the public side).

### Codex — assets, admin & content lane

- **C1 · Photography (start immediately; it doesn't depend on K1).**
  - Source every §5 slot from Unsplash or Pexels (their licences allow free
    commercial use). Check each photo's own page licence.
  - Convert to `.webp` at 2400px and 1200px widths and upload to R2 under
    `templates/glo3d/`, using the existing R2 tooling in `scripts/`
    (write a small idempotent upload script if needed; no secrets
    committed).
  - Verify every public URL returns 200 with the right content type.
  - Record source page URL, photographer, licence and R2 key per image in
    `docs/template-glo3d-sources.md`, which also lists the UI component
    sources (Claude appends those).
  - Post each batch of keys in the log.
- **C2 · Admin Templates picker.** Glo3D appears as the sixth card for every
  tenant, with name, description and specialty label. `TemplatePreview`
  renders the `automotive-editorial` layout credibly in dark and light: a
  split hero with the photo, a row of vehicle cards, and flat sections.
  Selecting it creates a working draft exactly like the other templates.
  Update `TemplatesClient.route.test.ts`.
- **C3 · Starter pages (after checkpoint 1).** New
  `packages/blocks/src/glo3dStarterPages.ts`, built with existing blocks and
  the §5 image keys only:
  - **Home:** announcement (optional) → hero `split` → featured vehicles
    (`featured-vehicles` / `new-arrivals`) → trust stats (only real values:
    none by default) → feature band (dealership) → vehicle search band →
    trade-in CTA → feature band (financing / service) → map-hours → CTA.
  - **Inventory:** hero `search` + `vehicle-inventory`.
  - **Vehicle layout:** `vehicle-detail` + `finance-calculator` + CTA.
  - **Contact, Trade-In, Financing:** matching existing slugs only.

  Every block must validate against its schema (test it). Expose it through
  the **existing** page-template mechanism (`DEALER_PAGE_TEMPLATES` /
  `defaultPages` pattern). It must never overwrite existing pages: it's
  offered for new or empty pages only, or through an explicit action if one
  already exists.
- **C4 · Demo tenants (after release).** On `demo-sean`, `demo-arash` and
  `demo-max`: select and publish Glo3D through the normal design path. Merge
  the header theme settings; don't replace them. Optionally replace their
  home hero with the Glo3D starter home. Their Glo3D logo and branding from
  the previous task stay. Leave `demo` untouched.
- **C5 · Release** (§10).

---

## 7. Production writes (approved)

These are the only ones:

- R2 uploads under `templates/glo3d/`;
- the three demo tenants' design (and optionally their home page) in C4.

Nothing touches `demo`, `default` or any real customer tenant. No
migrations. Never print or commit secrets. Pass credentials at run time.

---

## 8. Quality gates

On each lane branch before merging into `feat/template-glo3d`, and again on
the integration branch:

- `npm run typecheck:all`, `npm test -- --run`, `npm run build`,
  `npm run build:admin`, `npm run check:migrations`, `git diff --check`.
- **Registry:** `packages/types/src/siteTemplates.test.ts` covers `glo3d`
  (both palettes complete, unknown keys still fall back) plus a
  **contrast test** (ink/background, muted/background, accent/background,
  both modes).
- **Public (Claude):**
  - the layout matrix (`playwright.layout.config.ts`) gains a Glo3D pass:
    every header variant × 1/6/10 items × 360–1920px × light/dark,
    footers, and More menu behaviour;
  - `console-clean.spec.ts` runs home, inventory, vehicle page, contact and
    custom pages under Glo3D: zero console errors, zero failed requests;
  - the preview-field test covers the new hero props;
  - templates 1–5 are unchanged (existing suites stay green).
- **Admin (Codex):** `TemplatesClient.route.test.ts`, the starter-pages
  validity test, and the admin build.
- **Visual acceptance (both):** screenshots of home, inventory, vehicle
  page, contact and footer at 390/1024/1440px in light and dark. Review them
  against §1's banned list. If three or more banned traits appear together,
  revise. Save them to `~/Documents/LUME-glo3d/.screens/` (not committed).
- **Known flaky:** `e2e/concierge/navigate-back.spec.ts` "successive
  concierge filters…" is not a regression.

---

## 9. Shared log and checkpoints

Log: `~/Documents/LUME-glo3d/docs/website-builder/GLO3D_LOG.md`, append-only,
one line per entry:

```
- <UTC ISO> · <Claude|Codex> · <task id> · <start|done|need|blocked|note> · <one line>
```

Rules:

- Log `start` before a task and `done <commit>` after it.
- Put a `need:` for the other lane's files in the log; never edit them.
- Never rewrite another agent's line.
- Whoever finishes early takes the other lane's unstarted tasks, but only
  after posting `claim:`.

| Checkpoint | Target | Gate |
|---|---|---|
| **CP1 — contracts** | +1h | K1 merged into `feat/template-glo3d`; the first C1 image batch uploaded and its keys logged. |
| **CP2 — shells** | +3h | Header, footer and hero variants render on Glo3D (K2, K3); admin picker preview (C2); all image slots filled (C1). |
| **CP3 — feature-complete** | +5h | K4–K6 and C3 done; both lanes merged into integration; full gates green. |
| **CP4 — shipped** | +6–7h | Release (§10), demo tenants on Glo3D (C4), production smoke test, final report. |

Merging: each lane rebases on `feat/template-glo3d` and merges its own
branch in (fast-forward or merge commit; no force-push of shared branches).
Conflicts are resolved by the lane that owns the file.

---

## 10. Release (approved; Codex drives, Claude verifies)

1. Integration gates green (§8).
2. Push `feat/template-glo3d` and open a PR into `staging`.
3. Validate staging on both Vercel projects (the staging DB has `demo`;
   use the `lume-git-staging-…` alias).
4. Open a PR from `staging` to `main`, merge, and wait for both production
   deployments to be READY.
5. C4: apply Glo3D to the three demo tenants.
6. Claude runs the production smoke test on the public site, at 390 and
   1440px, light and dark:
   - all three demo sites plus one non-Glo3D tenant (`demo`), to confirm
     nothing regressed;
   - zero console errors;
   - images load;
   - nav, More and the phone menu work;
   - the vehicle page and inventory filters work.
7. If anything fails, fix forward on a branch through the same flow. Never
   force-push `main`.

---

## 11. Definition of done

- Template Glo3D is selectable by every tenant in **Admin → Templates**,
  previewable in both modes, and publishes like the others.
- Public pages under Glo3D (home, inventory, vehicle detail, contact,
  trade-in, financing, custom pages) look like a professional dealership
  site, meet the §1 rules, and pass §8.
- Templates 1–5 and all saved content render exactly as before.
- The three demo tenants run Glo3D in production with their branding and
  inventory.
- `docs/template-glo3d-sources.md` lists every sourced component and photo
  with its licence.

## 12. Final report to the owner (both agents, one message)

1. What changed.
2. Files created and modified.
3. Sourced components and photos (URL + licence).
4. How `glo3d` is registered.
5. Blocks reused and where the Glo3D variants live.
6. New dependencies (expected: none).
7. MCPs and registries used.
8. Every validation command and its result.
9. Known limitations.
10. The local dev command: `npm run dev` + `npm run dev:admin`.
11. Where to select it: **Admin → Templates → Template Glo3D**.
12. Links to the three demo sites.
