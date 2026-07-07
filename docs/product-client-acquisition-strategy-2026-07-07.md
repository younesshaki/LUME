# LUME Product Strategy + Admin / Website Studio Roadmap

Date: 2026-07-07  
Audience: Youness, Claude, future implementation agents  
Scope: current LUME monorepo state on `main`, with Claude actively working on admin dashboard fixes, website creation/editor, and preview improvements.

## Executive Thesis

LUME should not be sold as a website builder.

The stronger position is: **LUME is an AI sales operating system for inventory-led businesses**, starting with car dealers. The website is the visible surface, but the thing clients should pay for is the system that helps them sell more inventory with less leakage: better online presentation, faster lead response, AI-assisted qualification, follow-up discipline, and operational visibility.

Most small and mid-size dealers do not wake up wanting a CMS. They want:

- More qualified leads.
- Fewer missed WhatsApp / email / form inquiries.
- Inventory that looks premium online.
- A site they can trust before publishing.
- A simple way to understand what is working.
- Someone or something that follows up when their team is busy.

The current repo already has the skeleton of that product: multi-tenancy, public site, admin dashboard, vehicles, leads, page builder, published pages, navigation, branding, assets, bot persona, knowledge, analytics, domains, team, and onboarding. The highest-value next step is to turn these pieces into one coherent dealer-facing promise:

> “Give us your inventory. LUME gives you a premium site, an AI concierge, and a daily sales cockpit that helps you convert more buyers.”

## Current Product Evidence

The repo is no longer just a public Vite showcase. It is already a credible SaaS foundation:

- Public Vite site at the repo root, with the planned `apps/web` move already prepared on `codex/web-move`.
- Next.js admin app in `apps/admin`.
- Shared packages in `packages/*`.
- Tenant-scoped data model across vehicles, leads, pages, bot personas, domains, invites, team membership, assets, and analytics.
- Self-serve signup and onboarding are present.
- Public tenant resolution exists: subdomain first, then persisted `?tenant=`, then build default.
- Admin sidebar has a tenant-scoped “View website” link using `?tenant=<slug>&preview=lume`.
- Page storage is document + immutable revisions: `pages` and `page_revisions`.
- Public published page reads use anon-safe RPCs: `get_published_page` and `list_published_nav_pages`.
- Admin can create/edit/publish pages, reorder nav, configure header max items and CTA label, edit branding, manage assets, vehicles, leads, persona, knowledge, domains, team.
- Recent commits added dynamic header navigation and custom published pages.
- Uncommitted local work adds a real preview bridge direction: `/__preview`, `PagePreviewBridge`, and `previewProtocol`.

That is enough to impress technically. What is still missing is product sharpness: a focused buyer, a sales story, and a smaller set of high-impact workflows that feel finished.

## Recommended Market Wedge

Start with **independent used-car dealers and small premium vehicle dealers**.

Reason:

- They are inventory-led.
- Their sites are often bad or generic.
- A single lead can be valuable.
- They care about speed to lead.
- They need photos, descriptions, search, price visibility, forms, and follow-up.
- They often lack disciplined CRM operations.
- WhatsApp / phone / form response quality is uneven, especially in smaller teams.

Then expand later to adjacent inventory-heavy markets:

- Motorcycles.
- Boats.
- RVs.
- Heavy equipment.
- Real estate agencies.
- Luxury rentals.
- Furniture / design showrooms.
- Art galleries and watch dealers.

Do not generalize too early. A “website builder for everyone” competes with Wix, Shopify, Webflow, Framer, Squarespace, and WordPress. An “AI sales system for dealers” competes with fragmented, boring, expensive dealer tools and can win by being more modern, more automated, and more conversion-focused.

## The Client-Signing Feature Stack

These are ranked by their likely impact on signing paying clients.

### 1. Website Studio With True Live Preview

This is the highest trust feature.

Dealers will hesitate if they cannot see exactly what goes live. The current admin has separate `Pages`, `Navigation`, `Branding`, and `Assets` sections. That is technically clean, but product-wise the customer thinks of all of this as one thing: “my website.”

Create a new top-level admin section:

```text
/admin/[tenant]/website
```

Call it **Website Studio**.

It should combine:

- Site status.
- Live URL.
- Draft preview URL.
- Page list.
- Navigation preview.
- Branding summary.
- Asset health.
- Publish checklist.
- “Open live site.”
- “Preview draft.”

The key promise: **what you see in preview is the real public renderer, not a fake admin approximation.**

The uncommitted `/__preview` bridge is the right architectural direction. It should become the foundation of Website Studio.

### 2. AI Lead Responder / Appointment Setter

The bot should not be positioned as a chatbot. It should be positioned as a **24/7 AI sales assistant**.

Initial practical scope:

- Captures lead name, phone, email, vehicle interest, budget, financing intent, trade-in intent, preferred contact channel.
- Can answer questions using tenant inventory and tenant knowledge.
- Writes lead activity entries.
- Suggests next action to staff.
- Sends a notification to the dealer.
- Later: books appointments.

The sales story:

> “When your team is busy, LUME still answers the buyer.”

This will sign more dealers than a prettier CMS.

### 3. Follow-Up Cockpit

The admin overview and analytics are currently useful but passive. A dealer needs a daily action list.

Add a section or dashboard module:

```text
Today’s Money
```

It should show:

- New leads not contacted.
- Leads older than 15 minutes without activity.
- Leads interested in high-value vehicles.
- Leads with missing phone/email.
- Leads that asked about financing.
- Leads that should be followed up today.
- Inventory with many views but no leads.
- Vehicles with stale price or weak description.

This converts analytics into operations.

### 4. Inventory Import + Feed Health

Inventory import already exists and has become more robust. Turn it into a sales feature:

- “Upload CSV and go live today.”
- Duplicate detection.
- Replace vs append.
- Missing-photo detection.
- Missing-price detection.
- Weak-description detection.
- Dealer-specific import templates.
- “Inventory health score.”

Dealers will sign faster if onboarding feels low-risk.

### 5. One-Click Vehicle Marketing

For each vehicle, generate:

- Website description.
- Short ad copy.
- Facebook Marketplace copy.
- Instagram caption.
- Google Business post.
- WhatsApp reply snippet.
- “Why this car” sales bullets.
- Follow-up message for a lead.

This is very sellable because it saves real time.

### 6. Trust Package

Before buyers submit leads, the dealer site must feel credible.

Add a “Trust” checklist:

- Custom domain connected.
- Logo uploaded.
- Real address / phone present.
- Opening hours present.
- Financing information present.
- Warranty / guarantee block present.
- Reviews / testimonials block present.
- Legal pages present.
- SSL/domain status visible.
- Contact form tested.

This is not glamorous, but it increases dealer confidence and buyer conversion.

### 7. Outcome Dashboard

The analytics page currently reports vehicles, recent leads, price changes, lead series, inventory mix, and recent leads. That is useful. The next step is outcome framing:

- Average time to first response.
- New leads this week.
- Contacted percentage.
- Qualified percentage.
- Won/lost trend.
- Missed lead count.
- AI conversations that became leads.
- Most requested vehicles.
- Vehicles with no engagement.

The dashboard should answer: “What should I do today to sell more?”

### 8. Experience Mode vs Light Mode

Your original dual-mode vision is strong. It can become a differentiator:

- **Experience mode:** premium cinematic storytelling, rich animations, immersive vehicle presentation.
- **Light mode:** fast, direct, searchable, practical browsing.

Dealers can sell emotion and utility from the same site. Most competitors force one or the other.

Make this a real selling point:

> “A premium cinematic brand experience for high-intent buyers, with a fast light mode for people who just want inventory.”

## Admin Dashboard Audit

The admin is becoming broad enough that it needs a stronger information architecture.

Current sections:

- Overview.
- Vehicles.
- Leads.
- Analytics.
- Pages.
- Navigation.
- Assets.
- Branding.
- Domains.
- Team.
- Bot Persona.
- Knowledge.
- Platform.

The pieces are right, but the mental model is fragmented. Customers do not think “Pages + Navigation + Assets + Branding.” They think “my website.” They do not think “Bot Persona + Knowledge.” They think “my AI assistant.”

Recommended grouping:

```text
Operate
- Overview
- Leads
- Vehicles
- Analytics

Website
- Website Studio
- Pages
- Assets
- Branding
- Navigation
- Domains

AI Concierge
- Persona
- Knowledge
- Conversations / Actions later

Account
- Team
- Billing later
```

This does not require removing existing routes immediately. Start with Website Studio as the unifying surface, then keep deeper pages reachable.

## Concrete Bugs / Product Mismatches Found

### 1. Published Empty Custom Pages Redirect Home

Creating a page gives it an empty draft. Publishing an empty draft is allowed. The public renderer then sees zero renderable blocks and returns fallback. For custom pages, fallback is a redirect to `/home`.

Relevant behavior:

- `packages/db/src/pages.ts` creates pages with `EMPTY_BLOCKS_DOCUMENT`.
- `packages/blocks/src/validation.ts` allows an empty `blocks` array.
- `src/lib/pageBuilder/PageRenderer.tsx` returns fallback when `renderableBlocks.length === 0`.
- `src/lib/pageBuilder/PageRendererRoutes.tsx` uses `<Navigate to="/home" />` as custom-page fallback.

Fix:

- Block publish if a page has zero renderable blocks, or
- Render a real “This page is published but empty” state for admins in preview, and never redirect without telling the editor why.

Recommended product behavior:

- Admin publish button disabled until at least one valid block exists.
- Status badge says: “Draft empty. Add a block before publishing.”
- Public custom pages should show a 404-style page for missing slugs, not silently redirect home.

### 2. Tenant Context Makes Direct Custom URLs Fragile

The public site resolves tenant from subdomain, then `?tenant=`, then persisted localStorage, then build default. If a user publishes under tenant `dealer-a` but opens `/fall-sale` directly on the default public domain, the renderer looks for `/fall-sale` in the default tenant and redirects home.

Fix:

- Add “Open published page” in the editor that builds:

```text
/<slug>?tenant=<tenantSlug>&preview=lume
```

- In Website Studio, always show the exact tenant-scoped URL.
- Later, canonical subdomains/custom domains remove this problem.

### 3. Reserved Slug Mismatch: `showcase`

The public route layer treats `showcase` as a system screen slug, but admin validation does not reserve it.

Current mismatch:

- `src/lib/publicNav.ts` includes `showcase` in `SCREEN_SLUGS`.
- `packages/db/src/pages.ts` `RESERVED_PAGE_SLUGS` does not include `showcase`.
- `packages/blocks/src/defaultPages.ts` includes a default reserved `showcase` page.

Fix:

- Fixed 2026-07-07: `showcase` is now in `RESERVED_PAGE_SLUGS`.
- Fixed 2026-07-07: `validateNewPageSlug("showcase")` is covered in `packages/db/src/pages.test.ts`.

### 4. Pagination Disabled Links Are Not Really Disabled

The leads page uses `Button asChild disabled` wrapping a Next `Link`. That often does not prevent navigation because the child anchor remains active.

Fix:

- Fixed 2026-07-07 in leads, vehicles, and platform tables.
- The unavailable state now renders a real disabled `<Button>`.
- The available state renders `<Button asChild><Link ... /></Button>`.

### 5. `next-env.d.ts` Generated Path Drift

Earlier verification showed `apps/admin/next-env.d.ts` can be dirtied by build because the generated import path flips between `.next/dev/types/routes.d.ts` and `.next/types/routes.d.ts`.

Fix:

- Normalize the committed file to the path Next expects after `next build`, or
- Stop tracking generated drift if appropriate.

This is not a product blocker, but it creates dirty worktrees and slows collaboration.

### 6. Header CTA Is Too Limited

Navigation settings allow CTA label and show/hide, but the CTA target is effectively contact.

Fix:

- Add CTA target config:
  - contact.
  - custom page.
  - external URL.
  - lead form.
  - phone.
  - WhatsApp later.

This matters because dealers will want “Book test drive,” “Call now,” “Get financing,” or “Sell us your car.”

### 7. Preview Must Stop Being Split Between Approximation and Real Renderer

The existing committed `DraftPreviewPanel` uses hand-maintained preview blocks. The uncommitted preview bridge moves toward the correct solution: public `/__preview` route renders real block components streamed over `postMessage`.

Fix:

- Finish replacing approximation preview with iframe preview.
- Use `buildPreviewUrl(publicSiteBaseUrl, tenantSlug)`.
- Stream current draft blocks on every edit.
- Include mode selector: standard / experience.
- Include viewport selector: desktop / tablet / mobile.

## Website Studio Proposal

### Route

```text
/admin/[tenant]/website
```

### First Screen

The first screen should not be a generic dashboard. It should answer:

- Is my site live?
- What URL do I share?
- What changed since last publish?
- What must I fix before publishing?
- What does it look like?

Suggested layout:

```text
Website Studio

[Live status] [Preview draft] [Open live site] [Publish changes]

Site Health
- Domain connected
- Logo set
- Contact info present
- Inventory imported
- Lead form tested
- AI concierge enabled
- Pages published

Preview
- iframe of the actual public renderer
- desktop/tablet/mobile switch
- experience/light mode switch

Pages
- Home
- Vehicles
- Contact
- Custom pages

Recent changes
- Draft differs from published
- Last published by / at
```

### Editor Model

Do not start with freeform drag-and-drop.

Start with structured composition:

- Add block.
- Remove block.
- Reorder block.
- Edit block props.
- Preview exact result.
- Publish with confidence.

Freeform canvas editing is expensive and easy to make unreliable. Dealers need speed and trust more than pixel-level control.

### Later Drag-and-Drop Path

Build toward drag/drop in layers:

1. Drag to reorder sections.
2. Drag from palette into section list.
3. Click block in iframe to select it in inspector.
4. Highlight selected block in iframe.
5. Add drop zones between blocks in iframe.
6. Allow responsive variant controls.
7. Only much later: nested elements inside blocks.

This avoids becoming Webflow before the core business model is proven.

## Exact Preview Architecture

The correct architecture is:

```text
Admin editor
  -> iframe src: public-site /__preview?tenant=<slug>&preview=lume
  -> postMessage current draft document
  -> public preview route renders PageBlocksView
  -> same block registry, same CSS, same media, same mode rules
```

This is better than an admin-side preview because:

- It uses the public app’s actual renderer.
- It prevents drift.
- It keeps unpublished drafts private.
- It can become the basis of drag-and-drop selection.
- It proves exactly how the dealer site will look.

Required hardening:

- Restrict accepted postMessage origins.
- Show clear connection state.
- Re-send draft after iframe ready.
- Re-send on every block change.
- Add viewport controls.
- Add mode controls.
- Add selected block protocol.
- Add visual error overlay when a block fails validation.
- Ensure the iframe loads with the correct tenant slug.

## Product Roadmap

### Phase 0: Fix Trust Breakers

Goal: make current features feel dependable.

- Fix empty published page redirect.
- Fix `showcase` reserved slug mismatch.
- Add “Open published page” links with tenant param.
- Fix disabled pagination links.
- Normalize `next-env.d.ts` generated-path drift.
- Add visible publish states:
  - Draft only.
  - Published.
  - Published with unpublished changes.
  - Published but empty.
  - Archived.
- Add a clear 404 state for unknown custom pages instead of home redirect.

### Phase 1: Website Studio MVP

Goal: make website management feel like one coherent product.

- Add `/admin/[tenant]/website`.
- Add site overview card.
- Add live URL and preview URL.
- Embed real public iframe preview.
- Add health checklist.
- Link to Pages, Branding, Assets, Navigation, Domains.
- Add publish confidence panel.

Definition of done:

- A dealer can open Website Studio and understand whether their site is ready.
- A dealer can preview their draft with the same public renderer.
- A dealer can open the exact tenant-scoped live page.

### Phase 2: Better Page Editor

Goal: make editing safe and understandable.

- Replace old approximation preview with real iframe preview.
- Add block inspector polish.
- Add block validation summary.
- Add empty page guard.
- Add one-click starter templates:
  - Landing page.
  - Promotion page.
  - Financing page.
  - About page.
  - Sell/trade-in page.
- Add revision diff summary:
  - blocks added.
  - blocks removed.
  - title/meta changed.

### Phase 3: Lead Follow-Up Cockpit

Goal: make the admin operational, not just informational.

- Add “Today’s Money” module.
- Add lead urgency scoring.
- Add next-action suggestions.
- Add stale lead warnings.
- Add lead activity timeline improvements.
- Add “mark contacted,” “qualify,” “lost reason,” “won” workflows.

### Phase 4: AI Concierge That Creates Business Value

Goal: make the bot a worker, not decoration.

- Read tenant persona.
- Read tenant knowledge.
- Read inventory.
- Capture structured lead intent.
- Write lead activities.
- Suggest follow-up.
- Later: WhatsApp/SMS/email integrations.

### Phase 5: Marketing Automation

Goal: help dealers promote inventory.

- Generate vehicle descriptions.
- Generate ad copy.
- Generate social captions.
- Generate WhatsApp replies.
- Generate follow-up sequences.
- Add weak-listing detector.

### Phase 6: Drag-and-Drop Website Editing

Goal: richer control after the structured editor is trusted.

- Drag reorder blocks.
- Palette drag into iframe.
- Select block from iframe.
- Drop zones.
- Responsive preview.
- Reusable sections.
- AI-generated sections.

## Outside-the-Box Opportunities

### AI BDC as a Service

In automotive, BDC means Business Development Center: the team that answers, qualifies, and follows up with leads.

LUME can become a lightweight AI BDC:

- Answers initial questions.
- Captures buyer intent.
- Logs lead details.
- Reminds staff.
- Suggests replies.
- Re-engages cold leads.

This can justify higher pricing than “website software.”

### Lead Resurrection

Let dealers upload old leads. LUME segments them and drafts reactivation campaigns:

- Still interested?
- New arrivals matching your interest.
- Price dropped.
- Financing available.
- Trade-in event.

This creates immediate perceived ROI.

### Inventory Autopilot

Nightly checks:

- Missing photos.
- Weak titles.
- Weak descriptions.
- Missing prices.
- Stale listings.
- Vehicles with interest but no conversion.
- Vehicles priced above similar inventory.

Then recommends actions.

### Dealer Trust Scanner

Score a dealer’s public site:

- Domain.
- Contact clarity.
- Review presence.
- Load speed.
- Inventory completeness.
- Mobile usability.
- Lead form friction.
- AI readiness.

This can be used in sales demos: “Here is what is costing you leads.”

### Competitor Radar

Later, compare against nearby dealers:

- Inventory volume.
- Price ranges.
- Site quality.
- Response experience.
- SEO visibility.

Even if initially manual or semi-automated, this is a powerful sales tool.

### Vehicle Story Pages

Each premium vehicle gets a mini landing page:

- Hero.
- Key specs.
- Why this car.
- Financing CTA.
- Trade-in CTA.
- AI Q&A.
- Similar vehicles.

This makes LUME feel much more premium than a normal inventory grid.

## Pricing Direction

Do not price like a cheap website builder.

Recommended pilot pricing:

- Setup fee: $500-$2,500 depending on service level.
- Monthly software: $499-$1,500.
- Managed AI BDC / follow-up: $1,500-$3,000+.
- Optional performance fee for booked appointments or qualified leads.

For Morocco / MENA / French-speaking markets, make WhatsApp-first workflows a core differentiator.

## Sales Demo Story

The demo should not start with “Here is the admin.”

Start with:

1. “Here is your premium public website.”
2. “Here is how a buyer asks about a car.”
3. “Here is the lead captured in admin.”
4. “Here is the AI summary and next action.”
5. “Here is today’s follow-up cockpit.”
6. “Here is how you edit the page and preview before publishing.”
7. “Here is how you import inventory.”
8. “Here is what LUME thinks you should fix to sell more.”

That story is much stronger than showing separate CRUD sections.

## Claude Execution Checklist

### Immediate Fixes

- [x] Add `showcase` to `RESERVED_PAGE_SLUGS`.
- [x] Add tests for `showcase` slug validation.
- [ ] Prevent publishing empty pages, or render an explicit empty published page state.
- [ ] Add tenant-scoped “Open published page” link in the page editor.
- [ ] Replace custom-page silent redirect with a real not-found/empty state.
- [x] Fix disabled pagination links.
- [ ] Fix `next-env.d.ts` generated path drift.

### Website Studio MVP

- [ ] Add `/admin/[tenant]/website`.
- [ ] Add Website Studio to sidebar.
- [ ] Show live URL and preview URL.
- [ ] Show site readiness checklist.
- [ ] Show published pages and their status.
- [ ] Link to Pages, Navigation, Branding, Assets, Domains.
- [ ] Embed real preview iframe using shared preview protocol.
- [ ] Add mode and viewport toggles.

### Preview Bridge

- [ ] Finish exporting `previewProtocol` from `@lume/blocks`.
- [ ] Finish public `/__preview` route.
- [ ] Replace `DraftPreviewPanel` approximation with iframe bridge.
- [ ] Send draft document over postMessage.
- [ ] Re-send on iframe ready.
- [ ] Re-send on every edit.
- [ ] Add origin restrictions.
- [ ] Add block selection message for future drag/drop.

### Dealer Growth Features

- [ ] Add “Today’s Money” lead cockpit.
- [ ] Add lead urgency scoring.
- [ ] Add AI-generated lead follow-up suggestions.
- [ ] Add inventory health score.
- [ ] Add weak listing detector.
- [ ] Add generated ad copy for vehicles.
- [ ] Add bot persona usage in chat route.
- [ ] Add knowledge upload/embedding pipeline.

## What Not To Do Yet

- Do not build a full freeform Webflow clone now.
- Do not over-generalize to all industries before signing dealers.
- Do not make analytics prettier before making them actionable.
- Do not let preview remain a hand-coded approximation.
- Do not hide publish failures behind redirects.
- Do not sell “AI chatbot” as the core value; sell recovered leads and faster sales response.

## Recommended Next 30 Days

### Week 1

- Fix page publish/preview trust breakers.
- Add Website Studio MVP.
- Finish real iframe preview path.
- Add tenant-scoped open-page links.

### Week 2

- Build “Today’s Money” lead cockpit.
- Add lead activity actions.
- Connect bot persona and knowledge more deeply.
- Add first AI-generated follow-up suggestions.

### Week 3

- Add inventory health scoring.
- Add weak-listing detector.
- Add generated vehicle descriptions and ad copy.
- Prepare one polished demo tenant.

### Week 4

- Approach 3-5 real dealers.
- Offer white-glove setup.
- Measure time-to-first-lead-response, number of leads, appointments, and dealer feedback.
- Iterate on what blocks payment, not on what is technically interesting.

## Final Recommendation

The most impressive version of LUME is not a bigger admin dashboard. It is a product that makes a dealer feel:

1. Their site looks premium.
2. Their inventory is easy to publish.
3. Their leads are captured and followed up.
4. Their AI assistant is actually useful.
5. Their team knows what to do every day.
6. They can preview changes with confidence before anything goes live.

Build toward that. Website Studio and true preview fix confidence. AI lead operations create measurable value. Inventory and marketing automation make onboarding sticky. That combination gives LUME a much better chance of signing clients than trying to become a generic website builder.
