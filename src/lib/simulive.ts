/**
 * Simulated Live Stream Utilities
 *
 * Core logic for synchronizing all viewers to the same position
 * in a pre-recorded video to simulate a live broadcast.
 */

export interface SimuliveConfig {
  /** The scheduled start time of the "broadcast" (ISO 8601 string or Date) */
  scheduledStart: string | Date;
  /** Total duration of the video in seconds */
  videoDuration: number;
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
  /** Current position in the video (seconds) */
  currentPosition: number;
  /** Seconds until broadcast starts (negative if already started) */
  secondsUntilStart: number;
  /** Seconds remaining in broadcast */
  secondsRemaining: number;
}

/**
 * Calculate the current state of the simulated live broadcast
 * based on server time and scheduled start.
 */
export function calculateSimuliveState(
  serverTimeMs: number,
  config: SimuliveConfig
): SimuliveState {
  const scheduledStartMs =
    typeof config.scheduledStart === "string"
      ? new Date(config.scheduledStart).getTime()
      : config.scheduledStart.getTime();

  const elapsedMs = serverTimeMs - scheduledStartMs;
  const elapsedSeconds = elapsedMs / 1000;

  const isLive = elapsedSeconds >= 0 && elapsedSeconds < config.videoDuration;
  const hasEnded = elapsedSeconds >= config.videoDuration;

  // Clamp position between 0 and video duration
  const currentPosition = Math.max(
    0,
    Math.min(elapsedSeconds, config.videoDuration)
  );

  const secondsUntilStart = Math.max(0, -elapsedSeconds);
  const secondsRemaining = Math.max(0, config.videoDuration - elapsedSeconds);

  return {
    isLive,
    hasEnded,
    currentPosition,
    secondsUntilStart,
    secondsRemaining,
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
export async function fetchServerTime(): Promise<number> {
  const response = await fetch("/api/time");
  const data = await response.json();
  return data.serverTime;
}
