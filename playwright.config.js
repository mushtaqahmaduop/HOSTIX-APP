// Phase 0 safety-net — Playwright config for the HOSTIX Electron smoke test.
// Single worker, no retries, generous timeout (Electron cold-launches twice per run).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
