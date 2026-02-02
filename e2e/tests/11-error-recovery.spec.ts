/**
 * Suite 11: Error Recovery Tests
 *
 * Purpose: Verify system resilience under failure conditions.
 * Priority: High - Critical for production reliability
 */

import { test, expect } from '@playwright/test';
import * as api from '../lib/api-helpers';
import * as helpers from '../lib/test-helpers';
import { config } from '../lib/config';

let recoveryStream: { id: string; slug: string } | null = null;

test.describe('Suite 11: Error Recovery', () => {
  test.beforeAll(async () => {
    await api.login(config.adminPassword);

    const assets = await api.getMuxAssets({ limit: 1 });
    const readyAssets = assets.filter((a) => a.status === 'ready' && a.playback_ids?.length > 0);

    if (readyAssets.length === 0) {
      console.warn('No Mux assets available - error recovery tests will be skipped');
      return;
    }

    const result = await api.createStream({
      title: 'E2E Error Recovery Stream',
      slug: `e2e-error-recovery-${Date.now()}`,
      assetIds: [readyAssets[0].id],
      scheduledStart: helpers.getPastDate(0.5).toISOString(),
      loopCount: 10,
    });

    if (result.stream) {
      recoveryStream = { id: result.stream.id, slug: result.stream.slug };
      await api.updateStream(recoveryStream.id, { isActive: true });
    }
  });

  test.afterAll(async () => {
    if (recoveryStream) {
      await api.deleteStream(recoveryStream.id).catch(() => {});
    }
    await api.disposeApiContext();
  });

  test('11.1: Player recovers from temporary network failure', async ({ page, context }) => {
    if (!recoveryStream) {
      test.skip(true, 'No active recovery stream available');
      return;
    }

    // Step 2: Navigate to watch page
    await page.goto(`${config.baseUrl}/watch/${recoveryStream.slug}`);
    await page.waitForSelector('mux-player', { timeout: 15000 });

    // Step 3: Wait for player to start
    await page.waitForTimeout(3000);

    // Step 4: Go offline
    await context.setOffline(true);
    console.log('Network offline');
    await page.waitForTimeout(3000);

    // Step 5: Come back online
    await context.setOffline(false);
    console.log('Network restored');
    await page.waitForTimeout(5000);

    // Step 6: Verify player recovered
    const playerState = await page.evaluate(() => {
      const player = document.querySelector('mux-player') as HTMLElement & {
        currentTime?: number;
        paused?: boolean;
      };
      return {
        exists: !!player,
        currentTime: player?.currentTime || 0,
        paused: player?.paused ?? true,
      };
    });

    // Expected Result: Player exists and has progressed
    expect(playerState.exists).toBe(true);
    expect(playerState.currentTime).toBeGreaterThan(0);

    console.log(
      `Player recovered: time=${playerState.currentTime.toFixed(1)}s, paused=${playerState.paused}`
    );
  });

  test('11.2: API handles concurrent requests under load', async () => {
    // Step 1: Make 20 parallel requests to streams endpoint
    const requests = Array(20)
      .fill(null)
      .map(() => api.getStreams());

    const results = await Promise.allSettled(requests);

    // Step 2: Count successes and failures
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    console.log(`Concurrent requests: ${succeeded} succeeded, ${failed} failed`);

    // Expected Result: At least 90% should succeed
    expect(succeeded).toBeGreaterThanOrEqual(18);

    // Step 3: Verify server is still healthy
    const health = await api.checkHealth();
    expect(health.status).toBe('healthy');
  });
});
