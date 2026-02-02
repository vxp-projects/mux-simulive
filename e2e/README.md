# E2E Test Suite

End-to-end tests for the Simulive streaming platform, designed to be executed by AI agents or developers.

## Quick Start

```bash
# Install dependencies (from project root)
npm install
npx playwright install chromium

# Run all tests
npm run test:e2e

# Run specific suite
npm run test:e2e -- --grep "Suite 1"

# Run with UI
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug
```

## Prerequisites

1. **Target Environment**: Tests run against `https://simulive.cloudysky.xyz` by default.

2. **Environment Variables**: Set in `.env` or export:
   ```bash
   ADMIN_PASSWORD=your-password  # Required for admin tests
   BASE_URL=https://simulive.cloudysky.xyz  # Default target
   SKIP_ADMIN_PASSWORD_CHECK=true  # Optional; skip admin checks for health-only runs
   ```

3. **For Local Testing**:
   ```bash
   BASE_URL=http://localhost:3000 npm run test:e2e
   ```

## Test Suites

| Suite | File | Tests | Description |
|-------|------|-------|-------------|
| 1. Health Check | `01-health-check.spec.ts` | 1 | Verifies all backend services |
| 2. Authentication | `02-authentication.spec.ts` | 6 | Login, logout, sessions, rate limiting |
| 3. Stream Management | `03-stream-management.spec.ts` | 12 | CRUD, status changes, embed codes |
| 4. Viewer Experience | `04-viewer-experience.spec.ts` | 8 | Watch pages, sync, stop detection |
| 5. Embed Functionality | `05-embed-functionality.spec.ts` | 4 | Responsive/fixed embeds |
| 6. Audit Logs | `06-audit-logs.spec.ts` | 5 | Logging, filtering, pagination |
| 7. API Validation | `07-api-validation.spec.ts` | 9 | Endpoint validation, error handling |
| 8. Cache Behavior | `08-cache-behavior.spec.ts` | 4 | Cache headers, invalidation |

## Running Tests

### All Tests (Sequential)
```bash
npm run test:e2e
```

### Specific Suite
```bash
# By suite name
npm run test:e2e -- --grep "Suite 1"
npm run test:e2e -- --grep "Authentication"

# By file
npm run test:e2e -- tests/02-authentication.spec.ts
```

### Specific Test
```bash
npm run test:e2e -- --grep "2.1: Admin Login"
```

### Rate Limit Tests (Run at the End)
Rate limit tests are tagged with `@ratelimit` and run as a separate project after the main suite.
To run only rate limit tests:
```bash
npm run test:e2e -- --grep "@ratelimit"
```

### With Visual UI
```bash
npm run test:e2e:ui
```

### Debug Mode
```bash
npm run test:e2e:debug
```

## AI Agent Execution

This test suite is designed to be run by AI agents using Playwright. Each test includes:

- **Step-by-step instructions** - Clear actions to perform
- **Expected results** - What should happen
- **Verification criteria** - How to confirm success

### Using with Playwright MCP

AI agents can use these tools:
- `browser_navigate` - Navigate to URLs
- `browser_snapshot` - Capture page state
- `browser_click` - Click elements
- `browser_type` - Enter text
- `browser_fill_form` - Fill forms
- `browser_wait_for` - Wait for conditions

### Manual Test Execution

AI agents can also run tests manually by:

1. Reading the test file to understand steps
2. Using Playwright MCP tools to perform actions
3. Verifying results match expected outcomes
4. Reporting pass/fail status

## Test Structure

```
e2e/
├── playwright.config.ts    # Playwright configuration
├── global-setup.ts         # Pre-test environment check
├── global-teardown.ts      # Post-test cleanup
├── lib/
│   ├── config.ts          # URLs, selectors, test data
│   ├── types.ts           # TypeScript interfaces
│   ├── api-helpers.ts     # API request utilities
│   ├── test-helpers.ts    # Browser automation helpers
│   └── index.ts           # Main export
├── tests/
│   ├── 01-health-check.spec.ts
│   ├── 02-authentication.spec.ts
│   ├── 03-stream-management.spec.ts
│   ├── 04-viewer-experience.spec.ts
│   ├── 05-embed-functionality.spec.ts
│   ├── 06-audit-logs.spec.ts
│   ├── 07-api-validation.spec.ts
│   └── 08-cache-behavior.spec.ts
└── reports/               # Test results and screenshots
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://simulive.cloudysky.xyz` | Application URL |
| `ADMIN_PASSWORD` | - | Admin authentication |
| `START_SERVER` | - | If set, starts dev server automatically |
| `CI` | - | Enables CI mode (retries, strict) |
| `SKIP_ADMIN_PASSWORD_CHECK` | - | Skip admin password verification in setup |

### Selectors

Test selectors are defined in `lib/config.ts`. If your UI differs, update the selectors:

```typescript
export const selectors = {
  loginPasswordInput: 'input[type="password"]',
  loginButton: 'button[type="submit"]',
  // ... more selectors
};
```

## Reports

After running tests, reports are generated in:

- `e2e/reports/html/` - Interactive HTML report
- `e2e/reports/results.json` - JSON results
- `e2e/reports/screenshots/` - Failure screenshots

View HTML report:
```bash
npx playwright show-report e2e/reports/html
```

## Troubleshooting

### Tests Fail on Health Check
- Ensure server is running: `npm run dev`
- Check database connection: `npm run db:push`
- Verify Redis is running

### Authentication Tests Fail
- Verify `ADMIN_PASSWORD` matches server configuration
- Check for rate limiting (wait 15 minutes or clear Redis)
- Rate limit tests are tagged with `@ratelimit` and run after the main suite

### Stream Tests Skip
- Ensure Mux assets exist in your account
- Assets must have "ready" status

## Contributing

When adding new tests:

1. Follow naming convention: `XX-feature-name.spec.ts`
2. Include JSDoc header with purpose and priority
3. Use helpers from `lib/test-helpers.ts`
4. Add cleanup in `afterAll` hooks
5. Update this README with new test info
