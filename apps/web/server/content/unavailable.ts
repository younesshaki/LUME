import "server-only";
import { resolveTenantRequest } from "../tenant-request.ts";
import { RejectedTenantRequest } from "../resolver-core.ts";
import { canonicalFor } from "../vehicles/presentation.ts";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Complete HTML on the failure path: no React/Flight/JavaScript dependency. */
export async function unavailableResponse(request: Request) {
  const u = new URL(request.url);
  const path = u.searchParams.get("path") ?? "/";
  const validPath =
    path === "/" ||
    (/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) &&
      !["/admin", "/api", "/preview", "/account"].includes(path));
  const selectors = u.searchParams.getAll("tenant");
  let status = 503,
    title = "Published content is temporarily unavailable",
    canonical: string | undefined,
    retry: string | undefined;
  if (!validPath || selectors.length > 1) {
    status = 404;
    title = "Page not found";
  } else
    try {
      const tenant = await resolveTenantRequest(request.headers, selectors[0]);
      canonical = canonicalFor(tenant, path);
      retry = new URL(canonical).pathname + new URL(canonical).search;
      title = `Content unavailable | ${tenant.name}`;
    } catch (error) {
      if (error instanceof RejectedTenantRequest) {
        status = 404;
        title = "Page not found";
      }
    }
  const heading =
    status === 503
      ? "Published content is temporarily unavailable"
      : "Page not found";
  const description =
    status === 503
      ? "Please try again shortly."
      : "The requested page or tenant is unavailable.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="noindex,nofollow,noarchive"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">${canonical ? `<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}">` : ""}<style>body{font:1rem/1.6 system-ui,sans-serif;margin:3rem auto;padding:1rem;max-width:48rem;color:#20252a;background:#f6f5f2}a{color:#144d46}h1{line-height:1.2}</style></head><body><main data-content-state="error"><h1>${heading}</h1><p>${description}</p>${retry ? `<a href="${escape(retry)}">Try the page again</a>` : ""}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Retry-After": "30",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
