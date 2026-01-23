import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://simulive.cloudysky.xyz";
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || "1m";
const SLEEP = Number(__ENV.SLEEP || 1);
const STREAM_ID = __ENV.STREAM_ID || "";
const STREAM_SLUG = __ENV.STREAM_SLUG || "";
const ENABLE_ADMIN = __ENV.ENABLE_ADMIN === "1";
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || "";

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

function pickStream(streams) {
  if (STREAM_ID) {
    return streams.find((stream) => stream.id === STREAM_ID) || null;
  }
  if (STREAM_SLUG) {
    return streams.find((stream) => stream.slug === STREAM_SLUG) || null;
  }
  return streams[0] || null;
}

export function setup() {
  const streamsRes = http.get(`${BASE_URL}/api/streams`);
  const streams = streamsRes.status === 200 ? streamsRes.json() : [];
  const stream = Array.isArray(streams) ? pickStream(streams) : null;

  let authCookie = "";
  if (ENABLE_ADMIN && ADMIN_PASSWORD) {
    const loginRes = http.post(
      `${BASE_URL}/api/admin/login`,
      JSON.stringify({ password: ADMIN_PASSWORD }),
      { headers: { "Content-Type": "application/json" } }
    );
    const setCookie = loginRes.headers["set-cookie"] || "";
    authCookie = setCookie ? setCookie.split(";")[0] : "";
  }

  const streamId = stream && stream.id ? stream.id : "";
  const streamSlug = stream && stream.slug ? stream.slug : "";

  return { streamId, streamSlug, authCookie };
}

export default function (data) {
  const statusId = data.streamId || data.streamSlug;
  const authHeaders = data.authCookie ? { Cookie: data.authCookie } : {};

  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, { "health ok": (res) => res.status === 200 });

  const streamsRes = http.get(`${BASE_URL}/api/streams`);
  check(streamsRes, { "streams ok": (res) => res.status === 200 });

  const timeRes = http.get(`${BASE_URL}/api/time`);
  check(timeRes, { "time ok": (res) => res.status === 200 });

  if (statusId) {
    const timeResWithStream = http.get(`${BASE_URL}/api/time?stream=${statusId}`);
    check(timeResWithStream, { "time with stream ok": (res) => res.status === 200 });
  }

  if (ENABLE_ADMIN && data.authCookie) {
    const muxRes = http.get(`${BASE_URL}/api/mux/assets?limit=1`, {
      headers: authHeaders,
    });
    check(muxRes, { "mux assets ok": (res) => res.status === 200 });
  }

  sleep(SLEEP);
}
