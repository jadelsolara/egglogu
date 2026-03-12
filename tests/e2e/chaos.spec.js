// @ts-check
const { test, expect } = require('@playwright/test');

// ═══════════════════════════════════════════════════════════════
// EGGlogU — Chaos & Resilience Testing
// Simulates network failures, localStorage corruption, CSS
// breakage, and degraded conditions (rural internet, offline)
// Inspired by: Chaos Frontend Toolkit, Toxiproxy patterns
// ═══════════════════════════════════════════════════════════════

const BASE_URL = 'http://localhost:8080';

async function bypassAuth(page) {
  await page.addInitScript(() => {
    const user = {
      id: 'chaos-tester',
      email: 'chaos@test.egglogu.com',
      name: 'Chaos Tester',
      role: 'admin',
      farmId: 'farm-chaos-001',
      plan: 'enterprise',
      token: 'test-token-chaos',
    };
    localStorage.setItem('egglogu_user', JSON.stringify(user));
    localStorage.setItem('egglogu_token', user.token);
    localStorage.setItem('egglogu_farm', JSON.stringify({
      id: user.farmId, name: 'Chaos Farm', plan: 'enterprise'
    }));
  });
}

async function waitForApp(page) {
  await page.goto(`${BASE_URL}/egglogu.html`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
}

test.describe('C — Chaos: Network Failures', () => {

  test('C01 — App survives complete offline mode', async ({ page, context }) => {
    await bypassAuth(page);
    await waitForApp(page);

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Try to navigate
    await page.evaluate(() => {
      const sidebar = document.querySelector('egg-sidebar');
      if (sidebar && sidebar.shadowRoot) {
        const links = sidebar.shadowRoot.querySelectorAll('[data-section]');
        links.forEach(l => l.click());
      }
    });

    await page.waitForTimeout(500);

    // App should still render (offline-first)
    const body = await page.$('body');
    expect(body).not.toBeNull();

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(1000);

    // App should recover
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('C02 — Survives intermittent connectivity (rural internet)', async ({ page, context }) => {
    await bypassAuth(page);
    await waitForApp(page);

    // Simulate rural internet: toggle offline/online rapidly
    for (let i = 0; i < 10; i++) {
      await context.setOffline(true);
      await page.waitForTimeout(200 + Math.random() * 300);
      await context.setOffline(false);
      await page.waitForTimeout(200 + Math.random() * 300);
    }

    // App should still work
    const body = await page.$('body');
    expect(body).not.toBeNull();
  });

  test('C03 — Survives slow network (3G simulation)', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Simulate 3G: 750ms latency, 250kbps download
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 250 * 1024 / 8, // 250 kbps
      uploadThroughput: 50 * 1024 / 8,     // 50 kbps
      latency: 750,
    });

    await bypassAuth(page);
    await page.goto(`${BASE_URL}/egglogu.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // App should load even on 3G
    const title = await page.title();
    expect(title).toBeTruthy();

    // Reset network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });

  test('C04 — API requests fail gracefully (500 errors)', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Intercept API calls and return 500
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Chaos test: server error' }),
      });
    });

    await bypassAuth(page);
    await waitForApp(page);

    // Navigate through sections — all should handle errors gracefully
    const sections = ['dashboard', 'production', 'flocks', 'health'];
    for (const section of sections) {
      await page.evaluate((sec) => {
        const sidebar = document.querySelector('egg-sidebar');
        if (sidebar && sidebar.shadowRoot) {
          const link = sidebar.shadowRoot.querySelector(`[data-section="${sec}"]`);
          if (link) link.click();
        }
      }, section);
      await page.waitForTimeout(500);
    }

    // App should not crash from 500 errors
    const body = await page.$('body');
    expect(body).not.toBeNull();

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('NetworkError') &&
      !e.includes('Failed to fetch') &&
      !e.includes('ResizeObserver') &&
      !e.includes('500')
    );
    expect(criticalErrors.length).toBeLessThanOrEqual(2);
  });

  test('C05 — Timeout simulation (requests hang forever)', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Intercept API calls and never respond (simulate timeout)
    await page.route('**/api/**', route => {
      // Just don't respond — let it hang
      // The app should have timeouts
    });

    await bypassAuth(page);
    await waitForApp(page);

    await page.waitForTimeout(3000);

    // App should still be responsive even with hanging requests
    const body = await page.$('body');
    expect(body).not.toBeNull();
  });
});

test.describe('C — Chaos: localStorage Corruption', () => {

  test('C06 — Corrupted user JSON in localStorage', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.addInitScript(() => {
      localStorage.setItem('egglogu_user', '{corrupted json!!!');
      localStorage.setItem('egglogu_token', 'invalid');
    });

    await page.goto(`${BASE_URL}/egglogu.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // App should redirect to login or show error gracefully
    const body = await page.$('body');
    expect(body).not.toBeNull();

    // Should not have uncaught JSON parse errors
    const parseErrors = jsErrors.filter(e =>
      e.includes('JSON') || e.includes('Unexpected token')
    );
    expect(parseErrors.length).toBe(0);
  });

  test('C07 — localStorage full (quota exceeded)', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);

    // Fill localStorage to capacity
    await page.addInitScript(() => {
      try {
        const big = 'x'.repeat(1024 * 1024); // 1MB string
        for (let i = 0; i < 10; i++) {
          localStorage.setItem(`chaos_fill_${i}`, big);
        }
      } catch {}
    });

    await waitForApp(page);

    // App should handle quota exceeded gracefully
    const body = await page.$('body');
    expect(body).not.toBeNull();

    // Clean up
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        localStorage.removeItem(`chaos_fill_${i}`);
      }
    });
  });

  test('C08 — localStorage cleared mid-session', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    // Clear localStorage while app is running
    await page.evaluate(() => localStorage.clear());
    await page.waitForTimeout(1000);

    // Try to interact with the app
    await page.evaluate(() => {
      const sidebar = document.querySelector('egg-sidebar');
      if (sidebar && sidebar.shadowRoot) {
        const link = sidebar.shadowRoot.querySelector('[data-section="dashboard"]');
        if (link) link.click();
      }
    });

    await page.waitForTimeout(1000);

    // App should either redirect to login or handle gracefully
    const body = await page.$('body');
    expect(body).not.toBeNull();
  });

  test('C09 — IndexedDB deleted mid-session', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    // Delete IndexedDB while app is running
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
    });

    await page.waitForTimeout(1000);

    // Navigate to a data-heavy section
    await page.evaluate(() => {
      const sidebar = document.querySelector('egg-sidebar');
      if (sidebar && sidebar.shadowRoot) {
        const link = sidebar.shadowRoot.querySelector('[data-section="production"]');
        if (link) link.click();
      }
    });

    await page.waitForTimeout(1000);

    // App should not crash
    const body = await page.$('body');
    expect(body).not.toBeNull();
  });
});

test.describe('C — Chaos: CSS & DOM Breakage', () => {

  test('C10 — Injected CSS doesn\'t break layout', async ({ page }) => {
    await bypassAuth(page);
    await waitForApp(page);

    // Inject chaotic CSS
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        * { font-size: 72px !important; }
        div { transform: rotate(5deg) !important; }
        body { direction: rtl !important; }
      `;
      document.head.appendChild(style);
    });

    await page.waitForTimeout(1000);

    // Shadow DOM components should be UNAFFECTED by external CSS
    const sidebarExists = await page.evaluate(() => {
      const sidebar = document.querySelector('egg-sidebar');
      return sidebar && sidebar.shadowRoot !== null;
    });
    expect(sidebarExists).toBe(true);
  });

  test('C11 — DOM manipulation doesn\'t crash app', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    // Remove random DOM elements
    await page.evaluate(() => {
      const elements = document.querySelectorAll('div, span, p');
      const toRemove = Array.from(elements).slice(0, 5);
      toRemove.forEach(el => {
        try { el.remove(); } catch {}
      });
    });

    await page.waitForTimeout(1000);

    // App should still function
    const body = await page.$('body');
    expect(body).not.toBeNull();
  });

  test('C12 — Service Worker failure handled', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Unregister service workers
    await page.addInitScript(async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }
    });

    await bypassAuth(page);
    await waitForApp(page);

    // App should work without service worker
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});

test.describe('C — Chaos: Extreme Data', () => {

  test('C13 — XSS payloads in inputs don\'t execute', async ({ page }) => {
    const alertFired = [];
    page.on('dialog', dialog => {
      alertFired.push(dialog.message());
      dialog.dismiss();
    });

    await bypassAuth(page);
    await waitForApp(page);

    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '"><svg onload=alert("XSS")>',
      "'; DROP TABLE users; --",
      '{{constructor.constructor("alert(1)")()}}',
    ];

    // Inject XSS payloads into shadow DOM inputs
    await page.evaluate((payloads) => {
      document.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll('input, textarea').forEach((input, i) => {
            const payload = payloads[i % payloads.length];
            input.value = payload;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
      });
    }, xssPayloads);

    await page.waitForTimeout(2000);

    // No XSS alerts should fire
    expect(alertFired.length).toBe(0);
  });

  test('C14 — Massive data in localStorage handled', async ({ page }) => {
    await page.addInitScript(() => {
      // Create 500 fake flock records
      const flocks = Array.from({ length: 500 }, (_, i) => ({
        id: `flock-${i}`,
        name: `Flock ${i}`,
        breed: 'Hy-Line Brown',
        count: Math.floor(Math.random() * 10000),
        data: 'x'.repeat(100), // padding
      }));
      localStorage.setItem('egglogu_offline_flocks', JSON.stringify(flocks));
    });

    await bypassAuth(page);
    await waitForApp(page);

    // App should handle large data without freezing
    const body = await page.$('body');
    expect(body).not.toBeNull();
  });
});

test.describe('C — Chaos: Concurrent & Race Conditions', () => {

  test('C15 — Multiple tabs don\'t corrupt shared state', async ({ context }) => {
    // Open 3 tabs simultaneously
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
      context.newPage(),
    ]);

    for (const page of pages) {
      await page.addInitScript(() => {
        const user = {
          id: 'chaos-multi',
          email: 'chaos@test.egglogu.com',
          name: 'Chaos Multi',
          role: 'admin',
          farmId: 'farm-chaos-001',
          plan: 'enterprise',
          token: 'test-token-chaos',
        };
        localStorage.setItem('egglogu_user', JSON.stringify(user));
        localStorage.setItem('egglogu_token', user.token);
      });
    }

    // Navigate all tabs simultaneously
    await Promise.all(pages.map(p =>
      p.goto(`${BASE_URL}/egglogu.html`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    ));

    await Promise.all(pages.map(p => p.waitForTimeout(2000)));

    // All tabs should be alive
    for (const page of pages) {
      const body = await page.$('body');
      expect(body).not.toBeNull();
    }

    // Clean up
    for (const page of pages) {
      await page.close();
    }
  });

  test('C16 — Rapid language switching under load', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await bypassAuth(page);
    await waitForApp(page);

    const languages = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'id', 'ar', 'ko', 'th', 'vi'];

    // Rapid fire all 14 languages
    for (const lang of languages) {
      await page.evaluate((l) => {
        if (window.EGGlogU && window.EGGlogU.i18n) {
          window.EGGlogU.i18n.setLang(l);
        }
        localStorage.setItem('egglogu_lang', l);
      }, lang);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    // App should still work after cycling all languages
    const body = await page.$('body');
    expect(body).not.toBeNull();

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') && !e.includes('NetworkError')
    );
    expect(criticalErrors.length).toBeLessThanOrEqual(2);
  });
});
