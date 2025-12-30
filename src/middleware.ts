import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE_NAME = "simulive_admin";
const SESSION_TOKEN_LENGTH = 32; // Must match auth.ts

/**
 * Validate session token format (not full validation - that happens in API routes)
 * This is a quick check to reject obviously invalid tokens
 */
function isValidTokenFormat(token: string): boolean {
  // Token should be 64 hex characters (32 bytes as hex)
  if (token.length !== SESSION_TOKEN_LENGTH * 2) {
    return false;
  }
  // Check it's valid hex
  return /^[a-f0-9]+$/i.test(token);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin routes (but not /admin/login)
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const adminPassword = process.env.ADMIN_PASSWORD;

    // If no password is set, allow access
    if (!adminPassword || adminPassword.length === 0) {
      return NextResponse.next();
    }

    // Check for auth cookie with valid format
    const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME);

    if (!adminCookie || !isValidTokenFormat(adminCookie.value)) {
      // Redirect to login
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Token format is valid - full validation happens in API routes
    // This is acceptable because:
    // 1. The 256-bit random token is unguessable
    // 2. API routes do full Redis validation for sensitive operations
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
