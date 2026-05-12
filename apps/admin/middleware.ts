import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Refresh Supabase session on every request and gate /admin/* routes.
 *
 * Auth gate: if the user is not signed in and is asking for /admin/*,
 * redirect to /login with `next` set so we can return them after login.
 */
export async function middleware(request: NextRequest) {
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
