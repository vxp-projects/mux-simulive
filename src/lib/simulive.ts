/**
 * Simulated Live Stream Utilities
 *
 * Core logic for synchronizing all viewers to the same position
 * in a pre-recorded video to simulate a live broadcast.
 * Supports playlists (multiple videos) and looping.
 */

export interface PlaylistItem {
  id: string;
  playbackId: string;
  playbackPolicy: string;
  duration: number;
  order: number;
}

export interface SimuliveConfig {
  /** The scheduled start time of the "broadcast" (ISO 8601 string or Date) */
  scheduledStart: string | Date;
  /** Playlist items in order */
  items: PlaylistItem[];
  /** Number of times to loop the playlist (1-10) */
  loopCount: number;
  /** How often to re-sync the player position (ms) */
  syncInterval?: number;
  /** Tolerance in seconds before forcing a resync */
  driftTolerance?: number;
}

export interface SimuliveState {
  /** Whether the broadcast has started */
  isLive: boolean;
  /** Whether the broadcast has ended */
  hasEnded: boolean;
  /** Current position in the current video (seconds) */
  currentPosition: number;
  /** Seconds until broadcast starts (negative if already started) */
  secondsUntilStart: number;
  /** Seconds remaining in entire broadcast */
  secondsRemaining: number;
  /** Current playlist item index (0-based) */
  currentItemIndex: number;
  /** Current loop number (1-based) */
  currentLoop: number;
  /** Total duration of entire broadcast (all loops) */
  totalDuration: number;
}

export interface StreamStatus {
  endedAt: string | null;
  isActive: boolean;
}

export interface ServerTimeResponse {
  serverTime: number;
  iso: string;
  stream?: StreamStatus | null;
}

/**
 * Calculate total duration of playlist (single pass)
 */
export function getPlaylistDuration(items: PlaylistItem[]): number {
  return items.reduce((sum, item) => sum + item.duration, 0);
}

/**
 * Calculate the current state of the simulated live broadcast
 * based on server time and scheduled start.
 * Handles playlists and looping.
 */
export function calculateSimuliveState(
  serverTimeMs: number,
  config: SimuliveConfig
): SimuliveState {
  const scheduledStartMs =
    typeof config.scheduledStart === "string"
      ? new Date(config.scheduledStart).getTime()
      : config.scheduledStart.getTime();

  const playlistDuration = getPlaylistDuration(config.items);
  const totalDuration = playlistDuration * config.loopCount;

  const elapsedMs = serverTimeMs - scheduledStartMs;
  const elapsedSeconds = elapsedMs / 1000;

  const isLive = elapsedSeconds >= 0 && elapsedSeconds < totalDuration;
  const hasEnded = elapsedSeconds >= totalDuration;

  const secondsUntilStart = Math.max(0, -elapsedSeconds);
  const secondsRemaining = Math.max(0, totalDuration - elapsedSeconds);

  // Default values for before start or after end
  let currentPosition = 0;
  let currentItemIndex = 0;
  let currentLoop = 1;

  if (isLive && config.items.length > 0) {
    // Calculate which loop we're in
    const elapsedInBroadcast = Math.max(0, elapsedSeconds);
    currentLoop = Math.min(
      config.loopCount,
      Math.floor(elapsedInBroadcast / playlistDuration) + 1
    );

    // Calculate position within current loop
    const positionInLoop = elapsedInBroadcast % playlistDuration;

    // Find which item we're on and position within it
    let accumulated = 0;
    for (let i = 0; i < config.items.length; i++) {
      const itemDuration = config.items[i].duration;
      if (positionInLoop < accumulated + itemDuration) {
        currentItemIndex = i;
        currentPosition = positionInLoop - accumulated;
        break;
      }
      accumulated += itemDuration;
    }
  } else if (hasEnded && config.items.length > 0) {
    // At the end, show last item at its end
    currentItemIndex = config.items.length - 1;
    currentPosition = config.items[currentItemIndex].duration;
    currentLoop = config.loopCount;
  }

  return {
    isLive,
    hasEnded,
    currentPosition,
    secondsUntilStart,
    secondsRemaining,
    currentItemIndex,
    currentLoop,
    totalDuration,
  };
}

/**
 * Check if the player has drifted too far from the expected position
 */
export function hasDrifted(
  actualPosition: number,
  expectedPosition: number,
  tolerance: number = 3
): boolean {
  return Math.abs(actualPosition - expectedPosition) > tolerance;
}

/**
 * Format seconds as MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Fetch the current server time
 * This ensures all clients use the same time source
 */
export async function fetchServerTime(
  streamSlug?: string
): Promise<ServerTimeResponse> {
  const url = streamSlug
    ? `/api/time?stream=${encodeURIComponent(streamSlug)}`
    : "/api/time";
  const response = await fetch(url);
  const data = await response.json();
  return data;
}
