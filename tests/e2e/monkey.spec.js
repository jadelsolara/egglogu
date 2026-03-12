// @ts-check
const { test, expect } = require('@playwright/test');

// ═══════════════════════════════════════════════════════════════
// EGGlogU — Monkey Testing (Gremlins.js integration)
// Random clicks, typing, scrolling to find JS errors & crashes
// ═══════════════════════════════════════════════════════════════

const BASE_URL = 'http://localhost:8080';

/** Inject auth bypass into localStorage */
async function bypassAuth(page) {
  await page.addInitScript(() => {
    const user = {
      id: 'monkey-tester',
      email: 'monkey@test.egglogu.com',
      name: 'Monkey Tester',
      role: 'admin',
      farmId: 'farm-monkey-001',
      plan: 'enterprise',
      token: 'test-token-monkey',
    };
    localStorage.setItem('egglogu_user', JSON.stringify(user));
    localStorage.setItem('egglogu_token', user.token);
    localStorage.setItem('egglogu_farm', JSON.stringify({
      id: user.farmId, name: 'Monkey Farm', plan: 'enterprise'
    }));
  });
}

/** Wait for the app shell to be ready */
async function waitForApp(page) {
  await page.goto(`${BASE_URL}/egglogu.html`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
}

// Gremlins.js CDN — lightweight monkey testing library
const GREMLINS_CDN = 'https://unpkg.com/gremlins.js@2.2.0/dist/gremlins.min.js';

test.describe('M — Monkey Testing (Gremlins.js)', () => {

  test('M01 — Random clicks survive without JS errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    // Inject gremlins.js
    await page.addScriptTag({ url: GREMLINS_CDN });

    // Run clicker gremlin for 5 seconds
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const horde = window.gremlins.createHorde({
          species: [window.gremlins.species.clicker()],
          mogwais: [window.gremlins.mogwais.alert()],
          strategies: [window.gremlins.strategies.distribution({
            delay: 50,
            nb: 100,
          })],
        });
        horde.unleash().then(resolve).catch(resolve);
      });
    });

    // Allow critical errors only (filter out benign ones)
    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Script error') &&
      !e.includes('NetworkError') &&
      !e.includes('Failed to fetch')
    );

    expect(criticalErrors.length).toBeLessThanOrEqual(2);
  });

  test('M02 — Random form filling doesn\'t crash', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    await page.addScriptTag({ url: GREMLINS_CDN });

    // Run form filler gremlin
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const horde = window.gremlins.createHorde({
          species: [window.gremlins.species.formFiller()],
          strategies: [window.gremlins.strategies.distribution({
            delay: 30,
            nb: 80,
          })],
        });
        horde.unleash().then(resolve).catch(resolve);
      });
    });

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Script error') &&
      !e.includes('NetworkError')
    );
    expect(criticalErrors.length).toBeLessThanOrEqual(3);
  });

  test('M03 — Random scrolling doesn\'t break layout', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    await page.addScriptTag({ url: GREMLINS_CDN });

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const horde = window.gremlins.createHorde({
          species: [window.gremlins.species.scroller()],
          strategies: [window.gremlins.strategies.distribution({
            delay: 20,
            nb: 120,
          })],
        });
        horde.unleash().then(resolve).catch(resolve);
      });
    });

    // Verify page is still interactive after scroll chaos
    const body = await page.$('body');
    expect(body).not.toBeNull();

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Script error')
    );
    expect(criticalErrors.length).toBeLessThanOrEqual(1);
  });

  test('M04 — Full chaos horde (click+type+scroll) — 200 actions', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleLogs.push(msg.text());
    });

    await bypassAuth(page);
    await waitForApp(page);

    await page.addScriptTag({ url: GREMLINS_CDN });

    const startTime = Date.now();

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const horde = window.gremlins.createHorde({
          species: [
            window.gremlins.species.clicker(),
            window.gremlins.species.formFiller(),
            window.gremlins.species.scroller(),
            window.gremlins.species.typer(),
          ],
          mogwais: [
            window.gremlins.mogwais.alert(),
            window.gremlins.mogwais.gizmo(),
          ],
          strategies: [window.gremlins.strategies.distribution({
            delay: 25,
            nb: 200,
          })],
        });
        horde.unleash().then(resolve).catch(resolve);
      });
    });

    const duration = Date.now() - startTime;

    // App should still be alive
    const title = await page.title();
    expect(title).toBeTruthy();

    // No more than 5 critical JS errors from 200 random actions
    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Script error') &&
      !e.includes('NetworkError') &&
      !e.includes('Failed to fetch') &&
      !e.includes('DOMException')
    );
    expect(criticalErrors.length).toBeLessThanOrEqual(5);

    console.log(`Monkey chaos: 200 actions in ${duration}ms, ${jsErrors.length} total errors, ${criticalErrors.length} critical`);
  });

  test('M05 — Monkey testing across all sections', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    const sections = [
      'dashboard', 'flocks', 'production', 'health',
      'feed', 'environment', 'clients', 'finance',
    ];

    await page.addScriptTag({ url: GREMLINS_CDN });

    for (const section of sections) {
      // Navigate to section via sidebar
      await page.evaluate((sec) => {
        const sidebar = document.querySelector('egg-sidebar');
        if (sidebar && sidebar.shadowRoot) {
          const link = sidebar.shadowRoot.querySelector(`[data-section="${sec}"]`);
          if (link) link.click();
        }
      }, section);
      await page.waitForTimeout(500);

      // Quick 30-action monkey burst per section
      await page.evaluate(() => {
        return new Promise((resolve) => {
          const horde = window.gremlins.createHorde({
            species: [
              window.gremlins.species.clicker(),
              window.gremlins.species.formFiller(),
            ],
            strategies: [window.gremlins.strategies.distribution({
              delay: 30,
              nb: 30,
            })],
          });
          horde.unleash().then(resolve).catch(resolve);
        });
      });
    }

    // After visiting all sections with monkey chaos, app should still work
    const body = await page.$('body');
    expect(body).not.toBeNull();

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Script error') &&
      !e.includes('NetworkError') &&
      !e.includes('Failed to fetch')
    );
    // Allow up to 2 errors per section visited
    expect(criticalErrors.length).toBeLessThanOrEqual(sections.length * 2);
  });

  test('M06 — Rapid keyboard input doesn\'t crash', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    // Type random strings into every visible input
    const inputs = await page.$$('input:visible, textarea:visible');
    for (const input of inputs.slice(0, 10)) {
      try {
        await input.click({ timeout: 1000 });
        await input.type('🐔🥚Monkey Test 12345!@#$%^&*()', { delay: 5 });
      } catch { /* some inputs may not be interactive */ }
    }

    // Also try shadow DOM inputs
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll('input, textarea').forEach(input => {
            try {
              input.value = '🐒CHAOS🐒' + Math.random();
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch {}
          });
        }
      });
    });

    await page.waitForTimeout(1000);

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') && !e.includes('Script error')
    );
    expect(criticalErrors.length).toBeLessThanOrEqual(2);
  });
});
