import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAssetInfo } from "@/lib/mux";
import { isApiAuthenticated } from "@/lib/auth";
import { getCached, setCached, deleteCached } from "@/lib/redis";

const STREAMS_CACHE_KEY = "streams:all";
const STREAMS_CACHE_TTL = 30; // 30 seconds

// GET /api/streams - List all streams (with Redis caching)
export async function GET() {
  try {
    // Try to get from cache first
    const cached = await getCached<unknown[]>(STREAMS_CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Cache": "HIT" },
      });
    }

    // Cache miss - fetch from database
    const streams = await prisma.stream.findMany({
      orderBy: { scheduledStart: "desc" },
    });

    // Store in cache
    await setCached(STREAMS_CACHE_KEY, streams, STREAMS_CACHE_TTL);

    return NextResponse.json(streams, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("Failed to fetch streams:", error);
    return NextResponse.json(
      { error: "Failed to fetch streams" },
      { status: 500 }
    );
  }
}

// Helper to invalidate streams cache
async function invalidateStreamsCache() {
  await deleteCached(STREAMS_CACHE_KEY);
}

// POST /api/streams - Create a new stream
export async function POST(request: NextRequest) {
  if (!(await isApiAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { slug, title, assetId, scheduledStart, syncInterval, driftTolerance } = body;

    // Validate required fields
    if (!slug || !title || !assetId || !scheduledStart) {
      return NextResponse.json(
        { error: "Missing required fields: slug, title, assetId, scheduledStart" },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existing = await prisma.stream.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "A stream with this slug already exists" },
        { status: 409 }
      );
    }

    // Fetch asset info from Mux to get playback ID and duration
    let assetInfo;
    try {
      assetInfo = await getAssetInfo(assetId);
    } catch (error) {
      console.error("Failed to fetch asset info:", error);
      return NextResponse.json(
        { error: "Failed to fetch asset from Mux. Check that the Asset ID is correct." },
        { status: 400 }
      );
    }

    if (!assetInfo.playbackId) {
      return NextResponse.json(
        { error: "Asset does not have a public playback ID" },
        { status: 400 }
      );
    }

    if (assetInfo.status !== "ready") {
      return NextResponse.json(
        { error: `Asset is not ready. Current status: ${assetInfo.status}` },
        { status: 400 }
      );
    }

    // Create the stream
    const stream = await prisma.stream.create({
      data: {
        slug,
        title,
        assetId,
        playbackId: assetInfo.playbackId,
        playbackPolicy: assetInfo.playbackPolicy || "public",
        duration: assetInfo.duration || 0,
        scheduledStart: new Date(scheduledStart),
        syncInterval: syncInterval || 5000,
        driftTolerance: driftTolerance || 2,
        isActive: false,
      },
    });

    // Invalidate cache after creating stream
    await invalidateStreamsCache();

    return NextResponse.json(stream, { status: 201 });
  } catch (error) {
    console.error("Failed to create stream:", error);
    return NextResponse.json(
      { error: "Failed to create stream" },
      { status: 500 }
    );
  }
}
