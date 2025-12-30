import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRedisClient, isRedisConfigured } from "@/lib/redis";

/**
 * Health Check Endpoint
 *
 * Returns application health status for container orchestration.
 * Used by Docker, Kubernetes, load balancers, etc.
 */
export async function GET() {
  const checks: Record<string, { status: string; error?: string }> = {};

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "pass" };
  } catch (error) {
    checks.database = {
      status: "fail",
      error: error instanceof Error ? error.message : "Database connection failed",
    };
  }

  // Check Redis connection (if configured)
  if (isRedisConfigured()) {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.ping();
        checks.redis = { status: "pass" };
      } else {
        checks.redis = { status: "fail", error: "Redis client not initialized" };
      }
    } catch (error) {
      checks.redis = {
        status: "fail",
        error: error instanceof Error ? error.message : "Redis connection failed",
      };
    }
  } else {
    checks.redis = { status: "skip", error: "Redis not configured (optional)" };
  }

  // Check Mux credentials are set
  const hasMuxCredentials =
    !!process.env.MUX_TOKEN_ID && !!process.env.MUX_TOKEN_SECRET;
  checks.mux_credentials = hasMuxCredentials
    ? { status: "pass" }
    : { status: "fail", error: "MUX_TOKEN_ID or MUX_TOKEN_SECRET not set" };

  // Determine overall health (skip status counts as healthy)
  const isHealthy = Object.values(checks).every(
    (c) => c.status === "pass" || c.status === "skip"
  );

  const response = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(response, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
