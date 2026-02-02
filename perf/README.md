Performance Tests

These scripts use k6 to generate load against the staging server.

Prerequisites
- Install k6: https://k6.io/docs/get-started/installation/
- Set `BASE_URL` if not using the default staging URL.

API load test
- Hits `/api/health`, `/api/streams`, `/api/time`, and `/api/time?stream=:id`
- Optional admin endpoint `/api/mux/assets` when `ENABLE_ADMIN=1`

Example:
  k6 run -e BASE_URL=https://simulive.cloudysky.xyz -e VUS=20 -e DURATION=2m perf/api-load.js
  k6 run -e BASE_URL=https://simulive.cloudysky.xyz -e ADMIN_PASSWORD=... -e ENABLE_ADMIN=1 perf/api-load.js

Viewer load test
- Hits `/watch/:slug`, `/embed/:slug`, and `/api/time?stream=:slug`

Example:
  k6 run -e BASE_URL=https://simulive.cloudysky.xyz -e STREAM_SLUG=your-stream perf/viewer-load.js

Viewer realistic load test
- Mimics the SimulatedLivePlayer polling behavior with jitter and adaptive `/api/time` cadence
- Hits `/watch/:slug` or `/embed/:slug` and `/api/time?stream=:slug`

Example:
  k6 run -e BASE_URL=https://simulive.cloudysky.xyz -e STREAM_SLUG=your-stream perf/viewer-realistic.js

Environment variables
- `BASE_URL` (default: https://simulive.cloudysky.xyz)
- `VUS` (default: 10)
- `DURATION` (default: 1m)
- `SLEEP` (default: 1 or 2 seconds per script)
- `STREAM_ID` or `STREAM_SLUG` (optional; otherwise first stream is used)
- `ADMIN_PASSWORD` and `ENABLE_ADMIN=1` to hit admin-only endpoints
- `USE_ADAPTIVE_TIME=0` to disable adaptive time polling in `viewer-realistic.js`
- `JITTER_PERCENT` (default: 0.15) to tune polling jitter in `viewer-realistic.js`
- `MIN_JITTER_MS` (default: 5000) minimum jittered interval in `viewer-realistic.js`
