# LUME Feature Backlog — Gaps & Opportunities

_Drafted 2026-07-18. A living list of features LUME does **not** have yet, ranked
by leverage. Grounded in the current surface (Vehicles, CRM/Leads/Customers/
Loyalty, Website design system + page builder, AI Concierge/RAG, Analytics,
Settings) and `docs/vision/product-vision.md`._

The theme: LUME is strong on **presentation** (design system, page builder, bot)
and **engagement** (saved vehicles, loyalty, Customer 360). The gaps cluster
around **getting inventory in** and **closing the loop back to the customer**.

---

## 1. Automated inventory ingestion (feed sync) — strategic must-have
**Problem.** Inventory today is CSV import + manual edits. Real dealerships keep
inventory in a DMS or syndication feed (vAuto, HomeNet, DealerCenter, marketplace
exports) that changes daily. Manual upkeep is a non-starter for real customers.

**What to build.** A scheduled connector that pulls a tenant's feed and reconciles
it against `vehicles`: add new, update changed, retire sold, and route price
changes into the existing `price_history`. Support at least one common feed format
first (CSV/URL or a named provider), with a mapping/preview step.

**Why it fits.** Everything else is polish on top of inventory. This decides
whether a paying dealer can go live at all. Leverages: `vehicles`, `price_history`,
`vehicle_images`/R2, existing CSV import as the manual fallback.

**Priority:** must-have before real customer onboarding. Larger build.

---

## 2. Saved-vehicle alerts / re-engagement — highest value-to-effort (build first)
**Problem.** A visitor saves a car and then nothing ever brings them back. The
loyalty + saved-vehicle features have no outbound loop.

**What to build.** Notifications on saved vehicles: **price dropped**, **about to
sell / status changed**, and optionally **new inventory matching saved criteria**.
Delivered by email first (in-app/visitor notifications later). A scheduled job
diffs `price_history` / vehicle status against `visitor_saved_vehicles` and sends.

**Why it fits.** Mostly wiring existing pieces: `visitor_saved_vehicles`,
`price_history`, `conversion_events`, the email infra, and loyalty. Makes the
saved-vehicle + loyalty work already shipped actually *do* something. Proven
re-engagement driver.

**Priority:** build next. Small-to-medium; no new external integrations.

---

## 3. Test-drive / appointment booking — the missing conversion event
**Problem.** The vision mentions scheduling only as a *bot action*; there's no
first-class booking flow. The funnel goes browse → save → lead form, but the metric
dealers actually care about — **booked showroom visits** — has no home.

**What to build.** A booking flow (availability, slot selection, confirmation +
reminders) tied to a vehicle and to CRM; an Admin **Appointments** view; and wire
the bot's "schedule appointment" action into it.

**Why it fits.** Completes the funnel and gives the bot a real high-value action.
Leverages: CRM/leads, Customer 360, email/notification infra, the bot action system.

**Priority:** high; medium build.

---

## Runners-up

### 4. Financing / monthly-payment calculator + pre-qualification
A payment calculator (price, down, term, APR → monthly) on the vehicle detail page,
plus a "get pre-approved" lead-capture step. Standard dealer-site conversion tool;
strong lead driver. Feeds CRM. Small-to-medium build; APR/lender data can start
static or manual.

### 5. Trade-in valuation lead magnet
A "what's my car worth?" flow (year/make/model/mileage/condition → estimate +
lead). Classic dealer lead magnet. Can start with a manual/estimated range or a
valuation API integration later. Feeds CRM. Small build (bigger with a real
valuation provider).

### 6. Two-way SMS / messaging with leads _(exploratory)_
Dealerships live on SMS. Two-way texting with leads from the CRM (Twilio-class
provider). Higher operational + compliance surface (opt-in/STOP handling); parked
as exploratory, not near-term.

---

## Recommended sequencing
1. **#2 Saved-vehicle alerts** — ship next; best leverage, uses what's already built.
2. **#1 Feed ingestion** — the strategic unlock before onboarding real dealers.
3. **#3 Appointment booking** — completes the conversion funnel.
4. Then **#4 finance calculator** and **#5 trade-in** as conversion boosters.
5. **#6 SMS** only once there's a real customer pulling for it.

Each ships through the normal `features/upcoming → staging → main` flow. #1, #2,
and #3 will need new migrations (feed config/state, notification log + preferences,
appointments) — apply to staging (Codex) then prod (Claude via MCP), per
`docs/deployment-environments.md`.
