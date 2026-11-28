import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const publicAuthPaths = ["/login", "/signup"];
  // "Authenticated" must mean the same thing here as in the pages:
  // a session carrying a persisted user id (session.user.id). A bare
  // session without user.id would otherwise ping-pong between "/" and
  // "/login" forever — proxy sends auth pages to "/", the page bounces
  // back to "/login", and the proxy sends it to "/" again.
  const userId = request.auth?.user?.id;

  if (!userId && !publicAuthPaths.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (userId && publicAuthPaths.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth(?:/|$)|api/health(?:/|$)|api/diag-auth-tmp(?:/|$)|api/integrations(?:/|$)|api/notifications(?:/|$)|api/webhooks(?:/|$)|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
