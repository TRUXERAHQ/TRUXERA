import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const publicAuthPaths = ["/login", "/signup"];

  if (!request.auth && !publicAuthPaths.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (request.auth && publicAuthPaths.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth(?:/|$)|api/health(?:/|$)|api/integrations(?:/|$)|api/notifications(?:/|$)|api/webhooks(?:/|$)|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
