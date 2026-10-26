const reserved = new Set(['www', 'app', 'api', 'admin', 'static', 'cdn']);
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Pure per-request selection. No localStorage or process-global tenant. */
export function selectTenant(host: string, query: string | undefined, root: string, fallback: string) {
  const hostname = host.toLowerCase().replace(/:\d+$/, '');
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  let slug: string;
  if (isLocal) slug = query ?? fallback;
  else if (hostname.endsWith(`.${root}`)) {
    slug = hostname.slice(0, -(root.length + 1));
    // A conflicting query must not select another tenant on a tenant host.
    if (query && query !== slug) return null;
  } else return null;
  return slugPattern.test(slug) && !reserved.has(slug) ? slug : null;
}
