import Mux from "@mux/mux-node";
import { getMuxConfig } from "./config";

let muxClient: Mux | null = null;

export function getMuxClient(): Mux {
  if (!muxClient) {
    const { tokenId, tokenSecret } = getMuxConfig();
    muxClient = new Mux({
      tokenId,
      tokenSecret,
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
 * List all assets from Mux account
 */
export async function listAssets(limit: number = 20) {
  const mux = getMuxClient();
  const response = await mux.video.assets.list({ limit });

  return response.data.map((asset) => {
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
}

/**
 * Create a new asset from a URL
 */
export async function createAssetFromUrl(url: string) {
  const mux = getMuxClient();
  const asset = await mux.video.assets.create({
    input: [{ url }],
    playback_policy: ["public"],
  });

  return {
    id: asset.id,
    status: asset.status,
  };
}
