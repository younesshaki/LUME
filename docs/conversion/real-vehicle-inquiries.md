# Real vehicle inquiries

The public vehicle-detail form now creates a real tenant-scoped lead instead of showing a local-only success state.

## Request path

1. The Vite client posts to the same-origin `/api/leads` function with `credentials: include` and `X-Lume-Tenant`.
2. The public Vercel function forwards only the required request metadata and the `lume_visitor_session` cookie.
3. The canonical admin `/api/leads` route performs origin, rate-limit, Turnstile, tenant, vehicle, quota, duplicate, and visitor checks.
4. A successful insert keeps the existing loyalty accrual, admin email notification, and CRM webhook behavior.

The root function derives its upstream from `LUME_CHAT_UPSTREAM_URL` when that URL ends in `/api/chat`. `LUME_LEADS_UPSTREAM_URL` can be set explicitly when the lead route uses a different host. Deployment-protection bypass uses `LUME_LEADS_BYPASS_SECRET` when set, otherwise the existing `LUME_CHAT_BYPASS_SECRET`.

## Optional Turnstile

When the admin deployment has `TURNSTILE_SECRET_KEY`, the public build must also define `VITE_TURNSTILE_SITE_KEY`. With neither variable, inquiry submission works without a challenge. Do not configure only the secret, because the server will correctly reject browser submissions that have no token.

## Security invariants

- The visitor session proxy forwards no unrelated cookies.
- A browser inquiry vehicle must exist, belong to the resolved tenant, and have `status = live`.
- API-key integrations may reference non-live vehicles, but the vehicle must still belong to the API key's tenant.
- Vehicle-detail source context must use the same vehicle ID as the lead.
- The server replaces the client-provided vehicle title with canonical vehicle data before storing the source context.
- Duplicate submissions within the existing one-hour window return the existing lead ID and are still shown as success.

## Preview validation

1. Open a live vehicle detail page and submit a valid inquiry.
2. Confirm the modal shows success only after the request returns `200` or `201`.
3. Confirm the lead appears under the correct tenant with the correct vehicle, attribution, visitor linkage, and source context.
4. Submit the same email and vehicle again within one hour and confirm the existing lead is returned rather than duplicated.
5. Attempt a draft, sold, archived, invalid, or another tenant's vehicle ID and confirm the API returns `400` without creating a lead.
6. Confirm signed-in visitors receive the existing `submitted_lead` loyalty accrual.
7. Confirm configured lead email and CRM webhook destinations receive the new lead.
