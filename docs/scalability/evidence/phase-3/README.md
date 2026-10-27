# Phase 3 committed evidence

Captured 27 October 2026 against application commit `458996a`. Later commits contain verification scripts, documentation and these artifacts only. See [the implementation/gate report](../../phase-3-published-content.md).

- [Visual matrix](visual-parity.md): 80 live Vite before/after JPEG review captures, 60 published-content screenshots and 12 hosted JS-off mobile screenshots.
- [Hosted report](hosted/report.json): 12 real publication documents, rejection cases, forwarded-host normalization and R2 image response. Raw HTML, safe response headers and metadata excerpts are alongside it. No JavaScript executed to obtain HTML.
- [Local states](content-report.json): 20 published + 40 missing/empty cases, draft/selector rejection, 24 concurrent requests and full raw HTTP503 outage document. Raw documents are in local-html/.
- [Foundation isolation](isolation.json) and [vehicle isolation](vehicle-isolation.json): deterministic multi-tenant fixtures; not additional real staging tenants.
- [Real staging form receipts](forms/luxury-dark/report.json) and [second presentation](forms/glo3d-light/report.json): real browser POSTs, no success fixture.
- [Bindings](hosted/environment.json), [client bundles](hosted/client-bundles.json), [function manifest](hosted/functions.json), [staging-only origin change](hosted/staging-origin-allowlist.json), [production unchanged](hosted/live-projects-unchanged.json).
- [Verification](verification.txt), with full command output in logs/. The full suite is not green: the known SFTP failure persists; the other default-timeout failure passes alone.

Public snapshot fixtures contain no keys. The public branding media URLs in the staging design are preserved for accurate Vite comparison; they are not authorization to access production data.
