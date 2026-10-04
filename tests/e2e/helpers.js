// 2026-10-03 22:09, shared config for the headless browser suites (moved from the session scratchpad into the repo)
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.TEST_PORT || '3917';
const B = `http://localhost:${PORT}`;
const FIXTURES = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });

const { chromium } = require('playwright-core');

// Use PLAYWRIGHT_CHROMIUM_PATH to point at an installed Chromium / headless shell;
// otherwise Playwright's own download is used (`npx playwright-core install chromium`).
const launch = () => chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}
);

module.exports = { ROOT, PORT, B, FIXTURES, OUT, chromium, launch };
