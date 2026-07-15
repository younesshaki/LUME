# Persistent visitor saved vehicles

This change is Phase 2 of Conversion Engine v1 and is intentionally stacked on
PR #20 (real vehicle inquiries).

## Data and security model

`visitor_saved_vehicles` is tenant-scoped and private to canonical server APIs.
It uses composite foreign keys to `(tenant_id, id)` on both `visitors` and
`vehicles`; the database therefore rejects cross-tenant visitor/vehicle pairs.
RLS permits tenant-member reads for administrative use only. Browser writes use
the signed visitor cookie through `/api/visitor/saved-vehicles`; no service-role
credential is exposed to the public Vite app.

The API resolves tenant + visitor from the request, validates UUIDs, allows only
currently-live vehicles to be newly saved, and scopes deletion by tenant,
visitor, and vehicle. GET is newest-first and capped at 50; it retains saved
items whose inventory has since sold, been archived, or disappeared.

## Local synchronization and loyalty

Anonymous saves keep using `lume.vehicle-saved.v1`. Once a visitor authenticates,
the provider submits the local IDs to the canonical API, removes successes from
the anonymous queue, and retains failed IDs for a later retry. Login and account
rendering are never blocked by partial sync failures. Logout clears the
authenticated in-memory list and restores only anonymous local IDs.

The unique save constraint makes POST idempotent under concurrent requests.
Loyalty is attempted only for a newly created row with idempotency key
`saved-vehicle:<visitor-id>:<vehicle-id>`. Loyalty failures are observed but do
not roll back a valid saved vehicle.

## Migration and rollback

Migration: `062_visitor_saved_vehicles.sql` (not applied by this branch).
It is additive only. Rollback should disable the saved-vehicle API/UI first;
dropping the table is a separate, reviewed operational decision because it
deletes visitor data.

## Manual validation

1. Save a live vehicle while anonymous; refresh and confirm it remains saved.
2. Sign up or log in; confirm the save remains active and appears on Account.
3. Save the same vehicle twice and confirm one row/one loyalty award.
4. Change a saved vehicle to sold/archived and confirm it remains visible but
   cannot be opened as a public listing.
5. Verify a tenant cannot save or delete another tenant's inventory.
