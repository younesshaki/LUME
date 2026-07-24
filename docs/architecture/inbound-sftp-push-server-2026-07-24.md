# Inbound SFTP push server — future consideration, not scoped yet

## Status

Not started. This is a discussion capture for a later decision, not a spec to
implement. The work actually shipped on `codex/managed-sftp-feed-transport`
(migration 078) is the *opposite* direction — LUME as an SFTP **client**
pulling from a supplier's server. This document is about the reverse: LUME
hosting its own SFTP endpoint that suppliers push to.

## Why this might be needed

Most of the inventory feed providers the founder currently works with operate
push-only: they ask for SFTP credentials to a destination *they* upload to,
rather than exposing a server LUME can pull from. The pull-based SFTP client
(migration 078) does not cover this case — it only helps when the supplier's
system can be connected to and polled.

## The key architectural fact that makes this cheaper than it sounds

The schema already has a `'storage'` source kind (`inventory_feed_sources`,
alongside `'https'` and now `'sftp'`) — a tenant-owned storage object that the
existing queue/parser/non-destructive-sync pipeline already knows how to
process on its normal schedule. That means an inbound push server does **not**
require rebuilding ingestion — only a small, isolated component that accepts
an SFTP push and drops the file into the right tenant's existing storage
path. Everything downstream (parsing, VIN/stock matching, retry, dead-letter)
already works unchanged.

## Why it's still real new infrastructure

Vercel's serverless functions are stateless and request-driven; they cannot
sit listening for an inbound SSH/SFTP connection the way a persistent server
must. This means the push-receiving component has to live *outside* the
current Vercel + Supabase stack, as an always-on process. Two paths:

### Option A — Managed gateway (e.g. AWS Transfer Family)

- Purpose-built for exactly this: issue SFTP credentials, uploaded files land
  in object storage automatically, per-user isolated directories out of the
  box.
- Pairs natively with S3, not R2 — would need either an S3→R2 sync step or
  reconsidering storage for this specific flow.
- **Cost: ~$0.30/hour per enabled protocol endpoint ≈ $215-220/month fixed**,
  charged whether one supplier or fifty are pushing files, plus a small
  per-GB fee on top (negligible at feed-file volumes). The fixed cost does
  not scale down for low usage.
- Least engineering/ops burden; least amount of new code to secure and
  maintain.

### Option B — Self-hosted SFTP server

- A small always-on VM (Hetzner, Fly.io, DigitalOcean, Railway) running an
  SFTP-only server, writing incoming files straight into each tenant's R2
  path.
- **Cost: roughly $5-20/month** in raw infrastructure — 10-40x cheaper than
  Option A at this stage.
- Real cost is engineering/ops time: securing a public-facing SSH endpoint,
  issuing and rotating per-tenant credentials, enforcing directory isolation
  so one supplier can never see another tenant's files, monitoring for
  brute-force login attempts.

## Recommendation (as of this writing, pre-revenue, handful of expected
supplier integrations)

Self-host (Option B). AWS Transfer Family's fixed ~$215/month is
enterprise-scale pricing for what is currently a handful of small daily file
drops. The self-hosted path only becomes the worse choice once LUME is at a
scale where the ops burden of running it outweighs ~$200+/month saved — a
"revisit later" problem, not a launch-day one.

## Open questions to resolve before scoping real work

- Per-tenant credential issuance and rotation UX — how does an owner/admin in
  the Admin dashboard get their own supplier's SFTP credentials to give out?
- Directory isolation enforcement — chroot per tenant, or an equivalent
  guarantee, needs to be verified, not assumed.
- Which VM/host provider, and who owns patching/updating that box long-term
  (this is the first piece of LUME infrastructure that isn't Vercel or
  Supabase).
- Whether SSH-key-based supplier authentication is needed from day one, or
  username/password (matching the pull-based SFTP client's initial scope) is
  sufficient to start.
