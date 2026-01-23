import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://simulive.cloudysky.xyz";
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || "1m";
const SLEEP = Number(__ENV.SLEEP || 2);
const STREAM_SLUG = __ENV.STREAM_SLUG || "";

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

function pickSlug(streams) {
  if (STREAM_SLUG) {
    return STREAM_SLUG;
  }
  return streams[0] && streams[0].slug ? streams[0].slug : "";
}

export function setup() {
  const streamsRes = http.get(`${BASE_URL}/api/streams`);
  const streams = streamsRes.status === 200 ? streamsRes.json() : [];
  const slug = Array.isArray(streams) ? pickSlug(streams) : "";

  return { slug };
}

export default function (data) {
  if (!data.slug) {
    sleep(SLEEP);
    return;
  }

  const watchRes = http.get(`${BASE_URL}/watch/${data.slug}`);
  check(watchRes, { "watch ok": (res) => res.status === 200 });

  const embedRes = http.get(`${BASE_URL}/embed/${data.slug}`);
  check(embedRes, { "embed ok": (res) => res.status === 200 });

  const timeRes = http.get(`${BASE_URL}/api/time?stream=${data.slug}`);
  check(timeRes, { "time ok": (res) => res.status === 200 });

  sleep(SLEEP);
}
