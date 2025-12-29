import { NextResponse } from "next/server";

/**
 * Server Time API Endpoint
 *
 * Returns the current server time in milliseconds.
 * All clients use this as the authoritative time source
 * to ensure synchronized playback across all viewers.
 */
export async function GET() {
  return NextResponse.json(
    {
      serverTime: Date.now(),
      iso: new Date().toISOString(),
    },
    {
      headers: {
        // Cache at edge for 1 second - allows massive scale
        // while keeping time accurate within acceptable drift
        "Cache-Control": "public, s-maxage=1, stale-while-revalidate=1",
      },
    }
  );
}
