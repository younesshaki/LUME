# Managed inventory feeds and syndication

## Status and scope

This design is implemented on the managed-inventory review branches. Migrations
`077_managed_inventory_feeds_and_exports.sql` and
`078_managed_inventory_sftp_sources.sql` are additive
and **has not been applied to any environment**. Applying it creates only
configuration, queue, and audit structures; it does not fetch a supplier feed,
send an export, or mutate inventory by itself.

It extends the inventory-feed gallery work in migration 075. Migration 075 must be
present before a managed source can write `feed_vin`, `feed_image_urls`, or
`feed_updated_at`.

Supported in this phase:

- inbound HTTPS, SFTP, and tenant-owned storage source shapes in the schema/worker;
- Admin configuration for HTTPS/SFTP CSV, JSON, and XML sources;
- hybrid and mirror field-update semantics with declarative mappings only;
- outbound HTTPS `POST`/`PUT` delivery as CSV, JSON, or XML;
- tenant-scoped schedules, retries, run history, health, and manual runs.

Explicitly deferred:

- DealerSync or any named DMS adapter;
- plain FTP, FTPS, and other non-SFTP file transports;
- marketplace-specific API adapters;
- automatic removal, archival, or sold-status changes for listings absent from
  a supplier source;
- guaranteed exactly-once remote export delivery.

Normal manual Add, Replace, and Synchronize CSV imports remain available and are
not changed by this work.

## Data flow

```text
Owner/admin in Admin
  -> service-only config/queue RPC
  -> inventory_*_runs durable queue
  -> Vercel cron every 5 minutes
  -> claim + retry/lease
  -> bounded parser or deterministic serializer
  -> tenant-scoped vehicle sync / HTTPS export
  -> immutable run history + source/destination health
```

The Admin page is
`/admin/[tenant]/settings/inventory-feeds`. It shows source/destination state and
the latest 100 inbound/outbound runs. Only tenant owners and admins can make
changes; members can read the RLS-scoped operational status.

The workers are:

- `apps/admin/app/api/cron/inventory-feed-runs/route.ts`
- `apps/admin/app/api/cron/inventory-export-runs/route.ts`

They require `Authorization: Bearer $CRON_SECRET`, run on Node.js, and are
scheduled in `apps/admin/vercel.json` every five minutes.

## Database model and tenancy

Migration 077 creates these tenant-scoped tables:

- `inventory_feed_sources` and `inventory_feed_runs`;
- `inventory_export_destinations` and `inventory_export_runs`;
- source/destination credential tables;
- `inventory_feed_tenant_leases`.

Tenant members have RLS read access to configuration and run history, always via
`tenant_id`. Browser clients cannot insert, update, or delete queue/config rows.
Owner/admin server actions verify role membership before calling service-only,
locked-search-path RPCs. All worker/database queries include `tenant_id` even when
using the service role.

Credential tables are RLS deny-all. They hold only AES-256-GCM encrypted envelopes,
never plaintext. The client only sees whether an opaque credential is configured.
The workers decrypt immediately before a pinned HTTPS/SFTP request. Set
`INVENTORY_INTEGRATION_ENCRYPTION_KEY` to a base64-encoded 32-byte key only in the
server environment; public endpoints do not require it.

### SFTP host-key trust

SFTP is an SSH transport, not FTP over a different port. It is supported only
with an Admin-supplied OpenSSH SHA-256 server-host-key fingerprint and a
username/password credential. The fingerprint is configuration (not a secret);
the username/password use the same AES-256-GCM envelope as HTTPS credentials.

We intentionally chose **Admin-supplied fingerprint** rather than trust on
first use (TOFU). TOFU would let an unattended worker silently pin an attacker
if the first setup connection were intercepted. With a supplier-provided value
obtained through a separate trusted channel, the worker can reject an impostor
before it authenticates or reads inventory. `ssh2` accepts host keys by default
when no verifier is configured, so LUME always supplies a raw-key verifier and
hard-fails a mismatch. A legitimate host-key rotation requires an explicit
Admin configuration update after verification with the supplier.

The accepted format is the OpenSSH display form `SHA256:<base64-without-padding>`.
SSH private-key authentication is deliberately deferred; this phase supports
the supplier's username/password setup only. Plain FTP is never supported
because it exposes credentials and feed contents in transit.

Deleting an Admin source/destination archives it rather than deleting it. Historical
runs remain visible; queued/retrying work is cancelled, and an active operation
must finish before archival. Physical tenant deletion remains possible: run foreign
keys cascade only as part of that administrative teardown.

## Inbound feed behavior

`apps/admin/lib/managedFeed.ts` is the pure parser/mapping layer. It accepts a
small, validated profile language rather than expressions or tenant-provided code:

- CSV literal headers, or bounded JSON/XML dotted paths;
- a bounded `dataPath` for JSON/XML;
- a fixed allow-list of vehicle fields;
- at most 10,000 records, 200 CSV columns, 50,000 XML nodes, and a 25 MiB source;
- no XML DTD/entity declarations or prototype-polluting paths.

All supplier image URLs are validated as HTTPS, deduplicated, and held separately
from tenant-owned R2 images. Image-array mappings use comma normalization so no
gallery URL is silently lost. A mirror update may clear optional data, but never a
VIN or external stock identity.

The worker uses the existing `resolveFeedSync()` semantics regardless of
whether bytes arrived through HTTPS, SFTP, or tenant-owned storage:

1. match VIN first;
2. otherwise match external stock ID;
3. reject a row if VIN and stock identify different records;
4. reject a row with neither stable ID;
5. insert only a genuinely new, stable-ID vehicle.

No display attributes are used to match records. It never deletes/recreates a
vehicle. If a VIN or stock ID belongs to a sold/archived record, the incoming row is
recorded as a conflict rather than repurposing history. Before every update, the
worker also requires the target vehicle still to be `draft` or `live`, preventing a
mid-run sold/archive transition from being overwritten.

`hybrid` leaves omitted/blank mapped values unchanged. `mirror` applies explicitly
mapped null clears only for safe optional fields. Neither mode means catalog
mirroring: a supplier omission never removes a LUME vehicle.

### Inbound reliability

One source has one active run. In addition, a durable tenant lease serializes
different supplier sources for the same tenant, so two feeds cannot concurrently
decide the same VIN/stock is new. Workers heartbeat the lease during a long run;
if a heartbeat is rejected or unavailable they abort before the next source page
or vehicle write. Stale claims are recoverable after 15 minutes.

Default retry delays are 60, 300, 1,800, 3,600, and 21,600 seconds, capped at ten
attempts. Parse/conflict/row errors make a run `partial`, which keeps source health
degraded rather than claiming success. Failed rows retry or dead-letter. Runs retain
safe, bounded diagnostics only.

The source SHA-256 hash provides a clean no-op optimization. It skips only when the
payload is unchanged **and** the queued snapshot has the same source configuration
version. Updating URL, mapping, schedule, credential, or mode invalidates the hash,
cancels unclaimed old snapshots, and queues future work from the new configuration.
An edit is rejected while a run is actively processing, preventing a new credential
from ever being used against an old endpoint.

## Outbound syndication

`packages/db/src/inventorySyndication.ts` builds deterministic output from live
tenant vehicles only. Profiles select a strict allow-list of fields or scalar
literals; they cannot evaluate code or store credential-like output fields. CSV
uses RFC-4180 escaping and formula neutralization; XML rejects invalid control
characters; JSON/XML root names are bounded and validated.

Output order is stable by vehicle ID. Live vehicles are keyset-paged and the worker
stops at the 10,001st record before loading image galleries, so a too-large catalog
fails explicitly rather than exhausting a cron invocation. Semantic SHA-256 hashes
avoid repeating an unchanged delivery. A destination `config_version` prevents this
optimization from skipping the first delivery after an endpoint, method, profile,
or credential change. Config edits cancel queued/retrying old snapshots and are
rejected while a delivery is in progress. Claiming a queued delivery locks the same
destination that update/pause/archive actions lock, so an old snapshot cannot be
promoted after one of those actions succeeds.

For `imageUrls`, gallery priority is:

```text
managed R2 primary -> remaining managed R2 gallery -> supplier feed gallery -> legacy image_src
```

URLs are deduplicated. Managed-image reads are explicitly paged and a legacy gallery
that exceeds the product's 20-image managed cap fails visibly instead of being
silently truncated. The supported LUME maximum is 71 URLs: 20 managed, 50 feed,
and one distinct legacy fallback. Exports are bounded to 10,000 records and 25 MB.

Outbound delivery uses the same retry/dead-letter pattern as inbound. It is
at-least-once: if a remote endpoint accepts a request but the worker dies before
recording success, a retry can deliver the same snapshot again. Destination APIs
should therefore accept an idempotency-safe full catalog replacement or deduplicate
by stable vehicle identity.

## Network safety

`apps/admin/lib/remoteImageFetch.ts` supplies the transport shared with existing
feed-image import work:

- endpoints must be HTTPS and have no embedded/query credentials; sensitive query
  keys are also redacted from Admin rendering as defense in depth;
- DNS results must all be public addresses;
- a validated address is pinned into the actual socket lookup to close DNS rebinding;
- redirects, private/loopback/link-local targets, and unsafe IPv4-in-IPv6 forms are
  rejected;
- TLS verification remains enabled;
- request/response bodies and timeouts are bounded.

Custom credentials may add bearer/basic authentication or one safe custom header.
Routing, framing, `Accept`, and `Content-Type` headers are controlled by LUME so a
saved credential cannot alter the pinned destination or export payload semantics.

SFTP applies the equivalent protections: its hostname is resolved once with
the same public-address validation (private, loopback, link-local and
DNS-rebinding targets are rejected); the TCP socket is opened to that exact
validated address; host-key fingerprint verification runs during the SSH
handshake; and the exact remote file is read under the same 25 MiB / 20-second
limits as HTTPS. Remote paths must be absolute and cannot contain `.` or `..`
segments. There is no directory traversal, glob, redirect, or accept-any-key
fallback.

## Operating and validating after approval

1. Apply migrations 077 then 078 only to the explicitly approved environment.
2. Confirm the migration ledger ends at 078 and the six config/run tables plus
   tenant lease table exist with their RLS policies.
3. Set `CRON_SECRET`; set `INVENTORY_INTEGRATION_ENCRYPTION_KEY` only if a source
   or destination needs authentication.
4. Add a non-production supplier endpoint/profile, manually queue it, then inspect
   the run history and source health.
5. Verify that a repeated unchanged source is skipped, a mapping edit forces a new
   execution, and a destination edit forces one new delivery.
6. For SFTP, obtain and enter the supplier's SHA-256 SSH host-key fingerprint
   through a separate trusted channel, then verify a changed-key run fails
   until an explicitly verified configuration update is made.
7. Validate a real Homenet CSV updates matching records in place and preserves
   saved vehicles, leads, Customer 360 records, and managed R2 galleries.

No migration was applied, no supplier endpoint was contacted, and no inventory data
was changed while building this branch.
