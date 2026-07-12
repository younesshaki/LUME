# Upload antivirus Edge Function

This function consumes a Supabase Database Webhook for `storage.objects` INSERT events. It skips
the image-only buckets and scans CSV/PDF content through a separately operated ClamAV-compatible
HTTP bridge.

Provisioning (not performed by this repository change):

1. Apply migration `057_tenant_asset_antivirus.sql` to create the private quarantine bucket and
   scan ledger.
2. Deploy `scan-upload` with JWT verification enabled.
3. Set `ANTIVIRUS_WEBHOOK_SECRET`, `CLAMAV_SCAN_URL`, and optionally `CLAMAV_SCAN_TOKEN` as
   Supabase Function secrets. The scanner contract is `POST` raw bytes and a JSON response shaped
   as `{ "clean": boolean, "signature"?: string }`.
4. Create a Database Webhook for INSERTs on `storage.objects`, initially filtered to
   `bucket_id=tenant-csvs`. Send the service-role bearer token plus the matching
   `x-lume-antivirus-secret` header.
5. Upload the EICAR test file under a non-production tenant prefix and confirm it moves to
   `tenant-quarantine`, the original disappears, and an admin notification is created.

If the function or webhook is absent, uploads retain their current behavior. If the function is
deployed without a scanner URL, it records `unavailable` and returns 202 without deleting the
object. Never expose the quarantine bucket through a client Storage policy.
