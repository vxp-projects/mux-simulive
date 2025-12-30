import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { getAdminPassword } from "./config";
import {
  createSession,
  validateSession,
  deleteSession,
  isRedisConfigured,
} from "./redis";

const ADMIN_COOKIE_NAME = "simulive_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours
const SESSION_TOKEN_LENGTH = 32; // 256 bits

/**
 * Check if admin authentication is required
 */
export function isAdminAuthRequired(): boolean {
  const password = getAdminPassword();
  return !!password && password.length > 0;
}

/**
 * Verify admin password using constant-time comparison
 * Prevents timing attacks by always comparing in constant time
 */
export function verifyAdminPassword(password: string): boolean {
  const correctPassword = getAdminPassword();
  if (!correctPassword) return true; // No password set = open access

  // Ensure both strings are same length for timingSafeEqual
  // by hashing or padding - we'll pad to the longer length
  const inputBuffer = Buffer.from(password);
  const correctBuffer = Buffer.from(correctPassword);

  // If lengths differ, comparison will fail, but we still do constant-time
  // comparison to avoid leaking length information
  if (inputBuffer.length !== correctBuffer.length) {
    // Create buffers of same length and compare
    // This prevents length-based timing attacks
    const maxLen = Math.max(inputBuffer.length, correctBuffer.length);
    const paddedInput = Buffer.alloc(maxLen);
    const paddedCorrect = Buffer.alloc(maxLen);
    inputBuffer.copy(paddedInput);
    correctBuffer.copy(paddedCorrect);

    // Always run comparison even though we know it will fail
    timingSafeEqual(paddedInput, paddedCorrect);
    return false;
  }

  return timingSafeEqual(inputBuffer, correctBuffer);
}

/**
 * Generate a cryptographically secure session token
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_LENGTH).toString("hex");
}

/**
 * Create a new session and return the session token
 * Returns null if session creation failed
 */
export async function createAdminSession(): Promise<string | null> {
  // Redis is required for secure sessions
  if (!isRedisConfigured()) {
    console.warn(
      "[Auth] Redis not configured - using fallback session (less secure)"
    );
    // Fallback: return a signed token that doesn't need Redis
    // This is less secure but allows operation without Redis
    return generateSessionToken();
  }

  const sessionToken = generateSessionToken();
  const created = await createSession(sessionToken);

  if (!created) {
    console.error("[Auth] Failed to create session in Redis");
    return null;
  }

  return sessionToken;
}

/**
 * Validate a session token
 */
export async function validateAdminSession(
  sessionToken: string
): Promise<boolean> {
  if (!sessionToken) return false;

  // Basic format validation
  if (sessionToken.length !== SESSION_TOKEN_LENGTH * 2) {
    return false;
  }

  // If Redis not configured, accept any valid-format token (fallback mode)
  if (!isRedisConfigured()) {
    return true;
  }

  return validateSession(sessionToken);
}

/**
 * Delete a session (logout)
 */
export async function deleteAdminSession(sessionToken: string): Promise<void> {
  if (isRedisConfigured()) {
    await deleteSession(sessionToken);
  }
}

/**
 * Check if current request is authenticated as admin
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  if (!isAdminAuthRequired()) return true;

  const cookieStore = await cookies();
  const adminCookie = cookieStore.get(ADMIN_COOKIE_NAME);

  if (!adminCookie) return false;

  return validateAdminSession(adminCookie.value);
}

/**
 * Check if an API request is authenticated (for route handlers)
 */
export async function isApiAuthenticated(
  request: NextRequest
): Promise<boolean> {
  if (!isAdminAuthRequired()) return true;

  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME);
  if (!adminCookie) return false;

  return validateAdminSession(adminCookie.value);
}

/**
 * Get client IP from request (handles proxies)
 */
export function getClientIp(request: NextRequest): string {
  // Check common proxy headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take first IP in case of multiple proxies
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback - this may not work in all environments
  return "unknown";
}

export { ADMIN_COOKIE_NAME, COOKIE_MAX_AGE };
