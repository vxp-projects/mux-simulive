import { NextResponse } from "next/server";
import prisma from "@/lib/db";

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

  // Check Mux credentials are set
  const hasMuxCredentials =
    !!process.env.MUX_TOKEN_ID && !!process.env.MUX_TOKEN_SECRET;
  checks.mux_credentials = hasMuxCredentials
    ? { status: "pass" }
    : { status: "fail", error: "MUX_TOKEN_ID or MUX_TOKEN_SECRET not set" };

  // Determine overall health
  const isHealthy = Object.values(checks).every((c) => c.status === "pass");

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
