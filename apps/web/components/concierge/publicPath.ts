/** Public same-origin paths only, including paths recovered from tab storage. */
export function publicPath(value: string): string | null {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return null;
  try {
    const url = new URL(value, "https://in-app.invalid");
    const decoded = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://in-app.invalid" ||
      /[\\]|%2f|%5c/i.test(url.pathname) ||
      decoded.split("/").some((p) => p === "." || p === "..")
    )
      return null;
    if (/^\/(admin|api|account|preview)(\/|$)/i.test(decoded)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function tenantHref(href: string, tenant: string): string {
  const path = publicPath(href) ?? "/vehicles";
  const url = new URL(path, "https://in-app.invalid");
  url.searchParams.set("tenant", tenant);
  return url.pathname + url.search + url.hash;
}
