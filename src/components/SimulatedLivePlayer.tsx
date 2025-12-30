"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import {
  calculateSimuliveState,
  fetchServerTime,
  hasDrifted,
  formatTime,
  type SimuliveConfig,
  type SimuliveState,
} from "@/lib/simulive";

interface PlaybackTokens {
  "playback-token"?: string;
  "thumbnail-token"?: string;
  "storyboard-token"?: string;
}

interface SimulatedLivePlayerProps {
  /** Mux playback ID for the on-demand asset */
  playbackId: string;
  /** Playback policy: "public" or "signed" */
  playbackPolicy?: string;
  /** Scheduled start time (ISO 8601 string) */
  scheduledStart: string;
  /** Video duration in seconds */
  videoDuration: number;
  /** Optional title for the stream */
  title?: string;
  /** How often to sync position (ms), default 5000 */
  syncInterval?: number;
  /** Max allowed drift before forcing resync (seconds), default 3 */
  driftTolerance?: number;
}

export default function SimulatedLivePlayer({
  playbackId,
  playbackPolicy = "public",
  scheduledStart,
  videoDuration,
  title = "Live Stream",
  syncInterval = 5000,
  driftTolerance = 3,
}: SimulatedLivePlayerProps) {
  const playerRef = useRef<MuxPlayerElement | null>(null);
  const [state, setState] = useState<SimuliveState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [tokens, setTokens] = useState<PlaybackTokens | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const config: SimuliveConfig = {
    scheduledStart,
    videoDuration,
    syncInterval,
    driftTolerance,
  };

  // Calculate server time offset on mount
  useEffect(() => {
    async function calibrateTime() {
      try {
        const before = Date.now();
        const serverTime = await fetchServerTime();
        const after = Date.now();
        const latency = (after - before) / 2;
        // Offset = how much to add to local time to get server time
        const offset = serverTime - (before + latency);
        setServerTimeOffset(offset);
      } catch (error) {
        console.error("Failed to fetch server time:", error);
        // Fall back to local time if server time unavailable
        setServerTimeOffset(0);
      }
    }
    calibrateTime();
  }, []);

  // Fetch tokens for signed playback
  useEffect(() => {
    if (playbackPolicy !== "signed") {
      setTokens(null);
      return;
    }

    async function fetchTokens() {
      try {
        const res = await fetch(`/api/tokens/${playbackId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch tokens");
        }
        const data = await res.json();
        setTokens(data);
        setTokenError(null);
      } catch (error) {
        console.error("Failed to fetch playback tokens:", error);
        setTokenError("Unable to load signed video");
      }
    }
    fetchTokens();
  }, [playbackId, playbackPolicy]);

  // Get current synced time (local time adjusted by server offset)
  const getSyncedTime = useCallback(() => {
    return Date.now() + serverTimeOffset;
  }, [serverTimeOffset]);

  // Sync player to correct position
  const syncPlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    const currentState = calculateSimuliveState(getSyncedTime(), config);
    setState(currentState);

    if (currentState.isLive) {
      const actualPosition = player.currentTime || 0;
      const expectedPosition = currentState.currentPosition;

      // Only force sync if drifted beyond tolerance
      if (hasDrifted(actualPosition, expectedPosition, driftTolerance)) {
        console.log(
          `Syncing: actual=${actualPosition.toFixed(1)}s, expected=${expectedPosition.toFixed(1)}s`
        );
        player.currentTime = expectedPosition;
      }

      // Ensure playing
      if (player.paused) {
        player.play().catch(() => {
          // Autoplay might be blocked, that's okay
        });
      }
    } else if (currentState.hasEnded) {
      // Seek to end
      player.currentTime = videoDuration;
      player.pause();
    }

    setIsLoading(false);
  }, [config, getSyncedTime, driftTolerance, videoDuration]);

  // Initial sync and periodic re-sync
  useEffect(() => {
    // Initial sync after a short delay to let player load
    const initialTimer = setTimeout(syncPlayer, 500);

    // Periodic sync
    const intervalId = setInterval(syncPlayer, syncInterval);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [syncPlayer, syncInterval]);

  // Countdown ticker - updates every second while waiting for stream to start
  useEffect(() => {
    if (!state || state.isLive || state.hasEnded) return;

    const countdownInterval = setInterval(() => {
      const currentState = calculateSimuliveState(getSyncedTime(), config);
      setState(currentState);
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [state, config, getSyncedTime]);

  // Handle player ready
  const handleLoadedMetadata = useCallback(() => {
    syncPlayer();
  }, [syncPlayer]);

  // Prevent seeking by immediately resyncing
  const handleSeeking = useCallback(() => {
    // Immediately resync to prevent user from scrubbing
    syncPlayer();
  }, [syncPlayer]);

  // Handle pause - resume playback if still live
  const handlePause = useCallback(() => {
    const currentState = calculateSimuliveState(getSyncedTime(), config);
    if (currentState.isLive) {
      const player = playerRef.current;
      if (player) {
        // Small delay to prevent rapid pause/play cycles
        setTimeout(() => {
          if (player.paused && currentState.isLive) {
            player.play().catch(() => {});
          }
        }, 100);
      }
    }
  }, [config, getSyncedTime]);

  // Determine what overlay to show
  const showCountdown = state && !state.isLive && state.secondsUntilStart > 0;
  const showEnded = state?.hasEnded;
  const showPlayer = state?.isLive;

  return (
    <div className="simulive-container">
      {/* Countdown overlay - shown before stream starts */}
      {showCountdown && (
        <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center z-30 rounded-lg">
          <div className="text-2xl font-bold mb-4">Stream Starting Soon</div>
          <div className="text-6xl font-mono tabular-nums">
            {formatTime(state.secondsUntilStart)}
          </div>
          <div className="text-gray-400 mt-4">{title}</div>
        </div>
      )}

      {/* Ended overlay - shown after stream ends */}
      {showEnded && (
        <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center z-30 rounded-lg">
          <div className="text-2xl font-bold mb-2">Stream Ended</div>
          <div className="text-gray-400">{title}</div>
        </div>
      )}

      {/* Live badge overlay */}
      {showPlayer && <div className="live-badge">Live</div>}

      {/* Loading overlay */}
      {isLoading && !showCountdown && !showEnded && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-20 rounded-lg">
          <div className="text-xl">Loading stream...</div>
        </div>
      )}

      {/* Token error for signed content */}
      {tokenError && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-20 rounded-lg">
          <div className="text-xl text-red-400">{tokenError}</div>
        </div>
      )}

      {/* Player is always mounted (but hidden during countdown/ended) for smooth transitions */}
      {(playbackPolicy === "public" || tokens) && !tokenError && (
        <MuxPlayer
          ref={playerRef}
          playbackId={playbackId}
          streamType="live"
          className="simulive-player aspect-video rounded-lg overflow-hidden"
          metadata={{
            video_title: title,
          }}
          // Disable seeking via hotkeys
          hotkeys="noarrowleft noarrowright"
          // Auto-play muted to comply with browser policies
          autoPlay="muted"
          // Event handlers
          onLoadedMetadata={handleLoadedMetadata}
          onSeeking={handleSeeking}
          onPause={handlePause}
          // Signed playback tokens
          {...(tokens && {
            tokens: {
              playback: tokens["playback-token"],
              thumbnail: tokens["thumbnail-token"],
              storyboard: tokens["storyboard-token"],
            },
          })}
        />
      )}
    </div>
  );
}
