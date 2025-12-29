import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE_NAME = "simulive_admin";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin routes (but not /admin/login)
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const adminPassword = process.env.ADMIN_PASSWORD;

    // If no password is set, allow access
    if (!adminPassword || adminPassword.length === 0) {
      return NextResponse.next();
    }

    // Check for auth cookie
    const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME);
    const expectedValue = Buffer.from(adminPassword).toString("base64");

    if (!adminCookie || adminCookie.value !== expectedValue) {
      // Redirect to login
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
