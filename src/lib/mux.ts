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

export interface MuxAssetListItem {
  id: string;
  playbackId: string | null;
  playbackPolicy: string | null;
  duration: number | null;
  status: string;
  createdAt: string;
  title: string | null;
}

export interface PaginatedAssetsResponse {
  assets: MuxAssetListItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
}

/**
 * List assets from Mux account with pagination
 * @param limit Number of assets per page (default 20, max 100)
 * @param cursor Cursor for next page (from previous response)
 */
export async function listAssets(
  limit: number = 20,
  cursor?: string
): Promise<PaginatedAssetsResponse> {
  const mux = getMuxClient();
  if (!mux) {
    throw new Error("Mux is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.");
  }

  // Clamp limit to valid range
  const safeLimit = Math.min(Math.max(1, limit), 100);

  const params: { limit: number; cursor?: string } = { limit: safeLimit };
  if (cursor) {
    params.cursor = cursor;
  }

  const response = await mux.video.assets.list(params);

  // Access raw response to get next_cursor
  const rawResponse = response as unknown as {
    data: typeof response.data;
    next_cursor?: string | null;
  };

  // Process assets
  const assets: MuxAssetListItem[] = response.data.map((asset) => {
    const publicPlayback = asset.playback_ids?.find((p) => p.policy === "public");
    const signedPlayback = asset.playback_ids?.find((p) => p.policy === "signed");
    const playback = publicPlayback || signedPlayback;

    // Access meta field (not in SDK types but exists in API response)
    const assetWithMeta = asset as typeof asset & { meta?: { title?: string } };

    return {
      id: asset.id,
      playbackId: playback?.id || null,
      playbackPolicy: playback?.policy || null,
      duration: asset.duration || null,
      status: asset.status,
      // Convert Unix seconds to ISO string for proper date parsing
      createdAt: new Date(Number(asset.created_at) * 1000).toISOString(),
      title: assetWithMeta.meta?.title || null,
    };
  });

  return {
    assets,
    pagination: {
      hasMore: !!rawResponse.next_cursor,
      nextCursor: rawResponse.next_cursor || null,
      limit: safeLimit,
    },
  };
}

/**
 * List ALL assets from Mux account (fetches all pages)
 * Use with caution - can be slow and memory-intensive with many assets
 */
export async function listAllAssets(): Promise<MuxAssetListItem[]> {
  const allAssets: MuxAssetListItem[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await listAssets(100, cursor);
    allAssets.push(...response.assets);

    if (response.pagination.hasMore && response.pagination.nextCursor) {
      cursor = response.pagination.nextCursor;
    } else {
      hasMore = false;
    }
  }

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
