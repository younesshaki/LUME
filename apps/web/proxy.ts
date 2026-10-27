import { NextResponse, type NextRequest } from "next/server";
import { hostname } from "./server/resolver-core";

/** Host allowlist at ingress; tenant existence/verified-domain checks stay in SSR. */
export function proxy(request: NextRequest) {
  const fail = () =>
    new NextResponse("Preview not found", {
      status: 404,
      headers: {
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  const vehicleApi = /^\/api\/vehicles(?:\/|$)/.test(request.nextUrl.pathname);
  const mutationApi = ["/api/leads", "/api/consent"].includes(
    request.nextUrl.pathname,
  );
  if (
    ![
      "GET",
      "HEAD",
      ...(vehicleApi ? ["OPTIONS"] : []),
      ...(mutationApi ? ["POST", "OPTIONS"] : []),
    ].includes(request.method)
  )
    return new NextResponse("Read-only preview", {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  try {
    const host = hostname(request.headers.get("host") ?? "");
    const forwarded = request.headers.get("x-forwarded-host");
    if (forwarded && hostname(forwarded) !== host) return fail();
    if (
      (!vehicleApi && !mutationApi && request.headers.has("x-lume-tenant")) ||
      request.headers.has("x-web-tenant")
    )
      return fail();
    if (request.nextUrl.searchParams.getAll("tenant").length > 1) return fail();
    const env = process.env;
    const previews = (env.WEB_PREVIEW_HOSTS ?? "")
      .split(",")
      .filter(Boolean)
      .map(hostname);
    if (!env.VERCEL) previews.push("localhost", "127.0.0.1");
    if (env.VERCEL_ENV === "preview" && env.VERCEL_URL)
      previews.push(hostname(env.VERCEL_URL));
    const custom = JSON.parse(env.WEB_PREVIEW_CUSTOM_HOSTS ?? "{}");
    const root = env.WEB_PREVIEW_ROOT_DOMAIN
      ? hostname(env.WEB_PREVIEW_ROOT_DOMAIN)
      : undefined;
    if (
      !previews.includes(host) &&
      !Object.hasOwn(custom, host) &&
      !(root && host.endsWith(`.${root}`))
    )
      return fail();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(
      "x-web-request-path",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return fail();
  }
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
