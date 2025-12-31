"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import {
  calculateSimuliveState,
  fetchServerTime,
  hasDrifted,
  type SimuliveConfig,
  type SimuliveState,
} from "@/lib/simulive";

interface PlaybackTokens {
  "playback-token"?: string;
  "thumbnail-token"?: string;
  "storyboard-token"?: string;
}

interface SimulatedLivePlayerProps {
  playbackId: string;
  playbackPolicy?: string;
  scheduledStart: string;
  videoDuration: number;
  title?: string;
  syncInterval?: number;
  driftTolerance?: number;
}

// Format seconds into countdown display
function formatCountdown(seconds: number): { days: number; hours: number; minutes: number; secs: number } {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return { days, hours, minutes, secs };
}

// Countdown digit component with flip animation
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="countdown-unit">
      <div className="countdown-value">
        {value.toString().padStart(2, "0")}
      </div>
      <div className="countdown-label">{label}</div>
    </div>
  );
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [state, setState] = useState<SimuliveState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [tokens, setTokens] = useState<PlaybackTokens | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [showBadge, setShowBadge] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);

  const config: SimuliveConfig = {
    scheduledStart,
    videoDuration,
    syncInterval,
    driftTolerance,
  };

  const lastSyncTimeRef = useRef<number>(Date.now());
  const expectedElapsedRef = useRef<number>(0);

  // Calibrate server time offset
  const calibrateTime = useCallback(async () => {
    try {
      const serverTime = await fetchServerTime();
      const now = Date.now();
      const offset = serverTime - now;
      setServerTimeOffset(offset);
      lastSyncTimeRef.current = now;
      expectedElapsedRef.current = 0;
    } catch (error) {
      console.error("Failed to fetch server time:", error);
      setServerTimeOffset(0);
    }
  }, []);

  useEffect(() => {
    calibrateTime();
  }, [calibrateTime]);

  useEffect(() => {
    const recalibrationInterval = setInterval(() => calibrateTime(), 60000);
    return () => clearInterval(recalibrationInterval);
  }, [calibrateTime]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        calibrateTime();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [calibrateTime]);

  useEffect(() => {
    const clockCheckInterval = setInterval(() => {
      const now = Date.now();
      const actualElapsed = now - lastSyncTimeRef.current;
      expectedElapsedRef.current += 5000;
      if (Math.abs(actualElapsed - expectedElapsedRef.current) > 2000) {
        calibrateTime();
      }
    }, 5000);
    return () => clearInterval(clockCheckInterval);
  }, [calibrateTime]);

  useEffect(() => {
    if (playbackPolicy !== "signed") {
      setTokens(null);
      return;
    }

    async function fetchTokens() {
      try {
        const res = await fetch(`/api/tokens/${playbackId}`);
        if (!res.ok) throw new Error("Failed to fetch tokens");
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

  const getSyncedTime = useCallback(() => {
    return Date.now() + serverTimeOffset;
  }, [serverTimeOffset]);

  const syncPlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    const currentState = calculateSimuliveState(getSyncedTime(), config);
    setState(currentState);

    if (currentState.isLive) {
      const actualPosition = player.currentTime || 0;
      const expectedPosition = currentState.currentPosition;

      if (hasDrifted(actualPosition, expectedPosition, driftTolerance)) {
        player.currentTime = expectedPosition;
      }

      if (player.paused) {
        player.play().catch(() => {});
      }
    } else if (currentState.hasEnded) {
      player.currentTime = videoDuration;
      player.pause();
    }

    setIsLoading(false);
  }, [config, getSyncedTime, driftTolerance, videoDuration]);

  useEffect(() => {
    const initialTimer = setTimeout(syncPlayer, 500);
    const intervalId = setInterval(syncPlayer, syncInterval);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [syncPlayer, syncInterval]);

  useEffect(() => {
    if (!state || state.isLive || state.hasEnded) return;
    const countdownInterval = setInterval(() => {
      const currentState = calculateSimuliveState(getSyncedTime(), config);
      setState(currentState);
    }, 1000);
    return () => clearInterval(countdownInterval);
  }, [state, config, getSyncedTime]);

  const handleLoadedMetadata = useCallback(() => {
    setPlayerReady(true);
    syncPlayer();
  }, [syncPlayer]);

  const handleSeeking = useCallback(() => {
    syncPlayer();
  }, [syncPlayer]);

  const handlePause = useCallback(() => {
    const currentState = calculateSimuliveState(getSyncedTime(), config);
    if (currentState.isLive) {
      const player = playerRef.current;
      if (player) {
        setTimeout(() => {
          if (player.paused && currentState.isLive) {
            player.play().catch(() => {});
          }
        }, 100);
      }
    }
  }, [config, getSyncedTime]);

  const resetBadgeTimer = useCallback(() => {
    setShowBadge(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowBadge(false), 3000);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    resetBadgeTimer();
    const handleMouseMove = () => resetBadgeTimer();
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseMove);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetBadgeTimer]);

  const showCountdown = state && !state.isLive && state.secondsUntilStart > 0;
  const showEnded = state?.hasEnded;
  const showPlayer = state?.isLive;

  // Calculate progress percentage
  const progressPercent = state?.isLive
    ? (state.currentPosition / videoDuration) * 100
    : state?.hasEnded ? 100 : 0;

  // Countdown values
  const countdown = showCountdown && state ? formatCountdown(state.secondsUntilStart) : null;
  const isStartingSoon = countdown && state && state.secondsUntilStart <= 60;

  return (
    <div className="simulive-container" ref={containerRef}>
      {/* Countdown overlay */}
      {showCountdown && countdown && (
        <div className={`overlay-state countdown-overlay ${isStartingSoon ? 'starting-soon' : ''}`}>
          <div className="countdown-content">
            {/* Animated rings */}
            <div className="countdown-rings">
              <div className="ring ring-1"></div>
              <div className="ring ring-2"></div>
              <div className="ring ring-3"></div>
            </div>

            {/* Title */}
            <div className="countdown-title">{title}</div>

            {/* Status text */}
            <div className="countdown-status">
              {isStartingSoon ? "Starting soon..." : "Stream starts in"}
            </div>

            {/* Countdown display */}
            <div className="countdown-timer">
              {countdown.days > 0 && (
                <CountdownUnit value={countdown.days} label="days" />
              )}
              <CountdownUnit value={countdown.hours} label="hrs" />
              <CountdownUnit value={countdown.minutes} label="min" />
              <CountdownUnit value={countdown.secs} label="sec" />
            </div>

            {/* Scheduled time */}
            <div className="countdown-scheduled">
              {new Date(scheduledStart).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      )}

      {/* Ended overlay */}
      {showEnded && (
        <div className="overlay-state ended-overlay">
          <div className="ended-content">
            <div className="ended-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ended-title">Stream Ended</div>
            <div className="ended-subtitle">{title}</div>
            <div className="ended-info">
              Aired on {new Date(scheduledStart).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>
      )}

      {/* Live badge */}
      {showPlayer && (
        <div className={`live-badge ${showBadge ? "visible" : "hidden"}`}>
          <span className="live-dot" />
          LIVE
        </div>
      )}

      {/* Progress bar */}
      {showPlayer && (
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && !showCountdown && !showEnded && (
        <div className="overlay-state loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner">
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
            </div>
            <div className="loading-text">Connecting to stream...</div>
          </div>
        </div>
      )}

      {/* Token error */}
      {tokenError && (
        <div className="overlay-state error-overlay">
          <div className="error-content">
            <div className="error-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div className="error-text">{tokenError}</div>
          </div>
        </div>
      )}

      {/* Player */}
      {(playbackPolicy === "public" || tokens) && !tokenError && (
        <MuxPlayer
          ref={playerRef}
          playbackId={playbackId}
          streamType="on-demand"
          className={`simulive-player aspect-video rounded-lg overflow-hidden ${playerReady ? 'ready' : ''}`}
          metadata={{ video_title: title }}
          autoPlay="muted"
          onLoadedMetadata={handleLoadedMetadata}
          onSeeking={handleSeeking}
          onPause={handlePause}
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
