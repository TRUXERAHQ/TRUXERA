import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (!request.auth && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (request.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth(?:/|$)|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
