import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  isSubdomainRoutingEnabled,
  tenantSlugFromHost,
} from "@/lib/subdomainRouting";

/**
 * Refresh Supabase session on every request and gate /admin/* routes.
 *
 * Auth gate: if the user is not signed in and is asking for /admin/*,
 * redirect to /login with `next` set so we can return them after login.
 */
export async function middleware(request: NextRequest) {
  if (isSubdomainRoutingEnabled(process.env.SUBDOMAIN_TENANT_ROUTING_ENABLED)) {
    const tenantSlug = tenantSlugFromHost(
      request.headers.get("host") ?? request.nextUrl.host,
      process.env.LUME_ROOT_DOMAIN ?? ""
    );
    if (tenantSlug) {
      // Host-derived scope wins over a caller-supplied selector on tenant hosts.
      request.headers.set("x-lume-tenant", tenantSlug);
    }
  }

  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  if (isAdminRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run middleware on everything except:
     *   - Next.js internals (_next/*)
     *   - public files (favicon, images)
     *   - API routes that handle their own auth (/api/chat is public)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/chat|api/vehicles|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
