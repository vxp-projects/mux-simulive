import Mux from "@mux/mux-node";
import { getMuxConfig } from "./config";

let muxClient: Mux | null = null;

export function getMuxClient(): Mux | null {
  if (!muxClient) {
    const config = getMuxConfig();
    if (!config) {
      return null;
    }
    muxClient = new Mux({
      tokenId: config.tokenId,
      tokenSecret: config.tokenSecret,
    });
  }
  return muxClient;
}

export interface MuxAssetInfo {
  id: string;
  playbackId: string | null;
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

  // Get the public playback ID
  const publicPlayback = asset.playback_ids?.find((p) => p.policy === "public");

  return {
    id: asset.id,
    playbackId: publicPlayback?.id || null,
    duration: asset.duration || null,
    status: asset.status,
    aspectRatio: asset.aspect_ratio || null,
    resolution: asset.resolution_tier || null,
  };
}

/**
 * List ALL assets from Mux account (handles pagination)
 */
export async function listAssets() {
  const mux = getMuxClient();
  if (!mux) {
    throw new Error("Mux is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.");
  }

  const allAssets: {
    id: string;
    playbackId: string | null;
    duration: number | null;
    status: string;
    createdAt: string;
  }[] = [];

  // Mux API max limit per page is 100
  const pageSize = 100;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await mux.video.assets.list({
      limit: pageSize,
      page: page,
    });

    const assets = response.data.map((asset) => {
      const publicPlayback = asset.playback_ids?.find(
        (p) => p.policy === "public"
      );
      return {
        id: asset.id,
        playbackId: publicPlayback?.id || null,
        duration: asset.duration || null,
        status: asset.status,
        createdAt: asset.created_at,
      };
    });

    allAssets.push(...assets);

    // If we got fewer than pageSize, we've reached the end
    if (assets.length < pageSize) {
      hasMore = false;
    } else {
      page++;
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
