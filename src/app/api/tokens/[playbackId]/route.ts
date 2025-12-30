import { NextRequest, NextResponse } from "next/server";
import { generatePlaybackTokens } from "@/lib/mux";
import { isSigningConfigured } from "@/lib/config";
import { getCached, setCached, isRedisConfigured } from "@/lib/redis";

interface RouteParams {
  params: Promise<{ playbackId: string }>;
}

// Cache TTL: 6 hours (tokens are valid for 7 days, so 6 hours is safe)
const TOKEN_CACHE_TTL = 6 * 60 * 60;

// GET /api/tokens/[playbackId] - Generate signed playback tokens
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { playbackId } = await params;

  if (!isSigningConfigured()) {
    return NextResponse.json(
      { error: "Signing keys not configured" },
      { status: 503 }
    );
  }

  const cacheKey = `tokens:${playbackId}`;

  // Try to get cached tokens first
  if (isRedisConfigured()) {
    const cachedTokens = await getCached<Record<string, string>>(cacheKey);
    if (cachedTokens) {
      console.log(`[Tokens] Cache HIT for ${playbackId}`);
      return NextResponse.json(cachedTokens);
    }
    console.log(`[Tokens] Cache MISS for ${playbackId}`);
  }

  try {
    const tokens = await generatePlaybackTokens(playbackId);

    // Cache the tokens if Redis is available
    if (isRedisConfigured()) {
      await setCached(cacheKey, tokens, TOKEN_CACHE_TTL);
    }

    return NextResponse.json(tokens);
  } catch (error) {
    console.error("Failed to generate tokens:", error);
    return NextResponse.json(
      { error: "Failed to generate playback tokens" },
      { status: 500 }
    );
  }
}
