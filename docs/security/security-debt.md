# LUME Security Debt Register

**This is the standing list of known, deliberately-accepted security risks in
shipped or shipping features.** Whenever we ship something with a security
trade-off we consciously chose to defer, it gets an entry here.

**Before go-to-market** — i.e. before real, external, paying dealers onboard,
and *especially* before we ever host multiple untrusted tenants who don't know
each other — **every `Open` item in this file must be reviewed and either fixed
or explicitly re-accepted.** This is the pre-launch security gate.

Nothing here is a live exploit in our current context (single operator, trusted
tenants, pre-revenue). They are risks that grow teeth as the tenant base becomes
larger and less trusted. That's exactly why we write them down now instead of
rediscovering them later.

## How to use this file

- **Adding an item:** when a PR ships a known security trade-off, add a row to
  the table and a detailed entry below. Reference the file/line and the commit.
- **Severity** is *"severity once we have real untrusted tenants,"* not today.
- **Status:** `Open` (accepted for now, must revisit) · `Fixed` (with commit) ·
  `Re-accepted` (reviewed at launch, consciously kept, with rationale).
- **The launch checklist is simply: filter this file to `Open` and resolve each.**

## Register

| ID | Feature | Risk | Severity (at scale) | Status |
|----|---------|------|---------------------|--------|
| SD-001 | Feed image → R2 import | SSRF via DNS rebinding (TOCTOU between validation and fetch) | Medium | Open |
| SD-002 | Feed image → R2 import | IPv4-mapped IPv6 (`::ffff:127.0.0.1`) bypasses the private-IP blocklist | Low–Medium | Open |
| SD-003 | Feed image → R2 import | Response body is fully buffered before the size check (Content-Length can be omitted) | Low | Open |

---

## SD-001 — SSRF via DNS rebinding in the feed-image importer

- **Where:** `apps/admin/app/api/vehicles/[id]/images/import-feed/route.ts`
  (`assertPublicRemoteUrl` → `fetch`).
- **What:** The route resolves the hostname, checks the resolved IPs are public,
  then calls `fetch(url)`, which **re-resolves DNS independently**. A malicious
  host with a short-TTL record can return a public IP for the check and a
  private/internal IP for the fetch (classic DNS-rebinding SSRF). The connection
  is not pinned to the validated address.
- **Why it's tolerable today:** The attacker must be an **authenticated
  editor** of a tenant, and the fetched URL must already be stored on that
  tenant's own vehicle (`selectFeedVehicleImageUrls` only allows the vehicle's
  own feed URLs). The SSRF is **blind**: the response body is never returned to
  the client, and bytes are only stored if they pass magic-byte image
  validation. So the practical yield is "make our server issue a GET to an
  internal address and discard the result unless it's a valid image" — very low
  exfiltration value. `redirect: "error"` already closes the redirect-based
  variant.
- **Fix before market:** Resolve the host once, validate the address, then
  connect **to that validated IP** (custom `lookup`/agent that pins or
  re-validates the socket address), so the fetch cannot reach a different IP
  than the one we checked. Re-validate on the actual connected socket.

## SD-002 — IPv4-mapped IPv6 loopback bypasses the blocklist

- **Where:** same route, `isPublicAddress`.
- **What:** The IPv6 branch blocks `::1`, `fe80:` (link-local), and `fc`/`fd`
  (ULA), but not IPv4-mapped IPv6 forms like `::ffff:127.0.0.1` /
  `::ffff:7f00:1`, which route to IPv4 loopback/private ranges.
- **Why it's tolerable today:** Same constrained threat model as SD-001, and a
  host resolving to an IPv4-mapped IPv6 loopback is unusual. Blind SSRF only.
- **Fix before market:** Detect IPv4-mapped IPv6 (`::ffff:a.b.c.d`), extract the
  embedded IPv4, and run it through the IPv4 private-range check. Fold this into
  the SD-001 pin-to-validated-IP fix.

## SD-003 — Unbounded body buffering before the size check

- **Where:** same route, `importOne`.
- **What:** After an optional `Content-Length` check, the code does
  `await response.arrayBuffer()` (buffering the **entire** body into memory)
  and *then* checks `byteLength > MAX_VEHICLE_IMAGE_BYTES`. A server that omits
  `Content-Length` and streams a very large body can force large allocations
  before the check trips. `AbortSignal.timeout(15s)` bounds it loosely.
- **Why it's tolerable today:** Authenticated-editor-only, low request volume,
  10 MB nominal cap, timeout ceiling. A memory-pressure nuisance, not a breach.
- **Fix before market:** Stream the response and enforce the byte cap
  incrementally (abort as soon as the counter exceeds `MAX_VEHICLE_IMAGE_BYTES`),
  never trusting `Content-Length` and never buffering an unbounded body.

---

## Pre-launch checklist (run before onboarding real external tenants)

- [ ] Every `Open` item above is Fixed or Re-accepted with written rationale.
- [ ] Re-run a focused SSRF review of any route that fetches remote URLs
      server-side (grep for `fetch(` in `apps/admin/app/api/**`).
- [ ] Confirm every tenant-scoped table still enforces RLS + `tenant_id` filters.
- [ ] Confirm no service-role client is reachable from a client component.
