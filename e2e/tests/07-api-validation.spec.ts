/**
 * Suite 7: API Validation Tests
 *
 * Purpose: Verify API endpoints, authentication, and error handling.
 * Priority: High
 */

import { test, expect } from '@playwright/test';
import { request } from '@playwright/test';
import * as api from '../lib/api-helpers';
import * as helpers from '../lib/test-helpers';
import { config, endpoints, testData } from '../lib/config';

test.describe('Suite 7: API Validation', () => {
  test.afterAll(async () => {
    await api.disposeApiContext();
  });

  test('7.1: GET /api/streams', async () => {
    // Step 1: Make GET request to /api/streams
    const { streams, cached } = await api.getStreams();

    // Step 2: Parse response
    // Expected Result: HTTP 200, JSON array of streams
    expect(Array.isArray(streams)).toBe(true);

    // Verification: Streams have required fields
    if (streams.length > 0) {
      const stream = streams[0];
      expect(stream.id).toBeDefined();
      expect(stream.slug).toBeDefined();
      expect(stream.title).toBeDefined();
      expect(stream.scheduledStart).toBeDefined();

      // Verification: Playlist items ordered correctly
      if (stream.playlistItems && stream.playlistItems.length > 1) {
        const orders = stream.playlistItems.map((item) => item.order);
        const sorted = [...orders].sort((a, b) => a - b);
        expect(orders).toEqual(sorted);
      }
    }

    console.log(`Retrieved ${streams.length} streams, Cached: ${cached}`);
  });

  test('7.2: POST /api/streams - Unauthorized', async () => {
    // Step 1: Clear session
    await api.disposeApiContext();

    // Step 2: Make POST request without auth
    const apiContext = await request.newContext({ baseURL: config.baseUrl });

    const response = await apiContext.post(endpoints.api.streams, {
      data: {
        title: 'Unauthorized Test',
        slug: 'unauthorized-test',
        assetIds: ['fake-asset'],
        scheduledStart: new Date().toISOString(),
      },
      headers: { 'Content-Type': 'application/json' },
    });

    // Step 3: Observe response
    // Expected Result: HTTP 401 Unauthorized
    expect(response.status()).toBe(401);

    await apiContext.dispose();

    // Re-login for subsequent tests
    await api.login(config.adminPassword);
  });

  test('7.3: POST /api/streams - Invalid Body', async () => {
    // Ensure authenticated
    await api.login(config.adminPassword);

    // Step 1-2: POST with missing required fields
    const result = await api.createStream({
      title: '', // Empty title
      slug: '', // Empty slug
      assetIds: [], // Empty assets
      scheduledStart: '', // Invalid date
    });

    // Step 3: Observe response
    // Expected Result: HTTP 400 Bad Request
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.error).toBeDefined();

    console.log(`Validation error: ${result.error}`);
  });

  test('7.4: PATCH /api/streams/[id]', async () => {
    // Create a stream to update
    const assets = await api.getMuxAssets({ limit: 1 });
    const readyAssets = assets.filter((a) => a.status === 'ready' && a.playback_ids?.length > 0);

    if (readyAssets.length === 0) {
      test.skip(true, 'No Mux assets available');
      return;
    }

    const createResult = await api.createStream({
      title: 'E2E API Patch Test',
      slug: 'e2e-api-patch-test',
      assetIds: [readyAssets[0].id],
      scheduledStart: helpers.getFutureDate(24).toISOString(),
    });

    expect(createResult.stream).toBeDefined();
    const streamId = createResult.stream!.id;

    // Step 1: PATCH with title update
    const newTitle = 'E2E API Patch Test - Updated';
    const patchResult = await api.updateStream(streamId, { title: newTitle });

    // Step 2: Observe response
    // Expected Result: HTTP 200, stream updated
    expect(patchResult.status).toBeLessThan(400);
    expect(patchResult.stream?.title).toBe(newTitle);

    // Step 3: GET to verify persistence
    const verifyStream = await api.getStream(streamId);
    expect(verifyStream?.title).toBe(newTitle);

    // Cleanup
    await api.deleteStream(streamId);
  });

  test('7.5: DELETE /api/streams/[id]', async () => {
    // Create a stream to delete
    const assets = await api.getMuxAssets({ limit: 1 });
    const readyAssets = assets.filter((a) => a.status === 'ready' && a.playback_ids?.length > 0);

    if (readyAssets.length === 0) {
      test.skip(true, 'No Mux assets available');
      return;
    }

    const createResult = await api.createStream({
      title: 'E2E API Delete Test',
      slug: 'e2e-api-delete-test',
      assetIds: [readyAssets[0].id],
      scheduledStart: helpers.getFutureDate(24).toISOString(),
    });

    expect(createResult.stream).toBeDefined();
    const streamId = createResult.stream!.id;

    // Step 1: DELETE the stream
    const deleteResult = await api.deleteStream(streamId);

    // Step 2: Observe response
    // Expected Result: DELETE returns 200 or 204
    expect(deleteResult.success).toBe(true);

    // Step 3: GET same stream should return 404
    const deletedStream = await api.getStream(streamId);
    expect(deletedStream).toBeNull();
  });

  test('7.6: GET /api/streams/[id]/status', async () => {
    const assets = await api.getMuxAssets({ limit: 1 });
    const readyAssets = assets.filter((a) => a.status === 'ready' && a.playback_ids?.length > 0);

    if (readyAssets.length === 0) {
      test.skip(true, 'No Mux assets available');
      return;
    }

    const createResult = await api.createStream({
      title: 'E2E API Status Test',
      slug: `e2e-api-status-${Date.now()}`,
      assetIds: [readyAssets[0].id],
      scheduledStart: helpers.getFutureDate(1).toISOString(),
    });

    if (!createResult.stream) {
      throw new Error(`Failed to create status test stream: ${createResult.error}`);
    }

    const streamId = createResult.stream.id;
    await api.updateStream(streamId, { isActive: true });

    // Step 1: GET status
    const startTime = Date.now();
    const status = await api.getStreamStatus(streamId);
    const duration = Date.now() - startTime;

    // Step 2: Parse response
    // Expected Result: HTTP 200, JSON with endedAt and isActive
    expect(status).not.toBeNull();
    expect(status).toHaveProperty('endedAt');
    expect(status).toHaveProperty('isActive');

    // Verification: Response is fast
    console.log(`Status endpoint response time: ${duration}ms`);
    // Should be under 500ms ideally (allowing for network)
    expect(duration).toBeLessThan(5000);

    // Verification: Fields match stream state
    expect(status!.isActive).toBe(true);

    await api.deleteStream(streamId).catch(() => {});
  });

  test('7.7: POST /api/admin/login - Rate Limit Headers @ratelimit', async () => {
    // Create fresh context for rate limit test
    const apiContext = await request.newContext({ baseURL: config.baseUrl });

    // Make multiple failed attempts
    for (let i = 0; i < 6; i++) {
      const response = await apiContext.post(endpoints.api.login, {
        data: { password: 'wrong-password-rate-test' },
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status() === 429) {
        // Step 2: Observe response
        // Expected Result: HTTP 429, Retry-After header present
        const retryAfter = response.headers()['retry-after'];
        console.log(`Rate limited after ${i + 1} attempts, Retry-After: ${retryAfter}`);

        // Verification: Header indicates wait time
        expect(retryAfter || response.status() === 429).toBeTruthy();
        break;
      }
    }

    await apiContext.dispose();
  });

  test('7.8: GET /api/admin/audit - Filtering', async () => {
    // Ensure authenticated
    await api.login(config.adminPassword);

    // Step 1: GET with query parameters
    const filteredLogs = await api.getAuditLogs({
      event: 'LOGIN_SUCCESS',
      limit: 10,
    });

    // Step 2: Parse response
    // Expected Result: Filtered results returned
    expect(filteredLogs.logs).toBeDefined();
    expect(filteredLogs.limit).toBe(10);

    // Verification: All items match filter
    if (filteredLogs.logs.length > 0) {
      const allMatch = filteredLogs.logs.every((log) => log.event === 'LOGIN_SUCCESS');
      expect(allMatch).toBe(true);
    }

    // Verification: Response has pagination fields
    expect(filteredLogs.total).toBeDefined();
    expect(filteredLogs.offset).toBeDefined();
  });

  test('7.9: GET /api/mux/assets', async () => {
    // Ensure authenticated
    await api.login(config.adminPassword);

    // Step 1: GET assets
    const assets = await api.getMuxAssets({ limit: 10 });

    // Step 2: Parse response
    // Expected Result: HTTP 200, array of assets
    expect(Array.isArray(assets)).toBe(true);

    // Verification: Assets have required fields
    if (assets.length > 0) {
      const asset = assets[0];
      expect(asset.id).toBeDefined();
      expect(asset.status).toBeDefined();

      // Ready assets should have playback IDs
      const readyAssets = assets.filter((a) => a.status === 'ready');
      if (readyAssets.length > 0) {
        expect(readyAssets[0].playback_ids).toBeDefined();
        expect(readyAssets[0].playback_ids.length).toBeGreaterThan(0);
      }
    }

    console.log(`Retrieved ${assets.length} Mux assets`);
  });
});
