import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCached, setCached, isRedisConfigured } from "@/lib/redis";

interface StreamStatus {
  endedAt: string | null;
  isActive: boolean;
}

const STATUS_CACHE_TTL = 2; // seconds
const inflightStatus = new Map<string, Promise<StreamStatus | null>>();

// In-memory cache fallback when Redis is unavailable
const memoryCache = new Map<string, { data: StreamStatus; expires: number }>();
const MEMORY_CACHE_CLEANUP_INTERVAL = 60000; // Clean expired entries every 60s

// Periodic cleanup of expired memory cache entries
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryCache) {
      if (value.expires < now) {
        memoryCache.delete(key);
      }
    }
  }, MEMORY_CACHE_CLEANUP_INTERVAL);
}

async function fetchStreamStatus(
  id: string,
  cacheKey: string,
  redisEnabled: boolean
): Promise<StreamStatus | null> {
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

  // Always cache in memory as fallback
  memoryCache.set(cacheKey, {
    data: status,
    expires: Date.now() + STATUS_CACHE_TTL * 1000,
  });

  if (redisEnabled) {
    try {
      await setCached(cacheKey, status, STATUS_CACHE_TTL);
    } catch (error) {
      console.error("[Time] Failed to cache stream status:", error);
    }
  }

  return status;
}

/**
 * Server Time API Endpoint
 *
 * Returns the current server time in milliseconds.
 * Optionally includes stream status when a stream slug/ID is provided.
 * All clients use this as the authoritative time source
 * to ensure synchronized playback across all viewers.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const streamId = url.searchParams.get("stream");
  const redisEnabled = isRedisConfigured();
  let streamStatus: StreamStatus | null = null;

  if (streamId) {
    const cacheKey = `stream:${streamId}:status`;

    // Try Redis cache first
    if (redisEnabled) {
      try {
        const cached = await getCached<StreamStatus>(cacheKey);
        if (cached) {
          streamStatus = cached;
        }
      } catch (error) {
        console.error("[Time] Failed to read stream status cache:", error);
      }
    }

    // Fall back to in-memory cache
    if (!streamStatus) {
      const memoryCached = memoryCache.get(cacheKey);
      if (memoryCached && memoryCached.expires > Date.now()) {
        streamStatus = memoryCached.data;
      }
    }

    // Fetch from database if no cache hit
    if (!streamStatus) {
      const inflight = inflightStatus.get(cacheKey);
      if (inflight) {
        streamStatus = await inflight;
      } else {
        const fetchPromise = (async () => {
          try {
            return await fetchStreamStatus(streamId, cacheKey, redisEnabled);
          } finally {
            inflightStatus.delete(cacheKey);
          }
        })();
        inflightStatus.set(cacheKey, fetchPromise);
        streamStatus = await fetchPromise;
      }
    }
  }

  return NextResponse.json(
    {
      serverTime: Date.now(),
      iso: new Date().toISOString(),
      stream: streamId ? streamStatus : undefined,
    },
    {
      headers: {
        // Cache at edge for 2 seconds - allows massive scale
        // while keeping time accurate within drift tolerance (2-3s)
        "Cache-Control": "public, s-maxage=2, stale-while-revalidate=3",
      },
    }
  );
}
