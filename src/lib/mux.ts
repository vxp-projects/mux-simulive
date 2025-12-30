import Mux from "@mux/mux-node";
import { getMuxConfig, getSigningKeys } from "./config";

let muxClient: Mux | null = null;

export function getMuxClient(): Mux | null {
  if (!muxClient) {
    const config = getMuxConfig();
    if (!config) {
      return null;
    }
    const signingKeys = getSigningKeys();
    muxClient = new Mux({
      tokenId: config.tokenId,
      tokenSecret: config.tokenSecret,
      ...(signingKeys && {
        jwtSigningKey: signingKeys.keyId,
        jwtPrivateKey: signingKeys.privateKey,
      }),
    });
  }
  return muxClient;
}

export interface MuxAssetInfo {
  id: string;
  playbackId: string | null;
  playbackPolicy: string | null;
  duration: number | null;
  status: string;
  aspectRatio: string | null;
  resolution: string | null;
}

/**
 * Fetch asset details from Mux API
 */
export async function getAssetInfo(assetId: string): Promise<MuxAssetInfo> {
  const mux = getMuxClient();
  if (!mux) {
    throw new Error("Mux is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.");
  }

  const asset = await mux.video.assets.retrieve(assetId);

  // Get playback ID - prefer public, fall back to signed
  const publicPlayback = asset.playback_ids?.find((p) => p.policy === "public");
  const signedPlayback = asset.playback_ids?.find((p) => p.policy === "signed");
  const playback = publicPlayback || signedPlayback;

  return {
    id: asset.id,
    playbackId: playback?.id || null,
    playbackPolicy: playback?.policy || null,
    duration: asset.duration || null,
    status: asset.status,
    aspectRatio: asset.aspect_ratio || null,
    resolution: asset.resolution_tier || null,
  };
}

/**
 * List ALL assets from Mux account (handles cursor-based pagination)
 */
export async function listAssets() {
  const mux = getMuxClient();
  if (!mux) {
    throw new Error("Mux is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.");
  }

  const allAssets: {
    id: string;
    playbackId: string | null;
    playbackPolicy: string | null;
    duration: number | null;
    status: string;
    createdAt: string;
  }[] = [];

  let pageNumber = 1;
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    // Fetch page with cursor if available
    const params: { limit: number; cursor?: string } = { limit: 100 };
    if (cursor) {
      params.cursor = cursor;
    }
    const response = await mux.video.assets.list(params);

    // Access raw response to get next_cursor
    const rawResponse = response as unknown as {
      data: typeof response.data;
      next_cursor?: string | null;
    };

    console.log(`[Mux] Page ${pageNumber}: fetched ${response.data.length} assets, next_cursor: ${rawResponse.next_cursor || 'null'}`);

    // Process assets - include both public and signed playback IDs
    for (const asset of response.data) {
      const publicPlayback = asset.playback_ids?.find(
        (p) => p.policy === "public"
      );
      const signedPlayback = asset.playback_ids?.find(
        (p) => p.policy === "signed"
      );
      // Prefer public, fall back to signed
      const playback = publicPlayback || signedPlayback;
      allAssets.push({
        id: asset.id,
        playbackId: playback?.id || null,
        playbackPolicy: playback?.policy || null,
        duration: asset.duration || null,
        status: asset.status,
        createdAt: asset.created_at,
      });
    }

    // Check for next page
    if (rawResponse.next_cursor) {
      cursor = rawResponse.next_cursor;
      pageNumber++;
    } else {
      hasMore = false;
    }
  }

  console.log(`[Mux] Total: fetched ${allAssets.length} assets across ${pageNumber} pages`);
  return allAssets;
}

/**
 * Create a new asset from a URL
 */
export async function createAssetFromUrl(url: string) {
  const mux = getMuxClient();
  if (!mux) {
    throw new Error("Mux is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.");
  }

  const asset = await mux.video.assets.create({
    input: [{ url }],
    playback_policy: ["public"],
  });

  return {
    id: asset.id,
    status: asset.status,
  };
}

/**
 * Generate signed playback tokens for a playback ID
 */
export async function generatePlaybackTokens(playbackId: string) {
  const mux = getMuxClient();
  if (!mux) {
    throw new Error("Mux is not configured.");
  }

  const signingKeys = getSigningKeys();
  if (!signingKeys) {
    throw new Error("Signing keys not configured. Set MUX_SIGNING_KEY and MUX_PRIVATE_KEY.");
  }

  // Generate tokens for playback, thumbnail, and storyboard
  const tokens = await mux.jwt.signPlaybackId(playbackId, {
    expiration: "7d",
    type: ["video", "thumbnail", "storyboard"],
  });

  return tokens;
}
