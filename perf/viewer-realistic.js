import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://simulive.cloudysky.xyz";
const TARGET_VUS = Number(__ENV.TARGET_VUS || 2000);
const RAMP_UP = __ENV.RAMP_UP || "5m";
const HOLD = __ENV.HOLD || "10m";
const RAMP_DOWN = __ENV.RAMP_DOWN || "3m";
const LOOP_SLEEP = Number(__ENV.LOOP_SLEEP || 1);
const STATUS_INTERVAL = Number(__ENV.STATUS_INTERVAL || 30);
const TIME_INTERVAL = Number(__ENV.TIME_INTERVAL || 180);
const WATCH_SHARE = Number(__ENV.WATCH_SHARE || 0.4);
const STREAM_SLUG = __ENV.STREAM_SLUG || "";
const USE_ADAPTIVE_TIME = __ENV.USE_ADAPTIVE_TIME !== "0";
const JITTER_PERCENT = Number(__ENV.JITTER_PERCENT || 0.15);
const MIN_JITTER_MS = Number(__ENV.MIN_JITTER_MS || 5000);

const pageErrors = new Counter("page_errors");
const pageOkRate = new Rate("page_ok_rate");
const timeErrors = new Counter("time_errors");
const timeOkRate = new Rate("time_ok_rate");
const statusErrors = new Counter("status_errors");
const statusOkRate = new Rate("status_ok_rate");

export const options = {
  scenarios: {
    viewers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: TARGET_VUS },
        { duration: HOLD, target: TARGET_VUS },
        { duration: RAMP_DOWN, target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500"],
  },
};

let viewerInitialized = false;
let viewerSlug = "";
let viewerMode = "watch";
let nextStatusCheckAt = 0;
let nextTimeCheckAt = 0;
let serverTimeOffset = 0;
let streamTiming = null;

function pickStream(streams) {
  if (STREAM_SLUG) {
    return streams.find((stream) => stream.slug === STREAM_SLUG) || null;
  }
  return streams[0] || null;
}

function getTotalDurationSeconds(stream) {
  if (!stream || !Array.isArray(stream.items)) return 0;
  const playlistDuration = stream.items.reduce(
    (sum, item) => sum + Number(item && item.duration ? item.duration : 0),
    0
  );
  const loopCount = Number(stream.loopCount || 1);
  return playlistDuration > 0 ? playlistDuration * Math.max(1, loopCount) : 0;
}

function withJitter(intervalMs, jitterPercent = JITTER_PERCENT) {
  if (!isFinite(intervalMs)) return intervalMs;
  const jitter = intervalMs * jitterPercent * (Math.random() - 0.5) * 2;
  return Math.max(MIN_JITTER_MS, Math.round(intervalMs + jitter));
}

function calculateStreamState(serverTimeMs, timing) {
  if (!timing || !isFinite(timing.scheduledStartMs) || !isFinite(timing.totalDurationSeconds)) {
    return null;
  }
  const totalDuration = timing.totalDurationSeconds;
  if (totalDuration <= 0) return null;

  const elapsedSeconds = (serverTimeMs - timing.scheduledStartMs) / 1000;
  const isLive = elapsedSeconds >= 0 && elapsedSeconds < totalDuration;
  const hasEnded = elapsedSeconds >= totalDuration;
  const secondsUntilStart = Math.max(0, -elapsedSeconds);

  return { isLive, hasEnded, secondsUntilStart };
}

function getAdaptiveInterval(state) {
  if (!state) return 30000; // 30s while loading
  if (state.hasEnded) return Infinity; // Stop polling entirely
  if (state.isLive) return 180000; // 3 min when live
  if (state.secondsUntilStart > 3600) return 600000; // 10 min if >1hr away
  if (state.secondsUntilStart > 300) return 180000; // 3 min if >5min away
  if (state.secondsUntilStart > 60) return 30000; // 30s if >1min away
  return 10000; // 10s in final minute
}

function getSyncedTime() {
  return Date.now() + serverTimeOffset;
}

function updateServerTimeOffset(res) {
  if (!res || res.status !== 200) return;
  const payload = res.json();
  if (payload && typeof payload.serverTime === "number") {
    serverTimeOffset = payload.serverTime - Date.now();
  }
}

export function setup() {
  const streamsRes = http.get(`${BASE_URL}/api/streams`);
  const streams = streamsRes.status === 200 ? streamsRes.json() : [];
  const stream = Array.isArray(streams) ? pickStream(streams) : null;
  const slug = stream && stream.slug ? stream.slug : "";
  const scheduledStartMs = stream && stream.scheduledStart
    ? new Date(stream.scheduledStart).getTime()
    : 0;
  const totalDurationSeconds = getTotalDurationSeconds(stream);

  return { slug, scheduledStartMs, totalDurationSeconds };
}

function recordResult(res, okRate, errorCounter) {
  const ok = res && res.status === 200;
  okRate.add(ok);
  if (!ok) {
    errorCounter.add(1);
  }
  return ok;
}

function scheduleNextStatusCheck(now) {
  nextStatusCheckAt = now + withJitter(STATUS_INTERVAL * 1000);
}

function scheduleNextTimeCheck(now) {
  let intervalMs = TIME_INTERVAL * 1000;
  if (USE_ADAPTIVE_TIME && streamTiming) {
    const state = calculateStreamState(getSyncedTime(), streamTiming);
    intervalMs = getAdaptiveInterval(state);
  }
  if (!isFinite(intervalMs)) {
    nextTimeCheckAt = Infinity;
    return;
  }
  nextTimeCheckAt = now + withJitter(intervalMs);
}

function initViewer(data) {
  viewerSlug = data.slug;
  streamTiming =
    data.scheduledStartMs && data.totalDurationSeconds
      ? {
        scheduledStartMs: data.scheduledStartMs,
        totalDurationSeconds: data.totalDurationSeconds,
      }
      : null;
  viewerMode = Math.random() < WATCH_SHARE ? "watch" : "embed";

  const pagePath = viewerMode === "watch" ? "watch" : "embed";
  const pageRes = http.get(`${BASE_URL}/${pagePath}/${viewerSlug}`);
  const pageOk = recordResult(pageRes, pageOkRate, pageErrors);
  check(pageRes, { "page ok": () => pageOk });

  const timeRes = http.get(`${BASE_URL}/api/time`);
  const timeOk = recordResult(timeRes, timeOkRate, timeErrors);
  check(timeRes, { "time ok": () => timeOk });
  updateServerTimeOffset(timeRes);

  const statusRes = http.get(`${BASE_URL}/api/streams/${viewerSlug}/status`);
  const statusOk = recordResult(statusRes, statusOkRate, statusErrors);
  check(statusRes, { "status ok": () => statusOk });

  const now = Date.now();
  scheduleNextStatusCheck(now);
  scheduleNextTimeCheck(now);
  viewerInitialized = true;
}

export default function (data) {
  if (!data.slug) {
    sleep(LOOP_SLEEP);
    return;
  }

  if (!viewerInitialized) {
    initViewer(data);
    sleep(LOOP_SLEEP);
    return;
  }

  const now = Date.now();
  if (now >= nextStatusCheckAt) {
    const statusRes = http.get(`${BASE_URL}/api/streams/${viewerSlug}/status`);
    const statusOk = recordResult(statusRes, statusOkRate, statusErrors);
    check(statusRes, { "status ok": () => statusOk });
    scheduleNextStatusCheck(now);
  }

  if (now >= nextTimeCheckAt) {
    const timeRes = http.get(`${BASE_URL}/api/time`);
    const timeOk = recordResult(timeRes, timeOkRate, timeErrors);
    check(timeRes, { "time ok": () => timeOk });
    updateServerTimeOffset(timeRes);
    scheduleNextTimeCheck(now);
  }

  sleep(LOOP_SLEEP);
}
