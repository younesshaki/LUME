# LUME Product Vision

## What LUME Is Becoming

LUME is no longer a cinematic showcase. It is evolving into a **business management system** — a SaaS platform that businesses pay to use as their own website and operations layer.

The customer-facing website that exists today is one half of the product. The other half — currently a single `/admin` route — will grow into a full admin dashboard that customers use to run their own LUME-powered site.

---

## Two Distinct Surfaces, One Platform

### 1. The Customer-Facing Site (Public)
Cinematic, fast, deep-linkable, SEO-relevant. This is what the business's end users see — visitors browsing products, vehicles, contacting the business, exploring the showcase, interacting with the bot.

**Audience:** the business's customers / visitors
**Priorities:** performance, design polish, immersion, conversion
**Current state:** mostly built

### 2. The Admin Dashboard (Customers of LUME)
A data-heavy, form-driven, role-based application. This is where the business itself logs in to operate their site.

**Audience:** the LUME customer (business owners, managers, ops teams)
**Priorities:** data correctness, ergonomics, safety, role separation
**Current state:** placeholder — one `/admin` page today, will grow into a real app

---

## What Customers Will Do In The Admin Dashboard

### Site Configuration
- Update website design (colors, fonts, layout variants, dock variants, cinematic intensity)
- Update content on every page and every component
- Add, remove, reorder pages
- Add, remove, configure components on each page
- Upload assets (images, 3D models, video, audio)

### Inventory & Data
- Import CSV files (vehicles, products, prices)
- Edit individual records (vehicle details, product details, prices, availability)
- Bulk operations (mark inactive, update pricing, swap images)

### AI / Bot Configuration
- Configure the bot's persona, tone, and capabilities
- Tweak the RAG system: upload knowledge documents, prune chunks, retrain embeddings
- Define the **actions** the bot is allowed to perform on behalf of the visitor:
  - Navigate the visitor to a specific vehicle or product detail page
  - Filter the inventory on the visitor's behalf (by price, brand, category)
  - Trigger contact form pre-fill
  - Schedule appointments / send leads to CRM
  - Any future custom action

### Analytics & Operations
- View visitor analytics, conversion funnels, bot conversation logs
- Review and act on leads
- Monitor performance, errors, drain status

### Account & Access
- Manage team members and their roles
- Configure billing, plan, integrations
- API keys for external integrations

---

## Architectural Implications

### Multi-Tenancy
Every LUME customer has their own site, their own content, their own bot, their own users. The system must isolate tenants cleanly — by subdomain, path prefix, or both. This decision needs to be made early because it cascades into routing, auth, database schema, and asset storage.

**Provisional recommendation:** subdomain-based tenancy (`{tenant}.lume.app`) with `app.lume.app` reserved for the admin dashboard and onboarding.

### Authentication & Authorization
Real auth is required, not the current session flag. Customers log in, sessions persist, roles determine access. The admin dashboard is gated end-to-end. The public site is open but may eventually support visitor accounts (saved favorites, return-user personalization).

### Two Distinct Apps Under One Codebase
The public site and the admin dashboard share infrastructure (auth, navigation primitives, design tokens, the sound system) but have very different routing trees, data needs, and UX patterns. The architecture must keep them cleanly separated:
- Admin code must never be loaded by public site visitors (bundle isolation)
- Public site code must never be loaded by admin users (or at least lazy-loaded only when previewing)
- They may eventually need different domains / subdomains

### Data-Driven Pages and Components
Once customers can configure their own pages and components, the routing and component system must support **dynamic, customer-defined content** — not just the hardcoded screens we have today. Pages become records in a database. Components become records with configuration. The current static catalog files (`catalog.json`, etc.) eventually become a fallback / seed, not the source of truth.

### Bot As A Navigation Actor
When the bot can navigate users and filter inventory on their behalf, it needs first-class access to the navigation API. The typed `NavigateOptions` adapter that comes from the routing migration is exactly the surface the bot will call. The same applies to filter state, modal state, and any other UI action — they need typed, callable APIs.

### Storage & Asset Pipeline
CSV imports, customer-uploaded media, generated 3D models, RAG knowledge documents — all of these need a real asset and data pipeline per tenant. Currently we use Cloudflare R2 for media and Supabase for some data; this will need to be formalized with tenant isolation and quotas.

---

## What Stays True From The Current Architecture

- The cinematic experience and design language are LUME's differentiator. They stay.
- Sound triggers, transitions, the 3D viewer pattern, the Dock — all of these are part of what customers pay for.
- The current `src/experience/` directory is the right home for public-site code.
- Vite + React continues to be the right stack for the public site.
- Cloudflare R2 + Supabase remain the right primitives.

---

## What Changes

- `App.tsx` as a single screen state machine is no longer viable
- The `/admin` route as a single page is no longer viable — it becomes a sub-application
- Routing must be real and URL-based (already planned)
- Auth becomes a core concern, not a session flag
- Customer data is multi-tenant from day one of the admin build-out
- The admin dashboard is a project of comparable size to the public site

---

## Near-Term Priorities (Before The Admin Build-Out)

These are the foundations the future depends on:

1. **Routing migration** — real URLs, route-driven layout, typed navigation adapter (already planned)
2. **Tenant model** — decide and document the multi-tenancy strategy (subdomain vs path vs deferred)
3. **Auth foundation** — pick the auth solution (Supabase Auth is the natural fit), wire it into a protected `/admin/*` route tree
4. **Admin app shell** — separate routing tree under `/admin/*`, separate layout, separate bundle
5. **Data model audit** — identify which catalogs need to become tenant-scoped database tables
6. **Bot navigation contract** — once the navigation adapter exists, expose a subset of it as the bot's action API

---

## What This Means For Every Future Decision

When proposing architecture, features, or refactors, assume:
- The system has multiple tenants
- The admin dashboard will be a large, multi-page application
- Customer-configurable content is a first-class requirement
- The bot is a real actor in the UI, not a chat widget
- Code must be split between public and admin bundles
- Auth gates exist between public and admin
- This is a product that businesses pay for — robustness and correctness matter

## Note: 
- my vision is also to have a dual system that allows the users to pick between experience mode and normal mode, were experience mode has all the advanced features we're developing, I'm talking more about the visual aspect, while light mode is more lightweight for people who want the brows the website fast 

