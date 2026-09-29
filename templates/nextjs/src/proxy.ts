import { STORAGE_KEYS } from "@/enums";
import { loginPathWithReturn, safeRedirect } from "@/services/core/session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route guard (Next 16 `proxy`, the former middleware). Runs before rendering on
 * the initial request AND on client-side navigations (which fetch the RSC payload
 * from the server), so a guest never sees the protected page flash.
 *
 * The signal is the readable session hint cookie, checked synchronously — no
 * profile fetch. A hint whose tokens expired still passes: the client refreshes
 * through the normal 401 flow.
 * - Guest on a protected route → `/login?redirect=<original path + query>`.
 * - Signed-in user on `/login` → the same-origin `redirect` target, else home.
 */
export function proxy(request: NextRequest) {
  const signedIn = request.cookies.get(STORAGE_KEYS.SESSION)?.value === "1";

  const { pathname, search, searchParams } = request.nextUrl;

  if (pathname === "/login") {
    if (!signedIn) return NextResponse.next();
    return NextResponse.redirect(new URL(safeRedirect(searchParams.get("redirect")), request.url));
  }

  if (signedIn) return NextResponse.next();
  return NextResponse.redirect(new URL(loginPathWithReturn(pathname + search), request.url));
}

/** Protected routes plus the guest-only login page. */
export const config = { matcher: ["/users/:path*", "/login"] };
