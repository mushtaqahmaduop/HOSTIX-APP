// Phase 0 safety-net — Playwright config for the HOSTIX Electron smoke test.
// Single worker, no retries, generous timeout (Electron cold-launches twice per run).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Playwright owns `*.spec.js` only. Plain-Node unit tests in this folder are
  // named `*.test.js` and are run by `npm run test:*` — without this, Playwright's
  // default match picks them up, executes them at collection time, and their
  // process.exit() tears down the run before any real spec executes.
  testMatch: '**/*.spec.js',
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
