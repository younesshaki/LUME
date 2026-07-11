# @lume/email operations

The package is safe to import from server code only through `@lume/email/server` when sending or
verifying provider webhooks. Template components live at `@lume/email/templates`; the root export
contains shared types and pure validation only.

## Resend DNS and webhook provisioning

These steps are operational and are intentionally not automated by application code:

1. Decide whether LUME will send from the root `lume.app` domain or a dedicated sending subdomain.
   Add that exact domain in Resend.
2. Publish the SPF and DKIM records exactly as Resend displays them. Do not copy values between
   environments or tenants, and do not mark a sender address usable until Resend reports the domain
   as verified.
3. Publish or merge a DMARC TXT record for the chosen sending domain. Start with monitoring policy
   (`p=none`) and review reports before moving to quarantine or reject. Never overwrite an existing
   DMARC policy without an operations review.
4. Create a Resend webhook pointing to `https://<admin-origin>/api/resend-webhook` and subscribe to
   `email.delivered`, `email.bounced`, and `email.complained`.
5. Store the webhook signing secret as `RESEND_WEBHOOK_SECRET` in the server environment. Do not put
   it in a browser-exposed variable or commit its value.

Webhook delivery is at least once. `svix-id` is persisted as the idempotency key, and only a
Resend `Permanent` bounce automatically enters LUME's service-only suppression ledger. Complaints
are logged for review but do not change suppression policy in SCRUM-196.

The website-routing `tenant_domains` table is unrelated to email authentication. Never treat its
`verified` flag as proof that Resend SPF/DKIM is ready.
