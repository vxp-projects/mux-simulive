# E2E Test Suite for AI Agent Execution

This document outlines an end-to-end test suite designed to be executed by an AI agent using browser automation (Playwright) and API calls. Each test includes step-by-step instructions, expected outcomes, and verification criteria.

## Prerequisites

### Environment Setup
```bash
# Start the application
npm run dev

# Ensure services are running
# - PostgreSQL on configured DATABASE_URL
# - Redis on configured REDIS_URL
# - Mux credentials configured
```

### Test Configuration
- **Base URL:** `http://localhost:3000`
- **Admin Password:** Value of `ADMIN_PASSWORD` env var (if set)
- **Test Timeout:** 30 seconds per test unless specified

---

## Test Suite Overview

| Suite | Tests | Priority |
|-------|-------|----------|
| Health Check | 1 | Critical |
| Authentication | 6 | Critical |
| Stream Management | 12 | High |
| Viewer Experience | 8 | High |
| Embed Functionality | 4 | Medium |
| Audit Logs | 5 | Medium |
| API Validation | 9 | High |
| Cache Behavior | 4 | Low |

---

## Suite 1: Health Check

### Test 1.1: System Health Verification
**Purpose:** Verify all backend services are operational before running other tests.

**Steps:**
1. Navigate to `/api/health`
2. Parse JSON response

**Expected Result:**
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "redis": true,
    "mux_credentials": true
  }
}
```

**Verification:**
- HTTP status is 200
- All checks return `true`
- If any check fails, report which service is down

**Failure Action:** Stop test suite if health check fails.

---

## Suite 2: Authentication

### Test 2.1: Admin Login - Valid Password
**Purpose:** Verify successful admin authentication.

**Precondition:** `ADMIN_PASSWORD` environment variable is set.

**Steps:**
1. Navigate to `/admin`
2. Verify redirect to `/admin/login`
3. Enter password in password field
4. Click "Login" button
5. Wait for navigation

**Expected Result:**
- Redirects to `/admin` dashboard
- Dashboard displays stream management UI
- Session cookie `simulive_admin` is set

**Verification:**
- URL is `/admin` (not `/admin/login`)
- Page contains "Create Stream" or "New Stream" button
- No error messages displayed

---

### Test 2.2: Admin Login - Invalid Password
**Purpose:** Verify invalid password rejection.

**Steps:**
1. Navigate to `/admin/login`
2. Enter incorrect password: `wrong-password-123`
3. Click "Login" button
4. Wait for response

**Expected Result:**
- Remains on `/admin/login`
- Error message displayed (e.g., "Invalid password")
- No session cookie created

**Verification:**
- URL still contains `/admin/login`
- Error message visible on page
- Cannot access `/admin` dashboard

---

### Test 2.3: Admin Login - Rate Limiting
**Purpose:** Verify rate limiting after multiple failed attempts.

**Steps:**
1. Navigate to `/admin/login`
2. Submit incorrect password 5 times rapidly
3. Submit 6th attempt

**Expected Result:**
- 6th attempt shows rate limit error
- Message indicates retry time (e.g., "Too many attempts. Try again in X minutes")

**Verification:**
- Error message mentions rate limiting or "too many attempts"
- Cannot login even with correct password until cooldown

**Cleanup:** Wait 15 minutes or clear Redis rate limit keys.

---

### Test 2.4: Admin Logout
**Purpose:** Verify logout clears session.

**Precondition:** Successfully logged in as admin.

**Steps:**
1. From admin dashboard, find and click "Logout" button
2. Wait for navigation

**Expected Result:**
- Redirects to `/admin/login`
- Session cookie cleared

**Verification:**
- URL is `/admin/login`
- Attempting to access `/admin` redirects back to login

---

### Test 2.5: Session Persistence
**Purpose:** Verify session survives page reload.

**Precondition:** Successfully logged in as admin.

**Steps:**
1. From admin dashboard, refresh the page (F5)
2. Wait for page load

**Expected Result:**
- Remains on admin dashboard
- No login required

**Verification:**
- URL is `/admin` (not redirected to login)
- Dashboard content fully loaded

---

### Test 2.6: Unauthenticated Access Prevention
**Purpose:** Verify protected routes require authentication.

**Precondition:** Not logged in (clear cookies first).

**Steps:**
1. Clear all cookies
2. Navigate directly to `/admin`
3. Wait for navigation

**Expected Result:**
- Redirects to `/admin/login`

**Verification:**
- URL contains `/admin/login`
- Login form displayed

---

## Suite 3: Stream Management

### Test 3.1: Create Stream - Basic
**Purpose:** Verify stream creation with required fields.

**Precondition:** Logged in as admin, at least one Mux asset available.

**Steps:**
1. Navigate to `/admin`
2. Click "New Stream" or "+ Create Stream" button
3. Fill form:
   - Title: `E2E Test Stream`
   - Scheduled Start: Tomorrow at 12:00 PM
   - Select at least one video asset
   - Loop Count: 1
4. Click "Create" button
5. Wait for success

**Expected Result:**
- Stream appears in stream list
- Status badge shows "SCHEDULED" or "UPCOMING"
- Slug auto-generated from title

**Verification:**
- Stream list contains "E2E Test Stream"
- Can click to view stream details
- Stream has generated slug (e.g., `e2e-test-stream`)

---

### Test 3.2: Create Stream - Slug Validation
**Purpose:** Verify slug format validation.

**Steps:**
1. Open create stream form
2. Enter slug with invalid characters: `Invalid Slug!@#`
3. Attempt to create

**Expected Result:**
- Form shows validation error
- Stream not created

**Verification:**
- Error message about slug format
- Form remains open

---

### Test 3.3: Create Stream - Duplicate Slug Prevention
**Purpose:** Verify duplicate slugs are rejected.

**Precondition:** Stream with slug `e2e-test-stream` exists.

**Steps:**
1. Open create stream form
2. Set slug to existing value: `e2e-test-stream`
3. Fill other required fields
4. Attempt to create

**Expected Result:**
- Form shows error about duplicate slug
- Stream not created

**Verification:**
- Error message mentions "already exists" or "duplicate"
- Original stream unchanged

---

### Test 3.4: Edit Stream
**Purpose:** Verify stream editing functionality.

**Precondition:** Test stream exists.

**Steps:**
1. Find test stream in list
2. Click "Edit" button
3. Modify title to `E2E Test Stream - Modified`
4. Change scheduled start time
5. Click "Save" or "Update"

**Expected Result:**
- Changes saved successfully
- Updated title appears in list
- New scheduled time reflected

**Verification:**
- Stream list shows "E2E Test Stream - Modified"
- Stream details show updated values

---

### Test 3.5: Activate/Deactivate Stream
**Purpose:** Verify stream activation toggle.

**Precondition:** Test stream exists in inactive state.

**Steps:**
1. Find test stream in list
2. Click "Activate" button/toggle
3. Verify status changes
4. Click "Deactivate"
5. Verify status reverts

**Expected Result:**
- Stream toggles between active/inactive
- Status badge updates accordingly

**Verification:**
- Active stream appears on home page
- Inactive stream hidden from home page

---

### Test 3.6: Delete Stream
**Purpose:** Verify stream deletion with confirmation.

**Precondition:** Test stream exists.

**Steps:**
1. Find test stream in list
2. Click "Delete" button
3. Confirm deletion in dialog
4. Wait for completion

**Expected Result:**
- Stream removed from list
- Confirmation dialog appeared before deletion

**Verification:**
- Stream no longer in list
- Navigating to `/watch/[slug]` shows 404 or unavailable

---

### Test 3.7: Force-Stop Live Stream
**Purpose:** Verify ability to stop a live stream.

**Precondition:** Stream is currently in "LIVE" state (scheduled start in past, not ended).

**Steps:**
1. Find live stream in admin dashboard
2. Click "Stop" button
3. Confirm in dialog
4. Observe status change

**Expected Result:**
- Stream status changes to "STOPPED"
- Viewers receive real-time notification

**Verification:**
- Status badge shows "STOPPED"
- `/api/streams/[id]/status` returns `endedAt` timestamp

---

### Test 3.8: Resume Stopped Stream
**Purpose:** Verify resuming a force-stopped stream.

**Precondition:** Stream is in "STOPPED" state.

**Steps:**
1. Find stopped stream in admin dashboard
2. Click "Resume" button
3. Wait for status update

**Expected Result:**
- Stream status returns to "LIVE"
- `endedAt` cleared

**Verification:**
- Status badge shows "LIVE NOW"
- `/api/streams/[id]/status` returns `endedAt: null`

---

### Test 3.9: Multi-Asset Playlist
**Purpose:** Verify playlist with multiple videos.

**Precondition:** At least 2 Mux assets available.

**Steps:**
1. Create new stream
2. Select 2 or more video assets
3. Reorder assets (if UI supports drag-drop)
4. Save stream
5. Verify playlist order

**Expected Result:**
- Stream created with multiple playlist items
- Order matches selection

**Verification:**
- API returns playlist items in correct order
- Watch page cycles through videos

---

### Test 3.10: Loop Count Configuration
**Purpose:** Verify loop count setting.

**Steps:**
1. Create stream with loop count of 3
2. Verify setting saved
3. Calculate expected total duration

**Expected Result:**
- Stream has loopCount = 3
- Total duration = playlist duration × 3

**Verification:**
- Admin shows correct total duration
- Stream ends after 3 complete playlist cycles

---

### Test 3.11: Get Embed Code
**Purpose:** Verify embed code generation.

**Steps:**
1. Find stream in admin dashboard
2. Click "Embed" button
3. Copy responsive embed code
4. Switch to fixed size mode
5. Copy fixed size embed code

**Expected Result:**
- Modal displays embed code
- Responsive code uses 100% width with aspect ratio
- Fixed size code has explicit dimensions

**Verification:**
- Code contains correct stream slug
- Responsive: `width: 100%` and padding-top for aspect ratio
- Fixed: explicit width/height values

---

### Test 3.12: Preview Stream Link
**Purpose:** Verify preview opens watch page.

**Steps:**
1. Find stream in admin dashboard
2. Click "Preview" or view link
3. Verify new tab/navigation

**Expected Result:**
- Watch page opens for the stream
- URL is `/watch/[slug]`

**Verification:**
- Correct stream loads in player
- Title matches admin entry

---

## Suite 4: Viewer Experience

### Test 4.1: Home Page - Stream Listing
**Purpose:** Verify streams display correctly on home page.

**Precondition:** At least one active stream exists.

**Steps:**
1. Navigate to `/`
2. Observe stream sections

**Expected Result:**
- Active live streams show in "Live Now" section with LIVE badge
- Upcoming streams show with scheduled time
- Each stream links to watch page

**Verification:**
- Stream titles visible
- Correct status badges displayed
- Links navigate to `/watch/[slug]`

---

### Test 4.2: Watch Page - Countdown
**Purpose:** Verify countdown before stream starts.

**Precondition:** Stream scheduled to start in future.

**Steps:**
1. Navigate to `/watch/[future-stream-slug]`
2. Observe countdown display

**Expected Result:**
- Countdown timer visible
- Shows hours:minutes:seconds until start
- Countdown decrements in real-time

**Verification:**
- Timer updates every second
- No video playing
- Clear indication stream hasn't started

---

### Test 4.3: Watch Page - Live Stream
**Purpose:** Verify live stream playback.

**Precondition:** Stream is currently live (started, not ended).

**Steps:**
1. Navigate to `/watch/[live-stream-slug]`
2. Observe player

**Expected Result:**
- Video plays automatically
- LIVE badge visible
- Player synced to current position

**Verification:**
- Video is playing (not paused)
- Progress matches expected position based on scheduled start
- LIVE indicator present

---

### Test 4.4: Watch Page - Ended Stream
**Purpose:** Verify ended stream display.

**Precondition:** Stream has naturally ended or was stopped.

**Steps:**
1. Navigate to `/watch/[ended-stream-slug]`
2. Observe page state

**Expected Result:**
- Shows ended/completed message
- No active playback
- May show replay option or stream info

**Verification:**
- Clear indication stream has ended
- No LIVE badge

---

### Test 4.5: Watch Page - Non-existent Stream
**Purpose:** Verify 404 handling.

**Steps:**
1. Navigate to `/watch/non-existent-slug-12345`
2. Observe response

**Expected Result:**
- 404 page or "Stream not found" message

**Verification:**
- Error message displayed
- No broken player UI

---

### Test 4.6: Watch Page - Inactive Stream
**Purpose:** Verify inactive stream handling.

**Precondition:** Stream exists but `isActive = false`.

**Steps:**
1. Navigate to `/watch/[inactive-stream-slug]`
2. Observe response

**Expected Result:**
- "Stream unavailable" message
- No video player

**Verification:**
- Clear unavailable message
- No attempt to load video

---

### Test 4.7: Stop Notification via Polling
**Purpose:** Verify viewer receives stop notification via time polling.

**Precondition:** Stream is live, viewer has page open.

**Steps:**
1. Open `/watch/[live-stream-slug]` in browser
2. In separate session, admin stops the stream
3. Observe viewer page

**Expected Result:**
- Viewer page updates on the next `/api/time?stream=...` poll
- Shows "Stream stopped" or ended state
- No manual refresh needed

**Verification:**
- Page state changes automatically
- Time polling continues and status reflects `endedAt`

---

### Test 4.8: Player Sync Accuracy
**Purpose:** Verify viewers sync to correct position.

**Precondition:** Stream is live with known start time.

**Steps:**
1. Calculate expected position: `now - scheduledStart`
2. Navigate to watch page
3. Compare player position to expected

**Expected Result:**
- Player position within drift tolerance (default 2 seconds)

**Verification:**
- `Math.abs(playerPosition - expectedPosition) <= 2`
- No major sync drift

---

## Suite 5: Embed Functionality

### Test 5.1: Embed Page Loads
**Purpose:** Verify embed page renders correctly.

**Steps:**
1. Navigate to `/embed/[stream-slug]`
2. Observe page layout

**Expected Result:**
- Full-screen player (no chrome/navigation)
- Black background
- Player fills viewport

**Verification:**
- No header/footer
- Player is full width/height
- Same stream plays as watch page

---

### Test 5.2: Responsive Embed
**Purpose:** Verify responsive embed maintains aspect ratio.

**Steps:**
1. Create iframe with responsive embed code
2. Resize container to various widths
3. Observe aspect ratio

**Expected Result:**
- Player maintains 16:9 aspect ratio
- No horizontal scrollbars
- Video not distorted

**Verification:**
- Height adjusts proportionally to width
- Aspect ratio preserved at all sizes

---

### Test 5.3: Fixed Size Embed
**Purpose:** Verify fixed size embed respects dimensions.

**Steps:**
1. Create iframe with fixed size embed (640x360)
2. Place in container larger than 640x360
3. Observe dimensions

**Expected Result:**
- Iframe is exactly 640x360 pixels
- Does not expand to fill container

**Verification:**
- Measured dimensions match specified values
- Content scales within fixed frame

---

### Test 5.4: Embed Sync Matches Watch Page
**Purpose:** Verify embed syncs same as main watch page.

**Steps:**
1. Open `/watch/[slug]` in one tab
2. Open `/embed/[slug]` in another tab
3. Compare playback positions

**Expected Result:**
- Both show same video position (within tolerance)
- Same stream state (countdown/live/ended)

**Verification:**
- Position difference <= drift tolerance
- Both transition states together

---

## Suite 6: Audit Logs

### Test 6.1: Login Events Logged
**Purpose:** Verify authentication attempts are logged.

**Steps:**
1. Attempt login (success or failure)
2. Navigate to `/admin/audit`
3. Find login event

**Expected Result:**
- Audit log contains login event
- Shows correct event type (LOGIN_SUCCESS or LOGIN_FAILED)
- Includes IP address and timestamp

**Verification:**
- Event appears in recent logs
- Event type matches outcome
- IP address recorded

---

### Test 6.2: Stream Operations Logged
**Purpose:** Verify stream CRUD operations are logged.

**Steps:**
1. Create a new stream
2. Edit the stream
3. Delete the stream
4. Check audit logs

**Expected Result:**
- Three events logged:
  - STREAM_CREATED
  - STREAM_UPDATED
  - STREAM_DELETED
- Each includes stream title/details

**Verification:**
- All three event types present
- Details show what was changed

---

### Test 6.3: Filter by Event Type
**Purpose:** Verify event type filtering.

**Steps:**
1. Navigate to `/admin/audit`
2. Select filter: "LOGIN_FAILED"
3. Apply filter

**Expected Result:**
- Only LOGIN_FAILED events displayed
- Other event types hidden

**Verification:**
- All visible rows are LOGIN_FAILED
- Count matches filtered total

---

### Test 6.4: Filter by IP Address
**Purpose:** Verify IP address filtering.

**Steps:**
1. Navigate to `/admin/audit`
2. Enter known IP in filter field
3. Apply filter

**Expected Result:**
- Only events from that IP displayed

**Verification:**
- All visible rows match IP filter
- Different IPs hidden

---

### Test 6.5: Pagination
**Purpose:** Verify audit log pagination.

**Precondition:** More than 20 audit events exist.

**Steps:**
1. Navigate to `/admin/audit`
2. Observe first page (20 items)
3. Click "Next" or page 2
4. Verify different logs shown

**Expected Result:**
- First page shows 20 most recent
- Second page shows next 20
- Navigation works both directions

**Verification:**
- Different events on each page
- Total count accurate
- Can navigate back to page 1

---

## Suite 7: API Validation

### Test 7.1: GET /api/streams
**Purpose:** Verify stream listing API.

**Steps:**
1. Make GET request to `/api/streams`
2. Parse response

**Expected Result:**
- HTTP 200
- JSON array of streams
- Each stream includes playlist items

**Verification:**
- Response is valid JSON array
- Streams have required fields (id, slug, title, scheduledStart)
- Playlist items ordered correctly

---

### Test 7.2: POST /api/streams - Unauthorized
**Purpose:** Verify API requires authentication.

**Steps:**
1. Clear session cookies
2. Make POST request to `/api/streams` with valid body
3. Observe response

**Expected Result:**
- HTTP 401 Unauthorized

**Verification:**
- Status code is 401
- No stream created

---

### Test 7.3: POST /api/streams - Invalid Body
**Purpose:** Verify API validates request body.

**Steps:**
1. Authenticate as admin
2. POST to `/api/streams` with missing required fields
3. Observe response

**Expected Result:**
- HTTP 400 Bad Request
- Error message indicates missing fields

**Verification:**
- Status code is 400
- Error body explains validation failure

---

### Test 7.4: PATCH /api/streams/[id]
**Purpose:** Verify stream update API.

**Precondition:** Test stream exists, authenticated.

**Steps:**
1. PATCH to `/api/streams/[id]` with `{ "title": "Updated Title" }`
2. Observe response
3. GET stream to verify

**Expected Result:**
- HTTP 200
- Stream title updated

**Verification:**
- Response shows updated stream
- GET confirms change persisted

---

### Test 7.5: DELETE /api/streams/[id]
**Purpose:** Verify stream deletion API.

**Steps:**
1. DELETE to `/api/streams/[id]`
2. Observe response
3. GET same stream

**Expected Result:**
- DELETE returns 200 or 204
- GET returns 404

**Verification:**
- Stream no longer exists
- Playlist items also deleted

---

### Test 7.6: GET /api/streams/[id]/status
**Purpose:** Verify status endpoint.

**Steps:**
1. GET `/api/streams/[id]/status`
2. Parse response

**Expected Result:**
- HTTP 200
- JSON with `endedAt` and `isActive` fields

**Verification:**
- Response is fast (< 100ms ideally)
- Fields match stream state

---

### Test 7.7: POST /api/admin/login - Rate Limit
**Purpose:** Verify rate limiting at API level.

**Steps:**
1. POST to `/api/admin/login` with wrong password 6 times
2. Observe 6th response

**Expected Result:**
- HTTP 429 Too Many Requests
- `Retry-After` header present

**Verification:**
- Status code is 429
- Header indicates wait time

---

### Test 7.8: GET /api/admin/audit - Filtering
**Purpose:** Verify audit API query parameters.

**Steps:**
1. GET `/api/admin/audit?event=LOGIN_FAILED&limit=10`
2. Parse response

**Expected Result:**
- Only LOGIN_FAILED events returned
- Maximum 10 results
- Includes total count for pagination

**Verification:**
- All items match filter
- Response has `total`, `limit`, `offset` fields

---

### Test 7.9: GET /api/mux/assets
**Purpose:** Verify Mux asset listing.

**Steps:**
1. GET `/api/mux/assets`
2. Parse response

**Expected Result:**
- HTTP 200
- Array of Mux assets with playback IDs

**Verification:**
- Assets have id, playback_ids, status fields
- Ready assets have public playback IDs

---

## Suite 8: Cache Behavior

### Test 8.1: Cache Headers Present
**Purpose:** Verify cache control headers.

**Steps:**
1. GET `/api/streams`
2. Check response headers

**Expected Result:**
- `X-Cache: HIT` or `X-Cache: MISS` header
- Cache-Control headers appropriate

**Verification:**
- Header indicates cache status
- Second request shows HIT

---

### Test 8.2: Cache Invalidation on Create
**Purpose:** Verify cache clears when stream created.

**Steps:**
1. GET `/api/streams` (prime cache)
2. Create new stream
3. GET `/api/streams` again

**Expected Result:**
- New stream appears in second request
- Cache was invalidated

**Verification:**
- Stream count increased
- New stream in list

---

### Test 8.3: Cache Invalidation on Update
**Purpose:** Verify cache clears when stream updated.

**Steps:**
1. GET `/api/streams` (note titles)
2. Update stream title
3. GET `/api/streams` again

**Expected Result:**
- Updated title in response
- Not serving stale data

**Verification:**
- Title change visible
- No need to wait for TTL

---

### Test 8.4: Status Cache (Short TTL)
**Purpose:** Verify status endpoint has short cache.

**Steps:**
1. GET `/api/streams/[id]/status`
2. Stop stream
3. GET status again within 2 seconds

**Expected Result:**
- Second request shows stopped state
- Cache TTL is very short

**Verification:**
- `endedAt` updates quickly
- No prolonged stale state

---

## Test Data Cleanup

### After Each Suite
```
- Delete test streams created during tests
- Clear rate limit keys if testing rate limiting
- Reset any modified streams to original state
```

### After Full Run
```
- Remove all streams with "E2E Test" in title
- Clear audit logs older than test run (optional)
- Verify database state matches pre-test baseline
```

---

## AI Agent Execution Notes

### Browser Automation Tools
The AI agent should use Playwright MCP tools:
- `browser_navigate` - Navigate to URLs
- `browser_snapshot` - Get page state for verification
- `browser_click` - Interact with buttons/links
- `browser_type` - Enter text in forms
- `browser_fill_form` - Fill multiple form fields
- `browser_wait_for` - Wait for elements/text
- `browser_evaluate` - Run JavaScript for complex checks

### API Testing
For API tests, use the `Bash` tool with `curl`:
```bash
curl -X GET http://localhost:3000/api/streams
curl -X POST http://localhost:3000/api/admin/login -d '{"password":"..."}' -H "Content-Type: application/json"
```

### Verification Strategy
1. **Visual Verification:** Use `browser_snapshot` to capture page state
2. **API Verification:** Make follow-up API calls to confirm changes
3. **Database Verification:** Query Prisma/database if needed
4. **Network Verification:** Check console/network logs for errors

### Error Handling
- If a test fails, capture screenshot and console logs
- Note the exact step that failed
- Continue with remaining tests if failure is isolated
- Abort suite if critical dependency fails (e.g., health check)

### Reporting
After each test, report:
- Test name and ID
- PASS/FAIL status
- Execution time
- Screenshots/evidence for failures
- Any warnings or unexpected behavior
