import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getAdminPassword } from "./config";

const ADMIN_COOKIE_NAME = "simulive_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

/**
 * Check if admin authentication is required
 */
export function isAdminAuthRequired(): boolean {
  const password = getAdminPassword();
  return !!password && password.length > 0;
}

/**
 * Verify admin password
 */
export function verifyAdminPassword(password: string): boolean {
  const correctPassword = getAdminPassword();
  if (!correctPassword) return true; // No password set = open access
  return password === correctPassword;
}

/**
 * Check if current request is authenticated as admin
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  if (!isAdminAuthRequired()) return true;

  const cookieStore = await cookies();
  const adminCookie = cookieStore.get(ADMIN_COOKIE_NAME);

  if (!adminCookie) return false;

  // Cookie value should match a hash of the password
  const expectedValue = Buffer.from(getAdminPassword() || "").toString("base64");
  return adminCookie.value === expectedValue;
}

/**
 * Get the admin cookie value for setting
 */
export function getAdminCookieValue(): string {
  return Buffer.from(getAdminPassword() || "").toString("base64");
}

/**
 * Check if an API request is authenticated (for route handlers)
 */
export function isApiAuthenticated(request: NextRequest): boolean {
  if (!isAdminAuthRequired()) return true;

  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME);
  if (!adminCookie) return false;

  const expectedValue = Buffer.from(getAdminPassword() || "").toString("base64");
  return adminCookie.value === expectedValue;
}

export { ADMIN_COOKIE_NAME, COOKIE_MAX_AGE };
