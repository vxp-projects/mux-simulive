import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCached, setCached, isRedisConfigured } from "@/lib/redis";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface StreamStatus {
  endedAt: string | null;
  isActive: boolean;
}

const STATUS_CACHE_TTL = 2; // 2 seconds - balance between responsiveness and load
const inflightStatus = new Map<string, Promise<StreamStatus | null>>();

async function fetchStreamStatus(id: string, cacheKey: string): Promise<StreamStatus | null> {
  // Try to find by ID first, then by slug
  let stream = await prisma.stream.findUnique({
    where: { id },
    select: { endedAt: true, isActive: true },
  });

  if (!stream) {
    stream = await prisma.stream.findUnique({
      where: { slug: id },
      select: { endedAt: true, isActive: true },
    });
  }

  if (!stream) {
    return null;
  }

  const status: StreamStatus = {
    endedAt: stream.endedAt?.toISOString() || null,
    isActive: stream.isActive,
  };

  // Cache the result
  await setCached(cacheKey, status, STATUS_CACHE_TTL);

  return status;
}

// GET /api/streams/[id]/status - Lightweight status check for polling
export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: "Redis is required." },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;
    const cacheKey = `stream:${id}:status`;

    // Check cache first
    const cached = await getCached<StreamStatus>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Cache": "HIT" },
      });
    }

    const inflight = inflightStatus.get(cacheKey);
    if (inflight) {
      const status = await inflight;
      if (!status) {
        return NextResponse.json({ error: "Stream not found" }, { status: 404 });
      }
      return NextResponse.json(status, {
        headers: { "X-Cache": "COALESCED" },
      });
    }

    const fetchPromise = (async () => {
      try {
        return await fetchStreamStatus(id, cacheKey);
      } finally {
        inflightStatus.delete(cacheKey);
      }
    })();

    inflightStatus.set(cacheKey, fetchPromise);

    const status = await fetchPromise;
    if (!status) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    return NextResponse.json(status, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("Failed to fetch stream status:", error);
    return NextResponse.json(
      { error: "Failed to fetch stream status" },
      { status: 500 }
    );
  }
}
