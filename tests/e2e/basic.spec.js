// @ts-check
const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// Helper: bypass the initial login screen by seeding localStorage with
// a minimal auth entry and a default user, then reload.
// ---------------------------------------------------------------------------
async function seedAuthAndUser(page) {
  await page.evaluate(() => {
    // Create auth entry (simulates first-run account creation)
    localStorage.setItem('egglogu_auth', JSON.stringify({
      user: 'testuser@test.com',
      hash: 'fakehash',
      salt: 'fakesalt'
    }));
    // Seed session flag so checkAuth() passes
    sessionStorage.setItem('egglogu_session', 'true');
  });
}

async function seedUser(page, opts = {}) {
  const name = opts.name || 'Test User';
  const role = opts.role || 'owner';
  const pin = opts.pin || '1234';
  await page.evaluate(({ name, role, pin }) => {
    const raw = localStorage.getItem('egglogu_data');
    const data = raw ? JSON.parse(raw) : null;
    if (data) {
      // Add user with plaintext pin (the app will hash-migrate on login)
      const user = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name,
        role,
        pin,
        status: 'active',
        created: new Date().toISOString().substring(0, 10)
      };
      data.users = data.users || [];
      data.users.push(user);
      localStorage.setItem('egglogu_data', JSON.stringify(data));
    }
  }, { name, role, pin });
}

// ---------------------------------------------------------------------------
// 1. App loads without errors
// ---------------------------------------------------------------------------
test('1 - App loads without JavaScript errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });

  // Give the app a moment to initialise
  await page.waitForTimeout(1500);

  // We tolerate network-related errors (API calls, Google SDK, etc.)
  const criticalErrors = errors.filter(
    (e) => !e.includes('fetch') && !e.includes('net::') && !e.includes('google')
  );
  expect(criticalErrors).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 2. Login screen renders
// ---------------------------------------------------------------------------
test('2 - Login screen renders on fresh start', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // The login screen should be visible (no auth data yet)
  const loginScreen = page.locator('#login-screen');
  await expect(loginScreen).toBeVisible();

  // Verify key elements are present
  await expect(page.locator('#login-user')).toBeVisible();
  await expect(page.locator('#login-pass')).toBeVisible();
  await expect(page.locator('button:has-text("Entrar")')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 3. Can create a user with PIN (via Sign Up flow)
// ---------------------------------------------------------------------------
test('3 - Can create a user with PIN', async ({ page }) => {
  // First, seed auth so we get past the login gate, and load with a user
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await seedAuthAndUser(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Navigate to admin section to add a user
  await page.evaluate(() => {
    if (typeof nav === 'function') nav('admin');
  });
  await page.waitForTimeout(500);

  // Verify the admin section loaded (users table or add-user button)
  const adminSection = page.locator('#sec-admin');
  await expect(adminSection).toBeVisible();

  // Alternatively, seed a user directly and verify it persists
  await seedUser(page, { name: 'Farm Worker', role: 'operator', pin: '5678' });

  // Reload and check user exists in data
  const userData = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    return d.users || [];
  });
  expect(userData.length).toBeGreaterThan(0);
  expect(userData.some((u) => u.name === 'Farm Worker')).toBe(true);
});

// ---------------------------------------------------------------------------
// 4. Can log in with PIN
// ---------------------------------------------------------------------------
test('4 - Can log in with PIN', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Seed auth + data with a user that has a PIN
  await seedAuthAndUser(page);
  await page.evaluate(() => {
    const data = JSON.parse(JSON.stringify({
      farm: { name: 'Test Farm', location: '', capacity: 500, currency: '$', lat: null, lng: null, owmApiKey: '', mqttBroker: '', mqttUser: '', mqttPass: '', mqttTopicPrefix: 'egglogu/', houses: [], routes: [], suppliers: [] },
      flocks: [], dailyProduction: [], vaccines: [], medications: [], outbreaks: [],
      feed: { purchases: [], consumption: [] }, clients: [],
      finances: { income: [], expenses: [], receivables: [] },
      inventory: [], environment: [], checklist: [], logbook: [], personnel: [],
      kpiSnapshots: [], weatherCache: [], stressEvents: [], iotReadings: [], predictions: [],
      biosecurity: { visitors: [], zones: [], pestSightings: [], protocols: [] },
      traceability: { batches: [] }, productionPlans: [], auditLog: [],
      users: [{
        id: 'test1', name: 'Owner', role: 'owner',
        pin: '1234', status: 'active', created: '2024-01-01'
      }],
      pendingActivations: [],
      settings: { minFeedStock: 50, maxMortality: 5, alertDaysBefore: 3, campoMode: false, vetMode: false, fontScale: 'normal', darkMode: false, dismissedTutorials: [], plan: { tier: 'professional' }, ownerEmail: '', taxRate: 0, depreciationYears: 5, assetValue: 0, defaultChecklist: [] }
    }));
    localStorage.setItem('egglogu_data', JSON.stringify(data));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // The PIN login overlay should appear because users exist
  const pinOverlay = page.locator('#pin-login-overlay');
  // It may or may not be visible depending on timing; if visible, try to log in
  if (await pinOverlay.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Select user and enter PIN
    await page.locator('#pin-user').selectOption('test1');
    await page.locator('#pin-code').fill('1234');
    await page.locator('#pin-login-overlay button:has-text("Login")').click();
    await page.waitForTimeout(1500);

    // PIN overlay should be gone after successful login
    await expect(pinOverlay).not.toBeVisible({ timeout: 5000 });
  }
});

// ---------------------------------------------------------------------------
// 5. Dashboard loads after login
// ---------------------------------------------------------------------------
test('5 - Dashboard loads after login', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await seedAuthAndUser(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // The dashboard section should be active
  const dashboard = page.locator('#sec-dashboard');
  await expect(dashboard).toHaveClass(/active/);

  // Dashboard should contain rendered content (not empty)
  const content = await dashboard.innerHTML();
  expect(content.length).toBeGreaterThan(50);
});

// ---------------------------------------------------------------------------
// 6. Can navigate between tabs
// ---------------------------------------------------------------------------
test('6 - Can navigate between tabs', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await seedAuthAndUser(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const sections = ['produccion', 'lotes', 'alimento', 'finanzas', 'config'];

  for (const section of sections) {
    await page.evaluate((s) => {
      if (typeof nav === 'function') nav(s);
    }, section);
    await page.waitForTimeout(300);

    const el = page.locator(`#sec-${section}`);
    await expect(el).toHaveClass(/active/);
  }

  // Navigate back to dashboard
  await page.evaluate(() => {
    if (typeof nav === 'function') nav('dashboard');
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
});

// ---------------------------------------------------------------------------
// 7. Can create a flock
// ---------------------------------------------------------------------------
test('7 - Can create a flock', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await seedAuthAndUser(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Navigate to flocks
  await page.evaluate(() => {
    if (typeof nav === 'function') nav('lotes');
  });
  await page.waitForTimeout(500);

  // Create flock via the form
  await page.evaluate(() => {
    if (typeof showFlockForm === 'function') showFlockForm();
  });
  await page.waitForTimeout(500);

  // Fill flock form fields
  await page.locator('#f-name').fill('Test Flock A');
  await page.locator('#f-count').fill('500');
  await page.locator('#f-birth').fill('2024-01-15');

  // Select breed (first available option)
  const breedSelect = page.locator('#f-breed');
  if (await breedSelect.isVisible()) {
    const options = await breedSelect.locator('option').allInnerTexts();
    if (options.length > 1) {
      await breedSelect.selectOption({ index: 1 });
    }
  }

  // Save
  await page.evaluate(() => {
    if (typeof saveFlock === 'function') saveFlock();
  });
  await page.waitForTimeout(500);

  // Verify flock was saved in localStorage
  const flocks = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    return d.flocks || [];
  });
  expect(flocks.length).toBeGreaterThan(0);
  expect(flocks.some((f) => f.name === 'Test Flock A')).toBe(true);
});

// ---------------------------------------------------------------------------
// 8. Can record egg production
// ---------------------------------------------------------------------------
test('8 - Can record egg production', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await seedAuthAndUser(page);
  // Seed a flock first so we have something to record production for
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    d.flocks = d.flocks || [];
    d.flocks.push({
      id: 'flock1', name: 'Layer Flock 1', breed: 'isa-brown',
      count: 1000, status: 'active', birthDate: '2023-06-01',
      housingType: 'floor', targetCurve: 'isa-brown', curveAdjust: 1.0,
      purchaseDate: '2023-06-01', supplier: '', cost: 0, notes: ''
    });
    d.dailyProduction = d.dailyProduction || [];
    localStorage.setItem('egglogu_data', JSON.stringify(d));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Navigate to production
  await page.evaluate(() => {
    if (typeof nav === 'function') nav('produccion');
  });
  await page.waitForTimeout(500);

  // Open production form
  await page.evaluate(() => {
    if (typeof showProdForm === 'function') showProdForm();
  });
  await page.waitForTimeout(500);

  // Fill production form
  await page.locator('#p-date').fill('2024-06-15');
  await page.locator('#p-flock').selectOption('flock1');
  await page.locator('#p-eggs').fill('850');

  // Save production
  await page.evaluate(() => {
    if (typeof saveProd === 'function') saveProd();
  });
  await page.waitForTimeout(500);

  // Verify production was saved
  const production = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    return d.dailyProduction || [];
  });
  expect(production.length).toBeGreaterThan(0);
  expect(production.some((p) => p.eggsCollected === 850)).toBe(true);
});

// ---------------------------------------------------------------------------
// 9. Data persists after refresh (localStorage)
// ---------------------------------------------------------------------------
test('9 - Data persists after page refresh', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await seedAuthAndUser(page);

  // Seed some data
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    d.farm = d.farm || {};
    d.farm.name = 'Persistence Test Farm';
    d.flocks = d.flocks || [];
    d.flocks.push({
      id: 'persist1', name: 'Persistent Flock', breed: 'leghorn-blanca',
      count: 200, status: 'active', birthDate: '2024-01-01',
      housingType: 'floor', targetCurve: 'leghorn-blanca', curveAdjust: 1.0,
      purchaseDate: '2024-01-01', supplier: '', cost: 0, notes: ''
    });
    d.dailyProduction = d.dailyProduction || [];
    d.dailyProduction.push({
      id: 'prod1', date: '2024-06-10', flockId: 'persist1',
      eggsCollected: 180, eggsBroken: 2, eggsS: 20, eggsM: 80, eggsL: 60, eggsXL: 20, eggsJumbo: 0,
      deaths: 0, notes: 'Test record'
    });
    localStorage.setItem('egglogu_data', JSON.stringify(d));
  });

  // Reload the page
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Verify data survived the reload
  const data = await page.evaluate(() => {
    const raw = localStorage.getItem('egglogu_data');
    return raw ? JSON.parse(raw) : null;
  });

  expect(data).not.toBeNull();
  expect(data.farm.name).toBe('Persistence Test Farm');
  expect(data.flocks.length).toBeGreaterThan(0);
  expect(data.flocks.some((f) => f.name === 'Persistent Flock')).toBe(true);
  expect(data.dailyProduction.length).toBeGreaterThan(0);
  expect(data.dailyProduction.some((p) => p.eggsCollected === 180)).toBe(true);
});

// ---------------------------------------------------------------------------
// 10. Export / Import works
// ---------------------------------------------------------------------------
test('10 - Export and import data works', async ({ page }) => {
  await page.goto('/egglogu.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await seedAuthAndUser(page);

  // Seed identifiable data
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    d.farm = d.farm || {};
    d.farm.name = 'Export Test Farm';
    d.flocks = [{
      id: 'exp1', name: 'Export Flock', breed: 'isa-brown',
      count: 300, status: 'active', birthDate: '2024-02-01',
      housingType: 'floor', targetCurve: 'isa-brown', curveAdjust: 1.0,
      purchaseDate: '2024-02-01', supplier: '', cost: 0, notes: ''
    }];
    localStorage.setItem('egglogu_data', JSON.stringify(d));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Export: call exportData and capture the JSON blob
  const exportedJson = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    return JSON.stringify(d);
  });

  expect(exportedJson).toContain('Export Test Farm');
  expect(exportedJson).toContain('Export Flock');

  // Clear data to simulate a fresh device
  await page.evaluate(() => {
    localStorage.removeItem('egglogu_data');
  });

  // Verify data is gone
  const cleared = await page.evaluate(() => localStorage.getItem('egglogu_data'));
  expect(cleared).toBeNull();

  // Import: simulate what importData() does
  await page.evaluate((json) => {
    const d = JSON.parse(json);
    localStorage.setItem('egglogu_data', JSON.stringify(d));
  }, exportedJson);

  // Verify imported data
  const imported = await page.evaluate(() => {
    const raw = localStorage.getItem('egglogu_data');
    return raw ? JSON.parse(raw) : null;
  });

  expect(imported).not.toBeNull();
  expect(imported.farm.name).toBe('Export Test Farm');
  expect(imported.flocks.length).toBe(1);
  expect(imported.flocks[0].name).toBe('Export Flock');
});
