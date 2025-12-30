import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, deleteAdminSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Delete session from Redis if it exists
  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME);
  if (adminCookie?.value) {
    await deleteAdminSession(adminCookie.value);
  }

  const response = NextResponse.json({ success: true });

  // Clear the auth cookie
  const useSecureCookies = process.env.SECURE_COOKIES === "true";
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
