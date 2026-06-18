# ADR-004: Admin Draft Preview

Status: Accepted

## Context

The public Vite app can only read published page content through the anon-safe
`get_published_page` RPC. Draft revisions must remain private to authenticated
admin users and must not become readable through public anon routes.

The Next admin app also cannot import public Vite `src/` React block components
without coupling the two applications and breaking the package boundary created
by `@lume/blocks`.

## Decision

The first live preview renders inside the authenticated admin editor from the
editor's in-memory draft blocks. It uses shared `@lume/blocks` descriptors and
validation, then renders admin-safe preview markup for each supported block type.

This means:

- No public draft endpoint is introduced.
- No service-role key is exposed to the browser.
- Draft content is never fetched by anon clients.
- Preview updates immediately for unsaved editor changes.
- The public renderer remains gated by `VITE_PAGE_RENDERER` and continues to read
  only published revisions.

## Future Work

A pixel-accurate iframe preview can be added later by serving an authenticated
admin-only preview route or short-lived signed preview session. That route must
validate the admin session server-side before returning draft blocks.
