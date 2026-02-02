// E2E Test Configuration

import type { TestConfig } from './types';

export const config: TestConfig = {
  baseUrl: process.env.BASE_URL || 'https://simulive.cloudysky.xyz',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  timeout: 30000,
  retries: 2,
};

export const endpoints = {
  // Pages
  home: '/',
  watch: (slug: string) => `/watch/${slug}`,
  embed: (slug: string) => `/embed/${slug}`,
  admin: '/admin',
  adminLogin: '/admin/login',
  adminAudit: '/admin/audit',

  // API
  api: {
    health: '/api/health',
    streams: '/api/streams',
    stream: (id: string) => `/api/streams/${id}`,
    streamStatus: (id: string) => `/api/streams/${id}/status`,
    login: '/api/admin/login',
    logout: '/api/admin/logout',
    audit: '/api/admin/audit',
    muxAssets: '/api/mux/assets',
    tokens: (playbackId: string) => `/api/tokens/${playbackId}`,
  },
};

export const testData = {
  // Test stream data
  validStream: {
    title: 'E2E Test Stream',
    slug: 'e2e-test-stream',
    loopCount: 1,
  },
  invalidSlug: 'Invalid Slug!@#',
  nonExistentSlug: 'non-existent-slug-12345',
  wrongPassword: 'wrong-password-123',
};

export const selectors = {
  // Login page
  loginPasswordInput: 'input[type="password"]',
  loginButton: 'button[type="submit"]',
  loginError: '[data-testid="login-error"], .error, [role="alert"]',

  // Admin dashboard
  createStreamButton: 'button:has-text("New Stream"), button:has-text("Create Stream"), [data-testid="create-stream"]',
  streamList: '[data-testid="stream-list"], .stream-list, table',
  streamRow: '[data-testid="stream-row"], .stream-row, tr',
  editButton: 'button:has-text("Edit"), [data-testid="edit-stream"]',
  deleteButton: 'button:has-text("Delete"), [data-testid="delete-stream"]',
  activateButton: 'button:has-text("Activate"), [data-testid="activate-stream"]',
  deactivateButton: 'button:has-text("Deactivate"), [data-testid="deactivate-stream"]',
  stopButton: 'button:has-text("Stop"), [data-testid="stop-stream"]',
  resumeButton: 'button:has-text("Resume"), [data-testid="resume-stream"]',
  embedButton: 'button:has-text("Embed"), [data-testid="embed-stream"]',
  previewButton: 'button:has-text("Preview"), a:has-text("Preview"), [data-testid="preview-stream"]',
  logoutButton: 'button:has-text("Logout"), [data-testid="logout"]',

  // Stream form
  titleInput: 'input[name="title"], [data-testid="stream-title"]',
  slugInput: 'input[name="slug"], [data-testid="stream-slug"]',
  scheduledStartInput: 'input[name="scheduledStart"], [data-testid="scheduled-start"]',
  loopCountInput: 'input[name="loopCount"], [data-testid="loop-count"]',
  assetPicker: '[data-testid="asset-picker"], .asset-picker',
  submitButton: 'button[type="submit"], button:has-text("Create"), button:has-text("Save")',
  cancelButton: 'button:has-text("Cancel")',

  // Watch page
  videoPlayer: '[data-testid="video-player"], .mux-player, mux-player',
  liveBadge: '[data-testid="live-badge"], .live-badge, :has-text("LIVE")',
  countdown: '[data-testid="countdown"], .countdown',
  endedMessage: '[data-testid="ended"], .ended, :has-text("ended")',
  unavailableMessage: '[data-testid="unavailable"], .unavailable, :has-text("unavailable")',

  // Home page
  liveSection: '[data-testid="live-now"], .live-now, :has-text("Live Now")',
  upcomingSection: '[data-testid="upcoming"], .upcoming, :has-text("Upcoming")',
  streamCard: '[data-testid="stream-card"], .stream-card, a[href^="/watch/"]',

  // Audit logs
  auditTable: '[data-testid="audit-table"], .audit-table, table',
  auditRow: '[data-testid="audit-row"], .audit-row, tr',
  eventFilter: '[data-testid="event-filter"], select[name="event"]',
  ipFilter: '[data-testid="ip-filter"], input[name="ip"]',
  clearFilters: 'button:has-text("Clear"), [data-testid="clear-filters"]',
  refreshButton: 'button:has-text("Refresh"), [data-testid="refresh"]',
  pagination: '[data-testid="pagination"], .pagination',
  nextPage: 'button:has-text("Next"), [data-testid="next-page"]',
  prevPage: 'button:has-text("Previous"), button:has-text("Prev"), [data-testid="prev-page"]',

  // Embed modal - use content-based selectors since data-testid may not be in production
  embedModal: 'div.fixed:has(h2:has-text("Embed Code"))',
  embedCode: 'code:has-text("iframe")',
  responsiveToggle: 'button:has-text("Responsive")',
  fixedSizeToggle: 'button:has-text("Fixed")',
  copyButton: 'button:has-text("Copy")',

  // Confirmation dialog
  confirmDialog: '[data-testid="confirm-dialog"], [role="alertdialog"], .confirm-dialog',
  confirmButton: 'button:has-text("Confirm"), button:has-text("Yes"), [data-testid="confirm"]',
  cancelConfirmButton: 'button:has-text("Cancel"), button:has-text("No"), [data-testid="cancel-confirm"]',
};

export const badges = {
  live: ['LIVE', 'LIVE NOW'],
  scheduled: ['SCHEDULED', 'UPCOMING'],
  stopped: ['STOPPED'],
  ended: ['ENDED'],
  inactive: ['INACTIVE'],
};
