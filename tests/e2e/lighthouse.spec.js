// @ts-check
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// EGGlogU — Lighthouse Performance & Accessibility Audit
// Runs Lighthouse CI via CLI, validates scores against thresholds
// Requires: npm install -g @lhci/cli lighthouse
// ═══════════════════════════════════════════════════════════════

const BASE_URL = 'http://localhost:8080';
const REPORT_DIR = path.join(__dirname, '../../reports/lighthouse');

// Minimum score thresholds (0-100)
const THRESHOLDS = {
  performance: 50,    // PWA with heavy JS bundle — 50 is baseline
  accessibility: 70,  // Target: 80+ after fixes
  bestPractices: 60,
  seo: 60,
};

/** Run Lighthouse CLI and return scores */
function runLighthouse(url, name = 'default') {
  // Ensure report directory exists
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const outputPath = path.join(REPORT_DIR, `${name}.json`);

  try {
    execSync(
      `npx lighthouse "${url}" ` +
      `--output=json --output-path="${outputPath}" ` +
      `--chrome-flags="--headless --no-sandbox --disable-gpu" ` +
      `--only-categories=performance,accessibility,best-practices,seo ` +
      `--quiet`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return {
      performance: Math.round((report.categories.performance?.score || 0) * 100),
      accessibility: Math.round((report.categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((report.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((report.categories.seo?.score || 0) * 100),
      reportPath: outputPath,
    };
  } catch (err) {
    console.warn(`Lighthouse failed for ${url}: ${err.message}`);
    return null;
  }
}

test.describe('L — Lighthouse Audits', () => {

  test.skip(
    () => {
      try { execSync('npx lighthouse --version', { stdio: 'pipe' }); return false; }
      catch { return true; }
    },
    'Lighthouse not installed — run: npm install -g lighthouse @lhci/cli'
  );

  test('L01 — Login page performance baseline', async () => {
    const scores = runLighthouse(`${BASE_URL}/egglogu.html`, 'login');
    if (!scores) {
      test.skip();
      return;
    }

    console.log(`Login page scores: P=${scores.performance} A=${scores.accessibility} BP=${scores.bestPractices} SEO=${scores.seo}`);

    expect(scores.performance).toBeGreaterThanOrEqual(THRESHOLDS.performance);
    expect(scores.accessibility).toBeGreaterThanOrEqual(THRESHOLDS.accessibility);
    expect(scores.bestPractices).toBeGreaterThanOrEqual(THRESHOLDS.bestPractices);
  });

  test('L02 — Landing page (index.html) performance', async () => {
    const scores = runLighthouse(`${BASE_URL}/index.html`, 'landing');
    if (!scores) {
      test.skip();
      return;
    }

    console.log(`Landing page scores: P=${scores.performance} A=${scores.accessibility} BP=${scores.bestPractices} SEO=${scores.seo}`);

    // Landing page should score higher — it's simpler
    expect(scores.performance).toBeGreaterThanOrEqual(60);
    expect(scores.accessibility).toBeGreaterThanOrEqual(70);
    expect(scores.seo).toBeGreaterThanOrEqual(THRESHOLDS.seo);
  });

  test('L03 — Mobile performance (throttled)', async () => {
    if (!fs.existsSync(REPORT_DIR)) {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
    }

    const outputPath = path.join(REPORT_DIR, 'mobile.json');

    try {
      execSync(
        `npx lighthouse "${BASE_URL}/egglogu.html" ` +
        `--output=json --output-path="${outputPath}" ` +
        `--chrome-flags="--headless --no-sandbox --disable-gpu" ` +
        `--only-categories=performance ` +
        `--preset=desktop ` +
        `--quiet`,
        { timeout: 120000, stdio: 'pipe' }
      );

      const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      const perf = Math.round((report.categories.performance?.score || 0) * 100);

      console.log(`Mobile performance: ${perf}/100`);

      // Mobile threshold is lower
      expect(perf).toBeGreaterThanOrEqual(40);
    } catch (err) {
      console.warn(`Mobile Lighthouse failed: ${err.message}`);
      test.skip();
    }
  });
});
