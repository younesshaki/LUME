# Design note: importing remote vehicle galleries into R2 (future work)

Status: **design only — deliberately not implemented.** The CSV feed import
persists one external primary image per vehicle via `vehicles.image_src`;
`additional_image_link` URLs are parsed, validated, deduplicated, and shown in
the import preview but never copied. Copying remote bytes into the managed
gallery requires the pipeline below, reviewed as its own ticket.

## Why not inline in the import

Fetching arbitrary URLs from an admin/server route is an SSRF primitive, and a
30-vehicle feed can reference 300+ images — far beyond a request lifetime.
Ingestion must be asynchronous and isolated from user-facing routes.

## Pipeline shape

1. **Queue, don't fetch.** The import writes `vehicle_image_ingestions` rows
   (tenant_id, vehicle_id, source_url, status, attempt_count) — RLS'd like
   every tenant table, service-role writes only. A background worker (cron
   route or queue consumer) drains it; the import itself never fetches bytes.
2. **Outbound URL policy (SSRF prevention).** HTTPS only (already enforced at
   parse time); re-resolve DNS at fetch time and reject private/reserved IP
   ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7)
   including on **every redirect hop** (cap: 3 redirects, same policy each
   hop); no credentials in URLs; block non-standard ports.
3. **Fetch limits.** Per-request timeout (~10s), max download size (reuse
   `MAX_VEHICLE_IMAGE_BYTES` = 10MB) enforced by streaming with a byte
   counter, not Content-Length trust.
4. **Content validation.** MIME allowlist (jpeg/png/webp) checked against
   **magic bytes**, not headers; decode dimensions and enforce the existing
   limits before upload; reject anything that fails to parse as an image.
5. **Storage.** Deterministic tenant-owned keys via the existing
   `buildVehicleImageR2Key(tenantId, vehicleId, uuid, extension)` — never
   attacker-influenced paths. Insert `vehicle_images` rows through the same
   confirmation flow the uploader uses, preserving ownership invariants.
6. **Quotas & idempotency.** Respect `MAX_VEHICLE_IMAGES` per vehicle and any
   tenant storage quota; key ingestion rows by (vehicle_id, source_url) so
   re-imports are no-ops; cap attempts (e.g. 3) with exponential backoff, then
   mark failed.
7. **Ordering & partial failure.** Successful images get `sort_order` from
   their feed position; the feed primary becomes `is_primary` only if the
   vehicle has no managed primary yet (admin uploads stay authoritative). A
   partially ingested gallery is valid state — the UI already renders any
   subset. Failures never delete previously ingested images.
8. **Cleanup & replacement.** Re-running ingestion for a vehicle replaces only
   images originally created by ingestion (track `source: "ingestion"`), never
   admin uploads; deletions go through the existing delete flow so R2 objects
   and rows stay consistent, and never remove an image still referenced as a
   published-page asset.

## Prerequisite

A safe reusable outbound-fetch utility (steps 2–4) does not exist in the repo
today — building it is the bulk of the ticket and must be reviewed as security
-sensitive code.
