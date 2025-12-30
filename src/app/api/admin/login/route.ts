import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminPassword,
  createAdminSession,
  getClientIp,
  ADMIN_COOKIE_NAME,
  COOKIE_MAX_AGE,
} from "@/lib/auth";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/redis";

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  // Check rate limit BEFORE processing login
  const rateLimit = await checkLoginRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many login attempts. Please try again later.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds || 900),
        },
      }
    );
  }

  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        {
          error: "Invalid password",
          attemptsRemaining: rateLimit.attemptsRemaining,
        },
        { status: 401 }
      );
    }

    // Password correct - create secure session
    const sessionToken = await createAdminSession();

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Failed to create session. Please try again." },
        { status: 500 }
      );
    }

    // Reset rate limit on successful login
    await resetLoginRateLimit(clientIp);

    const response = NextResponse.json({ success: true });

    // Set auth cookie with secure session token
    const useSecureCookies = process.env.SECURE_COOKIES === "true";
    response.cookies.set(ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
