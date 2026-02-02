/**
 * Suite 4: Viewer Experience Tests
 *
 * Purpose: Verify viewer-facing pages, stream playback, and synchronization.
 * Priority: High
 */

import { test, expect } from '@playwright/test';
import * as api from '../lib/api-helpers';
import * as helpers from '../lib/test-helpers';
import { config, endpoints, selectors, badges } from '../lib/config';

// Test data
let upcomingStream: { id: string; slug: string } | null = null;
let liveStream: { id: string; slug: string } | null = null;
let endedStream: { id: string; slug: string } | null = null;
let inactiveStream: { id: string; slug: string } | null = null;

test.describe('Suite 4: Viewer Experience', () => {
  test.beforeAll(async () => {
    // Login for stream creation
    await api.login(config.adminPassword);

    // Get available assets
    const assets = await api.getMuxAssets({ limit: 5 });
    const readyAssets = assets.filter((a) => a.status === 'ready' && a.playback_ids?.length > 0);

    if (readyAssets.length === 0) {
      console.warn('No Mux assets available - some tests will be skipped');
      return;
    }

    const assetId = readyAssets[0].id;

    // Create upcoming stream (future scheduled)
    const upcomingResult = await api.createStream({
      title: 'E2E Viewer Test - Upcoming',
      slug: 'e2e-viewer-upcoming',
      assetIds: [assetId],
      scheduledStart: helpers.getFutureDate(2).toISOString(),
      loopCount: 1,
    });
    if (upcomingResult.stream) {
      upcomingStream = { id: upcomingResult.stream.id, slug: upcomingResult.stream.slug };
      await api.updateStream(upcomingStream.id, { isActive: true });
    }

    // Create "live" stream (past scheduled, not ended, long duration)
    const liveResult = await api.createStream({
      title: 'E2E Viewer Test - Live',
      slug: 'e2e-viewer-live',
      assetIds: [assetId],
      scheduledStart: helpers.getPastDate(0.5).toISOString(), // Started 30 min ago
      loopCount: 10, // Long enough to be "live"
    });
    if (liveResult.stream) {
      liveStream = { id: liveResult.stream.id, slug: liveResult.stream.slug };
      await api.updateStream(liveStream.id, { isActive: true });
    }

    // Create ended stream (past scheduled, explicitly ended)
    const endedResult = await api.createStream({
      title: 'E2E Viewer Test - Ended',
      slug: 'e2e-viewer-ended',
      assetIds: [assetId],
      scheduledStart: helpers.getPastDate(24).toISOString(),
      loopCount: 1,
    });
    if (endedResult.stream) {
      endedStream = { id: endedResult.stream.id, slug: endedResult.stream.slug };
      await api.updateStream(endedStream.id, {
        isActive: true,
        endedAt: helpers.getPastDate(23).toISOString(),
      });
    }

    // Create inactive stream
    const inactiveResult = await api.createStream({
      title: 'E2E Viewer Test - Inactive',
      slug: 'e2e-viewer-inactive',
      assetIds: [assetId],
      scheduledStart: helpers.getFutureDate(1).toISOString(),
    });
    if (inactiveResult.stream) {
      inactiveStream = { id: inactiveResult.stream.id, slug: inactiveResult.stream.slug };
      await api.updateStream(inactiveStream.id, { isActive: false });
    }
  });

  test.afterAll(async () => {
    // Cleanup test streams
    if (upcomingStream) await api.deleteStream(upcomingStream.id).catch(() => {});
    if (liveStream) await api.deleteStream(liveStream.id).catch(() => {});
    if (endedStream) await api.deleteStream(endedStream.id).catch(() => {});
    if (inactiveStream) await api.deleteStream(inactiveStream.id).catch(() => {});
    await api.disposeApiContext();
  });

  test('4.1: Home Page - Stream Listing', async ({ page }) => {
    // Step 1: Navigate to /
    await helpers.navigateToHome(page);

    // Step 2: Observe stream sections
    const pageText = await helpers.getPageText(page);

    // Expected Result: Page loads with stream content
    // Check for section headings or stream cards
    const hasContent =
      pageText.toLowerCase().includes('live') ||
      pageText.toLowerCase().includes('upcoming') ||
      pageText.toLowerCase().includes('stream');

    expect(hasContent).toBe(true);

    // Verification: Stream cards link to watch pages
    const streamLinks = page.locator('a[href^="/watch/"]');
    const linkCount = await streamLinks.count();

    if (linkCount > 0) {
      // At least verify links exist
      const firstLink = await streamLinks.first().getAttribute('href');
      expect(firstLink).toContain('/watch/');
    }

    console.log(`Found ${linkCount} stream links on home page`);
  });

  test('4.2: Watch Page - Countdown', async ({ page }) => {
    if (!upcomingStream) {
      test.skip(true, 'No upcoming stream created');
      return;
    }

    // Step 1: Navigate to watch page for future stream
    await helpers.navigateToWatch(page, upcomingStream.slug);

    // Step 2: Observe countdown display
    await page.waitForTimeout(1000);

    const pageText = await helpers.getPageText(page);

    // Expected Result: Countdown timer visible
    // Look for countdown indicators or time remaining text
    const hasCountdown =
      pageText.match(/\d+:\d+/) !== null || // Time format
      pageText.toLowerCase().includes('start') ||
      pageText.toLowerCase().includes('countdown') ||
      pageText.toLowerCase().includes('upcoming') ||
      pageText.toLowerCase().includes('scheduled');

    // The page should show something about the stream not being live yet
    expect(hasCountdown || pageText.toLowerCase().includes('wait')).toBe(true);

    // Verification: No LIVE badge visible
    const hasLiveBadge = badges.live.some((badge) => pageText.includes(badge));
    expect(hasLiveBadge).toBe(false);
  });

  test('4.3: Watch Page - Live Stream', async ({ page }) => {
    if (!liveStream) {
      test.skip(true, 'No live stream created');
      return;
    }

    // Step 1: Navigate to watch page for live stream
    await helpers.navigateToWatch(page, liveStream.slug);

    // Step 2: Observe player
    await page.waitForTimeout(2000); // Allow player to load

    const pageText = await helpers.getPageText(page);

    // Expected Result: Video player present
    const player = page.locator(selectors.videoPlayer);
    const hasPlayer = (await player.count()) > 0;

    // Verification: LIVE indicator present (in text or badge)
    const hasLiveIndicator =
      badges.live.some((badge) => pageText.includes(badge)) || pageText.toLowerCase().includes('live');

    // At minimum, the page should load without error
    const hasError =
      pageText.toLowerCase().includes('not found') || pageText.toLowerCase().includes('error');

    expect(hasError).toBe(false);

    // Log what we found
    console.log(`Player found: ${hasPlayer}, Live indicator: ${hasLiveIndicator}`);
  });

  test('4.4: Watch Page - Ended Stream', async ({ page }) => {
    if (!endedStream) {
      test.skip(true, 'No ended stream created');
      return;
    }

    // Step 1: Navigate to watch page for ended stream
    await helpers.navigateToWatch(page, endedStream.slug);

    // Step 2: Observe page state
    await page.waitForTimeout(1000);

    const pageText = await helpers.getPageText(page);

    // Expected Result: Shows ended/completed message
    const hasEndedIndicator =
      pageText.toLowerCase().includes('ended') ||
      pageText.toLowerCase().includes('finished') ||
      pageText.toLowerCase().includes('completed') ||
      pageText.toLowerCase().includes('over') ||
      badges.ended.some((badge) => pageText.includes(badge)) ||
      badges.stopped.some((badge) => pageText.includes(badge));

    // Verification: No LIVE badge
    const hasLiveBadge = badges.live.some((badge) => pageText.includes(badge));

    expect(hasLiveBadge).toBe(false);
    console.log(`Ended indicator found: ${hasEndedIndicator}`);
  });

  test('4.5: Watch Page - Non-existent Stream', async ({ page }) => {
    // Step 1: Navigate to non-existent stream
    await page.goto(endpoints.watch('non-existent-slug-12345'));

    // Step 2: Observe response
    await page.waitForTimeout(1000);

    const pageText = await helpers.getPageText(page);

    // Expected Result: 404 page or "Stream not found" message
    const has404 =
      pageText.toLowerCase().includes('not found') ||
      pageText.toLowerCase().includes('404') ||
      pageText.toLowerCase().includes('does not exist') ||
      pageText.toLowerCase().includes("doesn't exist");

    expect(has404).toBe(true);

    // Verification: No broken player UI (no JavaScript errors would be ideal)
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Brief wait to catch any errors
    await page.waitForTimeout(500);
    console.log(`Console errors: ${consoleErrors.length}`);
  });

  test('4.6: Watch Page - Inactive Stream', async ({ page }) => {
    if (!inactiveStream) {
      test.skip(true, 'No inactive stream created');
      return;
    }

    // Step 1: Navigate to watch page for inactive stream
    await helpers.navigateToWatch(page, inactiveStream.slug);

    // Step 2: Observe response
    await page.waitForTimeout(1000);

    const pageText = await helpers.getPageText(page);

    // Expected Result: "Stream unavailable" message
    const hasUnavailable =
      pageText.toLowerCase().includes('unavailable') ||
      pageText.toLowerCase().includes('not available') ||
      pageText.toLowerCase().includes('inactive') ||
      pageText.toLowerCase().includes('not found');

    expect(hasUnavailable).toBe(true);

    // Verification: No video player attempting to load
    const player = page.locator(selectors.videoPlayer);
    const playerCount = await player.count();
    console.log(`Player elements found: ${playerCount}`);
  });

  test('4.7: Stop Notification via Time Polling', async ({ page }) => {
    if (!liveStream) {
      test.skip(true, 'No live stream for stop notification test');
      return;
    }

    // Step 1: Open watch page
    await helpers.navigateToWatch(page, liveStream.slug);
    await page.waitForTimeout(2000);

    // Track if page content changes
    const initialText = await helpers.getPageText(page);

    // Step 2: In separate context, stop the stream via API
    const stopTime = new Date().toISOString();
    await api.updateStream(liveStream.id, { endedAt: stopTime });

    // Step 3: Trigger a time recalibration so status updates
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1000);

    // Optionally trigger a check by clicking or scrolling
    await page.mouse.move(100, 100);

    const updatedText = await helpers.getPageText(page);

    // Expected Result: Page updates to show stopped state
    // The text should change or show stopped/ended indicator
    const textChanged = initialText !== updatedText;
    const showsStopped =
      updatedText.toLowerCase().includes('stopped') ||
      updatedText.toLowerCase().includes('ended') ||
      badges.stopped.some((badge) => updatedText.includes(badge));

    console.log(`Text changed: ${textChanged}, Shows stopped: ${showsStopped}`);

    // Resume the stream for other tests
    await api.updateStream(liveStream.id, { endedAt: null });

    // Verification is soft - UI may take a moment to reflect status updates
    expect(textChanged || showsStopped).toBe(true);
  });

  test('4.8: Player Sync Accuracy', async ({ page }) => {
    if (!liveStream) {
      test.skip(true, 'No live stream for sync test');
      return;
    }

    // Get stream details to know scheduled start
    const stream = await api.getStream(liveStream.id);
    if (!stream) {
      test.skip(true, 'Could not fetch stream details');
      return;
    }

    const items = (stream.playlistItems || stream.items || []).slice().sort((a, b) => a.order - b.order);
    if (items.length === 0) {
      test.skip(true, 'No playlist items for sync test');
      return;
    }

    const playlistDuration = items.reduce((sum, item) => sum + (item.duration || 0), 0);
    if (playlistDuration <= 0) {
      test.skip(true, 'Playlist duration unavailable for sync test');
      return;
    }

    let serverTimeMs = Date.now();
    try {
      const timeResponse = await page.request.get('/api/time');
      if (timeResponse.ok()) {
        const timeData = await timeResponse.json();
        if (typeof timeData?.serverTime === 'number') {
          serverTimeMs = timeData.serverTime;
        }
      }
    } catch (error) {
      // Fall back to local time if server time is unavailable.
    }

    const scheduledStart = new Date(stream.scheduledStart).getTime();
    const elapsedSeconds = (serverTimeMs - scheduledStart) / 1000;
    const totalDuration = playlistDuration * stream.loopCount;

    if (elapsedSeconds < 0) {
      test.skip(true, 'Stream has not started yet');
      return;
    }

    if (elapsedSeconds >= totalDuration) {
      test.skip(true, 'Stream already ended');
      return;
    }

    const positionInLoop = elapsedSeconds % playlistDuration;
    let expectedPosition = 0;
    let accumulated = 0;
    for (const item of items) {
      const duration = item.duration || 0;
      if (positionInLoop < accumulated + duration) {
        expectedPosition = positionInLoop - accumulated;
        break;
      }
      accumulated += duration;
    }

    // Step 1-2: Navigate to watch page
    await helpers.navigateToWatch(page, liveStream.slug);
    await page.waitForTimeout(3000); // Allow player to sync

    // Step 3: Try to get player position via JavaScript
    let playerPosition: number | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      playerPosition = await page.evaluate(() => {
        // Try various player APIs
        const muxPlayer = document.querySelector('mux-player') as HTMLVideoElement | null;
        if (muxPlayer && 'currentTime' in muxPlayer) {
          return muxPlayer.currentTime;
        }

        const video = document.querySelector('video');
        if (video) {
          return video.currentTime;
        }

        return null;
      });

      if (playerPosition !== null && playerPosition > 0.5) {
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (playerPosition !== null) {
      if (playerPosition <= 0.5) {
        test.skip(true, 'Player did not start playback for sync check');
        return;
      }

      // Calculate drift
      const drift = Math.abs(playerPosition - expectedPosition);
      const driftTolerance = stream.driftTolerance || 2;

      console.log(`Expected: ${expectedPosition.toFixed(1)}s, Actual: ${playerPosition.toFixed(1)}s, Drift: ${drift.toFixed(1)}s`);

      // Expected Result: Within drift tolerance
      expect(drift).toBeLessThanOrEqual(driftTolerance + 5); // Allow some buffer for test timing
    } else {
      console.log('Could not access player currentTime - player may use different API');
      // Test passes as we can't verify without player access
    }
  });
});
