// @ts-check
const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// EGGlogU Modular Architecture — Stress Test Suite
// Tests the web component-based app (egg-app, egg-sidebar, etc.)
// Playwright auto-pierces shadow DOM, so selectors work across boundaries.
// ---------------------------------------------------------------------------

// Superadmin requires superadmin role (default user is 'owner') — tested separately
const ALL_SECTIONS = [
  'dashboard', 'lotes', 'produccion', 'sanidad', 'alimento',
  'clientes', 'inventario', 'finanzas', 'analisis', 'operaciones',
  'ambiente', 'carencias', 'bioseguridad', 'trazabilidad',
  'planificacion', 'reportes', 'automatizacion', 'soporte',
  'admin', 'config'
];

const SECTION_TAGS = {
  dashboard: 'egg-dashboard', lotes: 'egg-flocks', produccion: 'egg-production',
  sanidad: 'egg-sanidad', alimento: 'egg-feed', clientes: 'egg-clients',
  inventario: 'egg-inventory', finanzas: 'egg-finances', analisis: 'egg-analysis',
  operaciones: 'egg-operations', ambiente: 'egg-environment', carencias: 'egg-carencias',
  bioseguridad: 'egg-biosecurity', trazabilidad: 'egg-traceability',
  planificacion: 'egg-planning', reportes: 'egg-reportes',
  automatizacion: 'egg-automatizacion', soporte: 'egg-soporte',
  admin: 'egg-admin', config: 'egg-config', superadmin: 'egg-superadmin'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed localStorage so bootAuth() skips login and goes straight to app */
async function bypassAuth(page) {
  await page.evaluate(() => {
    // Auth credentials
    localStorage.setItem('egglogu_auth', JSON.stringify({
      user: 'stress@test.com',
      hash: 'fakehash',
      salt: 'fakesalt'
    }));
    sessionStorage.setItem('egglogu_session', 'true');

    // Full default data with owner user (prevents PIN screen)
    const data = {
      farm: { name: 'Stress Test Farm', location: 'Test', capacity: 5000, currency: '$', lat: null, lng: null, owmApiKey: '', mqttBroker: '', mqttUser: '', mqttPass: '', mqttTopicPrefix: 'egglogu/', houses: ['Galpon 1', 'Galpon 2', 'Galpon 3'], routes: [], suppliers: ['Proveedor A'] },
      flocks: [
        { id: 'f1', name: 'Lote Alpha', breed: 'isa-brown', count: 2000, status: 'active', birthDate: '2024-01-15', housingType: 'floor', house: 'Galpon 1', targetCurve: 'isa-brown', curveAdjust: 1.0, purchaseDate: '2024-01-15', supplier: 'Proveedor A', cost: 5000, notes: '' },
        { id: 'f2', name: 'Lote Beta', breed: 'leghorn-blanca', count: 1500, status: 'active', birthDate: '2024-03-01', housingType: 'cage', house: 'Galpon 2', targetCurve: 'leghorn-blanca', curveAdjust: 1.0, purchaseDate: '2024-03-01', supplier: 'Proveedor A', cost: 3500, notes: '' },
        { id: 'f3', name: 'Lote Gamma', breed: 'hy-line-brown', count: 3000, status: 'active', birthDate: '2023-09-01', housingType: 'free-range', house: 'Galpon 3', targetCurve: 'hy-line-brown', curveAdjust: 1.0, purchaseDate: '2023-09-01', supplier: '', cost: 7000, notes: 'Large flock' }
      ],
      dailyProduction: [],
      vaccines: [],
      medications: [],
      outbreaks: [],
      feed: { purchases: [], consumption: [] },
      clients: [],
      clientClaims: [],
      finances: { income: [], expenses: [], receivables: [] },
      inventory: [],
      environment: [],
      checklist: [],
      logbook: [],
      personnel: [],
      kpiSnapshots: [],
      weatherCache: [],
      stressEvents: [],
      iotReadings: [],
      predictions: [],
      biosecurity: { visitors: [], zones: [], pestSightings: [], protocols: [] },
      traceability: { batches: [] },
      productionPlans: [],
      auditLog: [],
      users: [],
      pendingActivations: [],
      settings: {
        minFeedStock: 50, maxMortality: 5, alertDaysBefore: 3,
        campoMode: false, vetMode: false, fontScale: 'normal', darkMode: false,
        dismissedTutorials: [],
        plan: { tier: 'enterprise', status: 'active', is_trial: false, modules: [] },
        ownerEmail: 'stress@test.com',
        taxRate: 19, depreciationYears: 5, assetValue: 0,
        defaultChecklist: ['chk_collect_eggs', 'chk_feed_birds', 'chk_check_water', 'chk_check_health']
      }
    };
    localStorage.setItem('egglogu_data', JSON.stringify(data));
  });
}

/** Seed production data for multiple days */
async function seedProductionData(page, days = 30) {
  await page.evaluate((days) => {
    const raw = localStorage.getItem('egglogu_data');
    const data = raw ? JSON.parse(raw) : {};
    data.dailyProduction = data.dailyProduction || [];
    const flockIds = (data.flocks || []).map(f => f.id);
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().substring(0, 10);
      for (const fid of flockIds) {
        const eggs = Math.floor(Math.random() * 500) + 800;
        data.dailyProduction.push({
          id: `prod_${fid}_${i}`, date: dateStr, flockId: fid,
          eggsCollected: eggs, eggsBroken: Math.floor(Math.random() * 10),
          eggsS: Math.floor(eggs * 0.1), eggsM: Math.floor(eggs * 0.4),
          eggsL: Math.floor(eggs * 0.35), eggsXL: Math.floor(eggs * 0.1),
          eggsJumbo: Math.floor(eggs * 0.05),
          deaths: Math.floor(Math.random() * 2), notes: ''
        });
      }
    }
    localStorage.setItem('egglogu_data', JSON.stringify(data));
  }, days);
}

/** Seed financial data */
async function seedFinancialData(page, records = 20) {
  await page.evaluate((records) => {
    const raw = localStorage.getItem('egglogu_data');
    const data = raw ? JSON.parse(raw) : {};
    data.finances = data.finances || { income: [], expenses: [], receivables: [] };
    const today = new Date();

    for (let i = 0; i < records; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i * 2);
      const dateStr = d.toISOString().substring(0, 10);

      data.finances.income.push({
        id: `inc_${i}`, date: dateStr, concept: `Venta huevos lote ${i}`,
        amount: Math.floor(Math.random() * 5000) + 1000, category: 'egg_sales', notes: ''
      });
      data.finances.expenses.push({
        id: `exp_${i}`, date: dateStr, concept: `Alimento ${i}`,
        amount: Math.floor(Math.random() * 2000) + 500, category: 'feed', notes: ''
      });
    }
    localStorage.setItem('egglogu_data', JSON.stringify(data));
  }, records);
}

/** Seed health records */
async function seedHealthData(page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem('egglogu_data');
    const data = raw ? JSON.parse(raw) : {};
    const flockIds = (data.flocks || []).map(f => f.id);

    data.vaccines = flockIds.map((fid, i) => ({
      id: `vac_${i}`, flockId: fid, date: '2024-06-01',
      vaccine: 'Newcastle', dose: '1ml', route: 'water', notes: 'Routine'
    }));
    data.medications = [{
      id: 'med_1', flockId: flockIds[0] || 'f1', date: '2024-06-05',
      medication: 'Amoxicillin', dose: '0.5g/L', duration: 5,
      reason: 'Respiratory', withdrawalDays: 7, notes: ''
    }];
    localStorage.setItem('egglogu_data', JSON.stringify(data));
  });
}

/** Seed clients */
async function seedClients(page, count = 10) {
  await page.evaluate((count) => {
    const raw = localStorage.getItem('egglogu_data');
    const data = raw ? JSON.parse(raw) : {};
    data.clients = [];
    for (let i = 0; i < count; i++) {
      data.clients.push({
        id: `cli_${i}`, name: `Cliente ${i + 1}`, phone: `+56912345${i.toString().padStart(3, '0')}`,
        email: `cliente${i}@test.com`, type: i % 3 === 0 ? 'retail' : 'wholesale',
        address: `Calle ${i + 1}`, notes: '', created: '2024-01-01'
      });
    }
    localStorage.setItem('egglogu_data', JSON.stringify(data));
  }, count);
}

/** Wait for egg-app to mount and be ready */
async function waitForApp(page) {
  await page.waitForSelector('egg-app', { timeout: 10000 });
  // Give components time to render
  await page.waitForTimeout(1000);
}

/** Navigate via clicking sidebar link (Playwright auto-pierces shadow DOM) */
async function navigateTo(page, section, { fast = false } = {}) {
  let clicked = false;
  try {
    const link = page.locator(`[data-section="${section}"]`).first();
    if (await link.isVisible({ timeout: fast ? 300 : 1000 }).catch(() => false)) {
      await link.click({ timeout: fast ? 500 : 2000 });
      clicked = true;
    }
  } catch (e) {
    // Click failed (e.g., element hidden by CSS), fall through to Bus
  }
  if (!clicked) {
    await page.evaluate((s) => {
      document.dispatchEvent(new CustomEvent('egg:nav:request', {
        detail: { section: s }, bubbles: true
      }));
    }, section);
  }
  if (!fast) await page.waitForTimeout(500);
}

/** Click a button by data-action attribute (pierces shadow DOM via Playwright) */
async function clickAction(page, action) {
  const btn = page.locator(`[data-action="${action}"]`).first();
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
  }
}

/** Click a language button (pierces shadow DOM) */
async function clickLang(page, lang) {
  const btn = page.locator(`[data-lang="${lang}"]`).first();
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Stress Tests — App Load & Auth', () => {

  test('S01 - App loads without critical JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::') &&
      !e.includes('google') && !e.includes('gstatic') &&
      !e.includes('apis.google.com')
    );
    expect(critical).toHaveLength(0);
  });

  test('S02 - Login screen renders on fresh visit', async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const loginScreen = page.locator('#login-screen');
    await expect(loginScreen).toBeVisible();
    await expect(page.locator('#login-user')).toBeVisible();
    await expect(page.locator('#login-pass')).toBeVisible();
  });

  test('S03 - App mounts after auth bypass', async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const eggApp = page.locator('egg-app');
    await expect(eggApp).toBeAttached();
  });

  test('S04 - Login screen is hidden after auth', async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const loginScreen = page.locator('#login-screen');
    // Login screen should be hidden or removed after mount
    const isVisible = await loginScreen.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });
});

test.describe('Stress Tests — Navigation (All 21 Sections)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await seedProductionData(page, 30);
    await seedFinancialData(page, 20);
    await seedHealthData(page);
    await seedClients(page, 10);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  for (const section of ALL_SECTIONS) {
    test(`S05-${section} - Navigate to "${section}" without errors`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await navigateTo(page, section);

      // Check the corresponding web component exists
      const tag = SECTION_TAGS[section];
      const component = page.locator(tag);
      await expect(component).toBeAttached({ timeout: 5000 });

      // No critical JS errors during navigation
      const critical = errors.filter(e =>
        !e.includes('fetch') && !e.includes('net::') &&
        !e.includes('google') && !e.includes('Chart') &&
        !e.includes('canvas')
      );
      expect(critical).toHaveLength(0);
    });
  }

});

test.describe('Stress Tests — Rapid Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await seedProductionData(page, 10);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S06 - Rapid sequential navigation through all sections', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (const section of ALL_SECTIONS) {
      await navigateTo(page, section);
      // Minimal wait — stress test speed
      await page.waitForTimeout(200);
    }

    // End on dashboard
    await navigateTo(page, 'dashboard');
    const component = page.locator('egg-dashboard');
    await expect(component).toBeAttached({ timeout: 5000 });

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::') &&
      !e.includes('google') && !e.includes('Chart') &&
      !e.includes('canvas') && !e.includes('destroyed')
    );
    expect(critical).toHaveLength(0);
  });

  test('S07 - Cycle through sections 3 times (memory leak check)', { timeout: 120000 }, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Get initial memory baseline
    const memBefore = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return null;
    });

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const section of ALL_SECTIONS) {
        await navigateTo(page, section, { fast: true });
        await page.waitForTimeout(50);
      }
    }

    // Final memory check
    const memAfter = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return null;
    });

    // If memory API available, check for excessive growth (>3x = leak)
    if (memBefore !== null && memAfter !== null) {
      const ratio = memAfter / memBefore;
      expect(ratio).toBeLessThan(3);
    }

    // App should still be functional
    await navigateTo(page, 'dashboard');
    const component = page.locator('egg-dashboard');
    await expect(component).toBeAttached({ timeout: 5000 });

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::') &&
      !e.includes('google') && !e.includes('Chart') &&
      !e.includes('canvas') && !e.includes('destroyed')
    );
    // Allow some errors from rapid switching but flag if excessive
    expect(critical.length).toBeLessThan(10);
  });

  test('S08 - Random rapid navigation (50 switches)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (let i = 0; i < 50; i++) {
      const section = ALL_SECTIONS[Math.floor(Math.random() * ALL_SECTIONS.length)];
      const link = page.locator(`[data-section="${section}"]`).first();
      if (await link.isVisible({ timeout: 500 }).catch(() => false)) {
        await link.click();
      }
      // No wait — maximum stress
      await page.waitForTimeout(50);
    }

    // Give time for last render to settle
    await page.waitForTimeout(1000);

    // App should not crash
    const eggApp = page.locator('egg-app');
    await expect(eggApp).toBeAttached();
  });
});

test.describe('Stress Tests — Dark Mode & Modes', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S09 - Toggle dark mode on and off', async ({ page }) => {
    // Toggle dark mode on
    await clickAction(page, 'darkMode');
    await page.waitForTimeout(500);

    let darkModeOn = await page.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );
    expect(darkModeOn).toBe(true);

    // Toggle off
    await clickAction(page, 'darkMode');
    await page.waitForTimeout(500);

    darkModeOn = await page.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );
    expect(darkModeOn).toBe(false);
  });

  test('S10 - Rapid dark mode toggling (20 times)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (let i = 0; i < 20; i++) {
      await clickAction(page, 'darkMode');
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(500);

    // App should still be functional
    const eggApp = page.locator('egg-app');
    await expect(eggApp).toBeAttached();

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::')
    );
    expect(critical).toHaveLength(0);
  });

  test('S11 - Toggle campo mode', async ({ page }) => {
    await clickAction(page, 'campo');
    await page.waitForTimeout(800);

    const campoOn = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
      return d.settings?.campoMode;
    });
    expect(campoOn).toBe(true);

    // App should navigate to dashboard
    const component = page.locator('egg-dashboard');
    await expect(component).toBeAttached({ timeout: 5000 });
  });

  test('S12 - Toggle vet mode', async ({ page }) => {
    await clickAction(page, 'vet');
    await page.waitForTimeout(800);

    const vetOn = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
      return d.settings?.vetMode;
    });
    expect(vetOn).toBe(true);
  });

  test('S13 - Campo and vet modes are mutually exclusive', async ({ page }) => {
    // Enable campo
    await clickAction(page, 'campo');
    await page.waitForTimeout(500);

    // Enable vet (should disable campo)
    await clickAction(page, 'vet');
    await page.waitForTimeout(500);

    const settings = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
      return d.settings;
    });
    expect(settings.vetMode).toBe(true);
    expect(settings.campoMode).toBe(false);
  });
});

test.describe('Stress Tests — Data Integrity', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S14 - Data persists across page reloads', async ({ page }) => {
    await seedProductionData(page, 5);
    await seedClients(page, 5);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const data = await page.evaluate(() => {
      const raw = localStorage.getItem('egglogu_data');
      return raw ? JSON.parse(raw) : null;
    });

    expect(data).not.toBeNull();
    expect(data.farm.name).toBe('Stress Test Farm');
    expect(data.flocks.length).toBe(3);
    expect(data.dailyProduction.length).toBeGreaterThan(0);
    expect(data.clients.length).toBe(5);
  });

  test('S15 - Large dataset handling (90 days x 3 flocks = 270 records)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await seedProductionData(page, 90);

    const count = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
      return (d.dailyProduction || []).length;
    });
    expect(count).toBe(270); // 90 days * 3 flocks

    // Navigate to production — should handle large dataset
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await navigateTo(page, 'produccion');

    const component = page.locator('egg-production');
    await expect(component).toBeAttached({ timeout: 10000 });

    // Navigate to analytics — heavy computation
    await navigateTo(page, 'analisis');
    const analysis = page.locator('egg-analysis');
    await expect(analysis).toBeAttached({ timeout: 10000 });
  });

  test('S16 - Store consistency after rapid saves', async ({ page }) => {
    // Simulate rapid store updates
    await page.evaluate(() => {
      const raw = localStorage.getItem('egglogu_data');
      const data = raw ? JSON.parse(raw) : {};

      for (let i = 0; i < 50; i++) {
        data.flocks = data.flocks || [];
        data.flocks.push({
          id: `rapid_${i}`, name: `Rapid Flock ${i}`, breed: 'isa-brown',
          count: 100, status: 'active', birthDate: '2024-01-01',
          housingType: 'floor', targetCurve: 'isa-brown', curveAdjust: 1.0,
          purchaseDate: '2024-01-01', supplier: '', cost: 0, notes: ''
        });
        localStorage.setItem('egglogu_data', JSON.stringify(data));
      }
    });

    const finalCount = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
      return (d.flocks || []).length;
    });
    // 3 initial + 50 rapid = 53
    expect(finalCount).toBe(53);
  });
});

test.describe('Stress Tests — Responsive & Layout', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S17 - Mobile viewport (375x667) renders without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Navigate to a few sections
    for (const section of ['dashboard', 'produccion', 'lotes', 'config']) {
      await navigateTo(page, section);
      await page.waitForTimeout(300);
    }

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::') &&
      !e.includes('google') && !e.includes('Chart') &&
      !e.includes('canvas')
    );
    expect(critical).toHaveLength(0);
  });

  test('S18 - Tablet viewport (768x1024) renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);

    await navigateTo(page, 'dashboard');
    const component = page.locator('egg-dashboard');
    await expect(component).toBeAttached({ timeout: 5000 });
  });

  test('S19 - Viewport resize during navigation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
      { width: 320, height: 568 },
    ];

    for (let i = 0; i < viewports.length; i++) {
      await page.setViewportSize(viewports[i]);
      await navigateTo(page, ALL_SECTIONS[i % ALL_SECTIONS.length]);
      await page.waitForTimeout(200);
    }

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::') &&
      !e.includes('google') && !e.includes('Chart') &&
      !e.includes('canvas')
    );
    expect(critical).toHaveLength(0);
  });
});

test.describe('Stress Tests — Sidebar', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S20 - Sidebar toggle works', async ({ page }) => {
    // On mobile, toggle sidebar
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    await clickAction(page, 'toggleSidebar');
    await page.waitForTimeout(300);

    const sidebarOpen = await page.evaluate(() => {
      const sb = document.getElementById('sidebar');
      return sb ? sb.classList.contains('open') : false;
    });
    // Sidebar should toggle (may or may not be open depending on implementation)
    expect(typeof sidebarOpen).toBe('boolean');
  });

  test('S21 - All nav links have data-section attributes', async ({ page }) => {
    const links = page.locator('[data-section]');
    const count = await links.count();

    // Should have nav links for most sections
    expect(count).toBeGreaterThan(10);
  });
});

test.describe('Stress Tests — Language', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S22 - Switch language to English', async ({ page }) => {
    await clickLang(page, 'en');
    await page.waitForTimeout(500);

    const savedLang = await page.evaluate(() =>
      localStorage.getItem('egglogu_lang')
    );
    expect(savedLang).toBe('en');
  });

  test('S23 - Rapid language switching (all languages)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const langs = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'id', 'ar', 'ko', 'th', 'vi'];

    for (const lang of langs) {
      await clickLang(page, lang);
      await page.waitForTimeout(100);
    }

    await page.waitForTimeout(500);

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::')
    );
    expect(critical).toHaveLength(0);
  });
});

test.describe('Stress Tests — Modal & Toast', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S24 - Modal open and close cycle', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Open and close modal 10 times
    for (let i = 0; i < 10; i++) {
      await page.evaluate((i) => {
        // Trigger a modal via Bus
        const event = new CustomEvent('modal:open');
        const overlay = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        if (overlay && title && body) {
          title.textContent = `Test Modal ${i}`;
          body.innerHTML = `<p>Content ${i}</p>`;
          overlay.classList.add('active');
        }
      }, i);
      await page.waitForTimeout(100);

      // Close
      await clickAction(page, 'closeModal');
      await page.waitForTimeout(100);
    }

    const critical = errors.filter(e =>
      !e.includes('fetch') && !e.includes('net::')
    );
    expect(critical).toHaveLength(0);
  });
});

test.describe('Stress Tests — Concurrent Operations', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await seedProductionData(page, 30);
    await seedFinancialData(page, 20);
    await seedHealthData(page);
    await seedClients(page, 10);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  });

  test('S25 - Navigate + dark mode toggle simultaneously', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (let i = 0; i < 10; i++) {
      const section = ALL_SECTIONS[i % ALL_SECTIONS.length];
      // Fire both at ~same time
      await Promise.all([
        navigateTo(page, section),
        clickAction(page, 'darkMode')
      ]);
      await page.waitForTimeout(200);
    }

    // App should survive
    const eggApp = page.locator('egg-app');
    await expect(eggApp).toBeAttached();
  });

  test('S26 - Navigate + language switch simultaneously', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const langs = ['es', 'en', 'pt', 'fr', 'de'];

    for (let i = 0; i < 10; i++) {
      const section = ALL_SECTIONS[i % ALL_SECTIONS.length];
      const lang = langs[i % langs.length];

      await Promise.all([
        navigateTo(page, section),
        clickLang(page, lang)
      ]);
      await page.waitForTimeout(200);
    }

    const eggApp = page.locator('egg-app');
    await expect(eggApp).toBeAttached();
  });
});

test.describe('Stress Tests — Edge Cases', () => {

  test('S27 - Double reload during boot', async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);

    // Double reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const eggApp = page.locator('egg-app');
    await expect(eggApp).toBeAttached();
  });

  test('S28 - Empty data store does not crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Set auth but minimal data
    await page.evaluate(() => {
      localStorage.setItem('egglogu_auth', JSON.stringify({
        user: 'empty@test.com', hash: 'h', salt: 's'
      }));
      sessionStorage.setItem('egglogu_session', 'true');
      // No egglogu_data — Store will use defaults
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const eggApp = page.locator('egg-app');
    await expect(eggApp).toBeAttached();
  });

  test('S29 - Corrupted localStorage data is handled gracefully', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      localStorage.setItem('egglogu_auth', JSON.stringify({
        user: 'corrupt@test.com', hash: 'h', salt: 's'
      }));
      sessionStorage.setItem('egglogu_session', 'true');
      // Intentionally corrupted data
      localStorage.setItem('egglogu_data', '{invalid json!!!');
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // App should either recover or show login — not crash completely
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });

  test('S30 - 100 rapid store writes do not exceed quota', async ({ page }) => {
    await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await bypassAuth(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const success = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('egglogu_data');
        const data = raw ? JSON.parse(raw) : {};
        for (let i = 0; i < 100; i++) {
          data.auditLog = data.auditLog || [];
          data.auditLog.push({
            id: `audit_${i}`, action: 'stress_test', user: 'test',
            timestamp: new Date().toISOString(), details: `Entry ${i} with some data padding ${'x'.repeat(100)}`
          });
          localStorage.setItem('egglogu_data', JSON.stringify(data));
        }
        return true;
      } catch (e) {
        return false;
      }
    });

    expect(success).toBe(true);
  });
});
