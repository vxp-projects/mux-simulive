# Simulive Platform - Technical Overview

## What It Does

Simulive creates the illusion of a live broadcast by **synchronizing all viewers to the same position** in pre-recorded videos. When someone joins at 2:15pm, they see the same frame as everyone else who joined at 2:00pm - just like live TV.

---

## Core Concept: Time-Based Synchronization

```
Scheduled Start: 2:00:00 PM
Video Duration:  1 hour

Viewer A joins at 2:00:00 PM → sees position 0:00:00
Viewer B joins at 2:15:30 PM → sees position 0:15:30
Viewer C joins at 2:45:00 PM → sees position 0:45:00

All viewers watch the "same moment" in sync.
```

**The magic formula:**
```
currentPosition = (serverTime - scheduledStart) % totalDuration
```

---

## How It Works: Step by Step

### The Viewer Experience

When someone opens a stream, here's what happens behind the scenes:

#### Step 1: "What time is it?"

```
    Viewer's Browser                                     Server
          |                                                |
          |  ---------- "What time do you have?" ------->  |
          |                                                |
          |  <------------- "It's 2:15:30 PM" ------------ |
          |                                                |
```

> **Why?** The viewer's device might have the wrong time (common on phones/laptops),
> so we ask the server for the "official" time that everyone agrees on.

---

#### Step 2: "Where should I be in the video?"

The browser does simple math (no server needed):

```
    Stream started at:    2:00:00 PM
    Server time is now:   2:15:30 PM
                          ──────────
    Video position:       15 min 30 sec
```

> This calculation happens on the configured sync interval (default 5 seconds)
> to keep everyone in sync.

---

#### Step 3: "Am I watching the right spot?"

```
    Expected position:    15:30
    Actual position:      15:28   (2 seconds behind)

    ✓  2 seconds off?  That's OK, within tolerance.
    ✗  5 seconds off?  Jump to the correct spot!
```

> This "drift correction" ensures nobody falls behind or gets ahead.
> Drift tolerance is configured per stream (`driftTolerance`, in seconds).

---

#### Step 4: "Is the stream still active?"

```
    Browser  ------- "Still going?" ------->  Server
    Browser  <-------- "Yep / Nope" --------  Server
             (checks stream status alongside time sync)
```

The `/api/time?stream=...` response includes stream status (`endedAt`, `isActive`)
so the client can pause/stop playback or show "unavailable" without a separate
real-time channel. Redis is used for caching where available.

---

### System Architecture

```
+===========================================================================+
|                           VIEWER'S BROWSER                                |
|                                                                           |
|    +--------------------------- SimulatedLivePlayer -------------------+  |
|    |                                                                   |  |
|    |   +--------------+     +--------------+     +-----------------+   |  |
|    |   |  Time Sync   |     |   Position   |     |  Video Player   |   |  |
|    |   |              |     |  Calculator  |     |                 |   |  |
|    |   |  Learns the  | --> |  Figures out | --> |  Plays video &  |   |  |
|    |   |  clock       |     |  where we    |     |  corrects any   |   |  |
|    |   |  difference  |     |  should be   |     |  drift          |   |  |
|    |   +--------------+     +--------------+     +-----------------+   |  |
|    |                                                                   |  |
|    +-------------------------------------------------------------------+  |
|                                      |                                    |
+======================================|====================================+
                                       |
         +-----------------------------+-----------------------------+
         |                             |
         v                             v
+------------------+      +------------------+
|  Time Service    |      |  Status Service  |
|  /api/time       |      |  /api/~~/status  |
|                  |      |                  |
|  "What time      |      |  "Is stream      |
|   is it?"        |      |   still on?"     |
|                  |      |                  |
|  Called on load  |      |  Optional check  |
|  + adaptive poll |      |  (if needed)     |
+--------+---------+      +--------+---------+
         |                         |
         +-------------------------+
                                   |
                                   v
+===========================================================================+
|                                SERVER                                     |
|                                                                           |
|   +------------------+    +------------------+    +---------------------+  |
|   |    PostgreSQL    |    |      Redis       |    |     Mux Video       |  |
|   |    (Database)    |    |     (Cache)      |    |    (Video Host)     |  |
|   |                  |    |                  |    |                     |  |
|   |  Stores:         |    |  Speeds up:      |    |  Provides:          |  |
|   |  - Stream info   |    |  - Requests      |    |  - Video streaming  |  |
|   |  - Playlists     |    |  - Sessions      |    |  - Adaptive quality |  |
|   |  - Admin logs    |    |  - Rate limits   |    |  - Global CDN       |  |
|   |  - Schedules     |    |  - Caching       |    |  - Secure playback  |  |
|   +------------------+    +------------------+    +---------------------+  |
|                                                                           |
+===========================================================================+   
```

Redis is required for caching (streams/status/tokens), admin sessions, and rate
limiting. If Redis is not configured, those endpoints return 503.

---

### Why This Design?

| Challenge | Solution |
|-----------|----------|
| Viewers have inaccurate device clocks | Server provides the "official" time |
| Need to handle 10,000+ viewers | Time endpoint is cached at CDN edge |
| Admin needs to stop streams | Status updates via time polling |
| Network hiccups cause video drift | Automatic correction on the sync interval (default 5s) |
| Can't trust client-side calculations alone | Server time is the single source of truth |

---

## Database Schema

### Stream
The main entity representing a scheduled broadcast.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (cuid) |
| `slug` | string | URL path (`/watch/{slug}`) |
| `title` | string | Display name |
| `scheduledStart` | DateTime | When broadcast begins |
| `isActive` | boolean | Visible to viewers |
| `endedAt` | DateTime? | Force-stop timestamp (null = running) |
| `loopCount` | int | Playlist repetitions (1-10) |
| `syncInterval` | int | Client sync frequency (ms) |
| `driftTolerance` | int | Max drift before seek (seconds) |
| `items` | PlaylistItem[] | Video playlist |

### PlaylistItem
Individual videos in a stream's playlist.

| Field | Type | Description |
|-------|------|-------------|
| `assetId` | string | Mux asset ID |
| `playbackId` | string | Mux playback ID |
| `playbackPolicy` | string | "public" or "signed" |
| `duration` | float | Length in seconds |
| `order` | int | Position in playlist |

### AuditLog
Security audit trail.

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | LOGIN_SUCCESS, STREAM_CREATED, etc. |
| `severity` | string | INFO, WARN, ERROR |
| `ipAddress` | string | Client IP |
| `userAgent` | string | Browser info |
| `details` | JSON | Additional context |

---

## API Endpoints

### Viewer APIs (No Auth)

Redis is required for `/api/streams`, `/api/streams/[id]/status`,
and `/api/tokens/[playbackId]`.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/time` | Server timestamp (edge-cached 1s) |
| `GET /api/streams` | List all streams (cached 30s) |
| `GET /api/streams/[id]/status` | Lightweight force-stop check (cached 2s) |
| `GET /api/tokens/[playbackId]` | Signed playback tokens (cached 6hr) |

### Admin APIs (Auth Required when ADMIN_PASSWORD is set)

Redis is required for admin authentication and rate limiting. If
`ADMIN_PASSWORD` is not set, admin routes are open but still require Redis.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/streams` | Create stream with playlist |
| `PATCH /api/streams/[id]` | Update stream (including playlist) |
| `DELETE /api/streams/[id]` | Delete stream |
| `GET /api/mux/assets` | List Mux assets for picker |
| `POST /api/admin/login` | Authenticate (rate-limited) |
| `POST /api/admin/logout` | End session |
| `GET /api/admin/audit` | Audit log viewer |

---

## Synchronization Flow

### 1. Initial Calibration
```typescript
// Client fetches server time
const serverTime = await fetch('/api/time').then(r => r.json());

// Calculate offset between client and server clocks
const offset = serverTime.serverTime - Date.now();
// Example: server is 500ms ahead of client → offset = 500
```

### 2. Position Calculation (Sync Interval)
```typescript
function calculatePosition() {
  const syncedTime = Date.now() + offset;  // Adjusted to server time
  const elapsed = syncedTime - scheduledStart;

  if (elapsed < 0) return { state: 'countdown', secondsUntilStart: -elapsed };
  if (elapsed > totalDuration) return { state: 'ended' };

  // Find position in playlist (handles looping)
  const positionInLoop = elapsed % playlistDuration;
  let accumulated = 0;
  for (const item of items) {
    if (positionInLoop < accumulated + item.duration) {
      return {
        state: 'live',
        itemIndex: item.order,
        position: positionInLoop - accumulated
      };
    }
    accumulated += item.duration;
  }
}
```

### 3. Drift Correction
```typescript
const expected = calculatePosition();
const actual = player.currentTime;

if (Math.abs(actual - expected.position) > driftTolerance) {
  player.currentTime = expected.position;  // Seek to correct position
}
```

---

## Adaptive Polling Strategy

The player adjusts server polling frequency based on stream state:

| State | Time Calibration | Status Check |
|-------|------------------|--------------|
| Loading | 30s | - |
| Countdown (>1hr) | 10 min | 10 min |
| Countdown (5-60min) | 3 min | 3 min |
| Countdown (1-5min) | 30s | 30s |
| Countdown (<1min) | 10s | 10s |
| **Live** | 3 min | 3 min |
| Ended | Stopped | Stopped |

**Jitter**: All intervals have ±15% random variation to prevent synchronized traffic spikes.

Status is returned alongside time in `/api/time?stream=...` so the same cadence
drives both time sync and stream state updates.

---

## Force-Stop Detection

When an admin stops or resumes a stream, viewers learn on the next
`/api/time?stream=...` poll. The status fields (`endedAt`, `isActive`) are
returned in the same response as server time, so the player can stop playback
or show "unavailable" without a separate real-time channel.

---

## Security Features

### Authentication
- **Password**: Constant-time comparison (prevents timing attacks)
- **Sessions**: 256-bit random tokens stored in Redis (24hr TTL)
- **Cookies**: HttpOnly, Secure, SameSite=Lax
- **Open access when unset**: If `ADMIN_PASSWORD` is not set, admin routes do
  not require login
- **Redis required**: Admin auth is unavailable without Redis
- **Server gate**: `/admin` routes are server-checked before rendering

### Rate Limiting
- 5 login attempts per IP per 15 minutes
- Tracked in Redis
- Returns retry-after countdown
- Login fails closed if Redis is unavailable

### Audit Logging
All admin actions logged:
- Login attempts (success/failure/rate-limited)
- Stream CRUD operations
- IP address and user agent captured

---

## Player States & UI

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    COUNTDOWN                            │
│                                                         │
│              Stream Title Here                          │
│           Stream starts in                              │
│                                                         │
│         ┌──┐  ┌──┐  ┌──┐  ┌──┐                        │
│         │02│  │14│  │32│  │08│                        │
│         └──┘  └──┘  └──┘  └──┘                        │
│         days  hrs   min   sec                          │
│                                                         │
│           Sat, Jan 1 at 8:00 PM                        │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ● LIVE                                                  │
│                                                         │
│                    ▶ VIDEO                              │
│                   PLAYING                               │
│                                                         │
│   advancement locked to server time                     │
│  seeking disabled (returns to sync position)           │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ✓ ENDED                              │
│                                                         │
│               Stream Ended                              │
│             Stream Title Here                           │
│                                                         │
│        Aired on Saturday, January 1                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Playlist & Looping

### Multi-Video Playlists
```
Stream: "New Year's Concert"
├── Video 1: Opening Act (30 min)
├── Video 2: Main Performance (90 min)
└── Video 3: Encore (15 min)

Total: 135 minutes per loop
```

### Looping (1-10x)
```
loopCount: 3
Total broadcast duration: 135 min × 3 = 405 minutes (6.75 hours)

Timeline:
0:00 ─── Loop 1 ─── 2:15 ─── Loop 2 ─── 4:30 ─── Loop 3 ─── 6:45
         Video 1→2→3        Video 1→2→3        Video 1→2→3
```

### Seamless Transitions
The player uses **dual MuxPlayer instances**:
- Player A plays current video
- Player B preloads next video (with tokens)
- Crossfade transition at video boundaries

---

## Caching Strategy

| Resource | Cache Location | TTL | Purpose |
|----------|----------------|-----|---------|
| Server time | Edge CDN | 1s | Scale to unlimited viewers |
| Stream list | Redis | 30s | Reduce DB queries |
| Stream status | Redis | 2s | Fast force-stop polling |
| Playback tokens | Redis | 6hr | Reduce Mux API calls |
| Pages (ISR) | Next.js | 30-60s | Reduce SSR load |

Redis is required; caching for stream lists, status, and tokens is not optional.

---

## Environment Variables

```bash
# Required
MUX_TOKEN_ID=xxx          # Mux API credentials
MUX_TOKEN_SECRET=xxx
DATABASE_URL=postgres://  # PostgreSQL connection
REDIS_URL=redis://        # Caching, sessions, tokens

# Recommended for Production
ADMIN_PASSWORD=xxx        # Protects /admin (unset = open access)
SECURE_COOKIES=true       # HTTPS only

# Optional (for signed playback)
MUX_SIGNING_KEY=xxx       # Mux signing key ID
MUX_PRIVATE_KEY=xxx       # Base64-encoded private key
```

---

## Project Structure

```
simulive-test/
├── src/
│   ├── app/                          # Next.js 15 App Router
│   │   ├── layout.tsx               # Root layout with metadata
│   │   ├── page.tsx                 # Stream listing page (ISR 30s)
│   │   ├── watch/[slug]/page.tsx    # Stream viewer page (ISR 60s)
│   │   ├── embed/[slug]/            # Embeddable player (no chrome)
│   │   ├── admin/                   # Admin routes
│   │   │   ├── (protected)/         # Server-gated admin pages
│   │   │   │   ├── page.tsx         # Stream management & creation
│   │   │   │   └── audit/page.tsx   # Audit log viewer
│   │   │   └── login/page.tsx       # Admin login form
│   │   └── api/                     # API route handlers
│   │       ├── time/               # Server timestamp
│   │       ├── streams/            # Stream CRUD
│   │       │   └── [id]/
│   │       │       ├── route.ts    # GET, PATCH, DELETE
│   │       │       ├── status/     # Lightweight polling
│   │       ├── tokens/             # Signed playback tokens
│   │       ├── mux/assets/         # Mux asset listing
│   │       ├── health/             # Container health check
│   │       └── admin/              # Auth & audit
│   ├── components/
│   │   ├── SimulatedLivePlayer.tsx # Main player component
│   │   ├── AssetPicker.tsx         # Mux asset selection
│   │   └── DateTimePicker.tsx      # Calendar + time picker
│   ├── lib/
│   │   ├── simulive.ts             # Core sync logic
│   │   ├── mux.ts                  # Mux API client
│   │   ├── auth.ts                 # Admin authentication
│   │   ├── redis.ts                # Caching, sessions, rate limiting
│   │   ├── audit.ts                # Audit logging
│   │   ├── db.ts                   # Prisma singleton
│   │   └── config.ts               # Environment helpers
│   └── middleware.ts               # Route protection
├── prisma/schema.prisma            # Database schema
└── docker-compose.yml              # PostgreSQL + Redis
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/simulive.ts` | Core sync calculations |
| `src/components/SimulatedLivePlayer.tsx` | Main player component |
| `src/app/api/time/route.ts` | Server time endpoint |
| `src/lib/redis.ts` | Caching, sessions, rate limiting |
| `src/lib/auth.ts` | Admin authentication |
| `src/app/admin/(protected)/layout.tsx` | Server-side admin gate |
| `src/middleware.ts` | Route protection |
| `prisma/schema.prisma` | Database models |

---

## Tech Stack

- **Framework**: Next.js 15.1.3 (App Router) - Server components and route
  handlers for pages, ISR, and APIs
- **Language**: TypeScript - Shared types for stream sync logic and safer
  refactors
- **Database**: PostgreSQL + Prisma ORM - Persistent storage for streams,
  playlists, and audit logs
- **Cache**: Redis (ioredis) - Required for caching, admin sessions, rate
  limiting, and token caching
- **Video**: Mux Video + Mux Player - HLS playback, assets, and optional signed
  token support
- **Styling**: Tailwind CSS - Utility-first styling across viewer and admin UI
- **Deployment**: Docker + `cluster.js` - Next.js standalone runtime with 4
  workers; compose runs Postgres and Redis




