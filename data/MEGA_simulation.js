#!/usr/bin/env node
// EGGlogU MEGA Simulation — 1,000 Clients, 28 Flocks, 365 Days
// Zero dependencies — Node.js only
// Output: /tmp/egglogu_MEGA_1000clients.json

const fs = require('fs');
const crypto = require('crypto');

// ============ CONFIG ============
const SIM_DAYS = 365;
const START_DATE = '2025-02-15';
const OUTPUT_FILE = '/tmp/egglogu_MEGA_1000clients.json';
const SEED = 42;

// Deterministic PRNG (xorshift128+)
let s0 = SEED, s1 = SEED * 7 + 13;
function rand() {
  let x = s0, y = s1;
  s0 = y;
  x ^= x << 23; x ^= x >> 17; x ^= y ^ (y >> 26);
  s1 = x;
  return ((x + y) >>> 0) / 4294967296;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max) { return min + rand() * (max - min); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function genId() { return crypto.randomBytes(4).toString('hex'); }
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().substring(0, 10);
}

// ============ CONSTANTS ============
const EGG_TYPES = ['S', 'M', 'L', 'XL', 'Jumbo'];
const EGG_DIST = { S: 0.10, M: 0.30, L: 0.35, XL: 0.18, Jumbo: 0.07 };
const CHANNELS = ['wholesale', 'retail', 'direct', 'organic', 'export'];
const CHANNEL_PRICES = {
  wholesale: [0.12, 0.15], retail: [0.18, 0.22],
  direct: [0.20, 0.28], organic: [0.30, 0.45], export: [0.25, 0.35]
};
const CHANNEL_DIST = { wholesale: 300, retail: 250, direct: 200, organic: 150, export: 100 };
const VET_CHANNEL_DIST = { wholesale: 180, retail: 150, direct: 120, organic: 90, export: 60 };
const NOVET_CHANNEL_DIST = { wholesale: 120, retail: 100, direct: 80, organic: 60, export: 40 };

const BREEDS = [
  'Hy-Line Brown', 'Hy-Line W-36', 'Lohmann Brown Classic', 'Lohmann LSL Classic',
  'ISA Brown', 'Bovans Brown', 'Novogen Brown', 'Dekalb White',
  'Tetra SL', 'H&N Nick Chick', 'Babcock B-300', 'Shaver 579'
];

// Generic breed curve (Hen-Day % by week, starting week 18)
const GENERIC_CURVE = [
  20, 40, 60, 75, 85, 90, 93, 95, 95, 96, // weeks 18-27
  95, 95, 94, 93, 92, 91, 90, 89, 88, 87, // weeks 28-37
  86, 85, 84, 83, 82, 81, 80, 79, 78, 77, // weeks 38-47
  76, 75, 74, 73, 72, 71, 70, 69, 68, 67, // weeks 48-57
  66, 65, 64, 63, 62, 61, 60, 59, 58, 57, // weeks 58-67
  56, 55, 54, 53, 52, 51, 50, 49, 48, 47, // weeks 68-77
  46, 45 // weeks 78-79
];

const EXPENSE_CATEGORIES = ['feed', 'vaccines', 'transport', 'labor', 'infrastructure', 'other'];
const DEATH_CAUSES = ['respiratory', 'heat_stress', 'predator', 'prolapse', 'unknown', 'egg_peritonitis', 'coccidiosis'];
const VENTILATION_LEVELS = ['natural', 'forced', 'tunnel', 'cross'];
const VACCINE_TYPES = ['Newcastle', 'Bronchitis', 'Gumboro', 'Marek', 'Avian Influenza', 'Salmonella', 'Egg Drop Syndrome', 'Mycoplasma'];

const LATAM_NAMES_FIRST = ['Juan', 'Carlos', 'Pedro', 'Maria', 'Ana', 'Luis', 'Jose', 'Diego', 'Sofia', 'Camila',
  'Miguel', 'Andres', 'Santiago', 'Valentina', 'Isabella', 'Fernando', 'Ricardo', 'Alejandro', 'Gabriela', 'Carmen',
  'Roberto', 'Eduardo', 'Sergio', 'Patricia', 'Rosa', 'Alberto', 'Oscar', 'Manuel', 'Claudia', 'Martha'];
const LATAM_NAMES_LAST = ['Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Hernandez', 'Perez', 'Sanchez',
  'Ramirez', 'Torres', 'Flores', 'Rivera', 'Gomez', 'Diaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Gutierrez', 'Chavez'];
const ROUTES = ['Norte', 'Sur', 'Este', 'Oeste', 'Centro', 'Rural A', 'Rural B', 'Urbano 1', 'Urbano 2', 'Periurbano'];
const CITIES = ['Lima', 'Bogota', 'Santiago', 'Quito', 'Medellin', 'Cusco', 'Arequipa', 'Guayaquil', 'Cali', 'Puebla'];
const FEED_TYPES = ['Ponedoras Fase 1', 'Ponedoras Fase 2', 'Concentrado Premium', 'Maiz molido', 'Pre-mezcla'];
const FEED_SUPPLIERS = ['Purina', 'Cargill', 'Nutrimentos SA', 'AgroFeed', 'FeedMax', 'NutriFarma'];

// ============ GENERATORS ============

function generateClients(count) {
  const clients = [];
  let vetCount = 0, novetCount = 0;
  const vetTotal = 600, novetTotal = 400;

  for (let i = 0; i < count; i++) {
    const isVet = vetCount < vetTotal && (novetCount >= novetTotal || rand() < 0.6);
    if (isVet) vetCount++; else novetCount++;

    // Assign channel based on VET/NOVET distribution
    let channel;
    const dist = isVet ? VET_CHANNEL_DIST : NOVET_CHANNEL_DIST;
    const distArr = Object.entries(dist);
    let cumul = 0, r = rand() * Object.values(dist).reduce((a, b) => a + b, 0);
    for (const [ch, cnt] of distArr) {
      cumul += cnt;
      if (r <= cumul) { channel = ch; break; }
    }
    if (!channel) channel = 'wholesale';

    const priceRange = CHANNEL_PRICES[channel];
    const basePrice = randFloat(priceRange[0], priceRange[1]);

    clients.push({
      id: genId(),
      name: pick(LATAM_NAMES_FIRST) + ' ' + pick(LATAM_NAMES_LAST),
      phone: '+' + randInt(50, 59) + randInt(1000000, 9999999),
      email: 'client' + (i + 1) + '@' + pick(['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com']),
      route: pick(ROUTES),
      address: randInt(100, 9999) + ' ' + pick(['Av. Principal', 'Calle Central', 'Jr. Libertad', 'Pasaje Sol', 'Blvd. Comercio']) + ', ' + pick(CITIES),
      priceS: Math.round(basePrice * 0.85 * 100) / 100,
      priceM: Math.round(basePrice * 100) / 100,
      priceL: Math.round(basePrice * 1.10 * 100) / 100,
      priceXL: Math.round(basePrice * 1.25 * 100) / 100,
      priceJumbo: Math.round(basePrice * 1.40 * 100) / 100,
      notes: isVet ? 'VET-controlled client' : 'NOVET client',
      marketChannel: channel,
      vetGroup: isVet
    });
  }
  return clients;
}

function generateFlocks(count) {
  const flocks = [];
  const vetFlocks = 18, novetFlocks = 10;

  for (let i = 0; i < count; i++) {
    const isVet = i < vetFlocks;
    const hens = isVet ? randInt(400, 800) : randInt(200, 600);
    const ageWeeks = randInt(20, 65); // Already in production
    const birthDate = addDays(START_DATE, -(ageWeeks * 7));
    const breed = pick(BREEDS);

    flocks.push({
      id: genId(),
      name: (isVet ? 'VET-' : 'NOVET-') + 'Flock-' + (i + 1),
      breed: breed,
      count: hens,
      birthDate: birthDate,
      status: ageWeeks >= 72 ? 'descarte' : 'produccion',
      source: pick(['hatchery', 'local', 'import']),
      cost: hens * randFloat(5, 8),
      targetCurve: 'generic',
      notes: isVet ? 'Veterinary controlled flock' : 'No vet oversight',
      vetGroup: isVet,
      curveAdjust: isVet ? randFloat(0.95, 1.10) : randFloat(0.70, 0.90)
    });
  }
  return flocks;
}

function generateUsers() {
  return [
    { id: genId(), name: 'Admin Granjero', role: 'owner', pin: '1234', created: START_DATE },
    { id: genId(), name: 'Maria Supervisora', role: 'manager', pin: '2345', created: START_DATE },
    { id: genId(), name: 'Carlos Gerente', role: 'manager', pin: '3456', created: START_DATE },
    { id: genId(), name: 'Pedro Galponero', role: 'worker', pin: '4567', created: START_DATE },
    { id: genId(), name: 'Ana Galponera', role: 'worker', pin: '5678', created: START_DATE },
    { id: genId(), name: 'Dr. Santiago Vet', role: 'vet', pin: '6789', created: START_DATE }
  ];
}

// ============ DAILY SIMULATION ============

function simulate(flocks, clients) {
  const dailyProduction = [];
  const inventory = [];
  const income = [];
  const expenses = [];
  const feedPurchases = [];
  const feedConsumption = [];
  const environment = [];
  const outbreaks = [];
  const vaccines = [];
  const medications = [];
  const biosecurity = { zones: [], visitors: [], disinfections: [] };
  const logbook = [];
  const checklist = [];
  const auditLog = [];
  const kpiSnapshots = [];
  const traceability = { batches: [], codes: [] };
  const personnel = [];
  const planning = [];
  const weatherCache = [];

  // Tracking state
  const flockState = {};
  flocks.forEach(f => {
    flockState[f.id] = {
      currentHens: f.count,
      totalDeaths: 0,
      lastOutbreakDay: -999,
      outbreakCount: 0,
      vaccineIdx: 0
    };
  });

  // Pre-generate vaccine schedule
  const vaccineSchedule = {};
  flocks.forEach(f => {
    const schedule = [];
    VACCINE_TYPES.forEach(vt => {
      const intervals = vt === 'Newcastle' || vt === 'Bronchitis' ? 60 : vt === 'Gumboro' ? 90 : 120;
      for (let d = randInt(5, 30); d < SIM_DAYS; d += intervals + randInt(-5, 5)) {
        const compliance = f.vetGroup ? 1.0 : randFloat(0.3, 0.5);
        if (rand() < compliance) {
          schedule.push({ day: d, type: vt });
        }
      }
    });
    vaccineSchedule[f.id] = schedule.sort((a, b) => a.day - b.day);
  });

  // Biosecurity zones
  biosecurity.zones = [
    { id: genId(), name: 'Galpon Principal', type: 'production', lastDisinfection: START_DATE, frequencyDays: 14, status: 'active' },
    { id: genId(), name: 'Almacen Alimento', type: 'storage', lastDisinfection: START_DATE, frequencyDays: 30, status: 'active' },
    { id: genId(), name: 'Area de Carga', type: 'loading', lastDisinfection: START_DATE, frequencyDays: 7, status: 'active' },
    { id: genId(), name: 'Cuarentena', type: 'quarantine', lastDisinfection: START_DATE, frequencyDays: 7, status: 'active' }
  ];

  // Personnel
  personnel.push(
    { id: genId(), name: 'Pedro Galponero', role: 'worker', phone: '+51987654321', startDate: addDays(START_DATE, -365), salary: 500, status: 'active' },
    { id: genId(), name: 'Ana Galponera', role: 'worker', phone: '+51987654322', startDate: addDays(START_DATE, -200), salary: 500, status: 'active' },
    { id: genId(), name: 'Luis Transportista', role: 'driver', phone: '+51987654323', startDate: addDays(START_DATE, -180), salary: 600, status: 'active' },
    { id: genId(), name: 'Dr. Santiago Vet', role: 'vet', phone: '+51987654324', startDate: addDays(START_DATE, -365), salary: 0, status: 'active' }
  );

  // Egg inventory tracking for daily distribution
  let eggStock = { S: 0, M: 0, L: 0, XL: 0, Jumbo: 0 };

  // ============ DAY-BY-DAY LOOP ============
  for (let day = 0; day < SIM_DAYS; day++) {
    const dateStr = addDays(START_DATE, day);
    const monthIdx = new Date(dateStr + 'T12:00:00Z').getMonth();
    const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Seasonal temperature wave (LATAM tropical/subtropical)
    const baseTemp = 22 + 6 * Math.sin((day / 365) * 2 * Math.PI - Math.PI / 2);
    const temp = baseTemp + randFloat(-3, 3);
    const humidity = 55 + 20 * Math.sin((day / 365) * 2 * Math.PI) + randFloat(-10, 10);

    // Environment reading (daily)
    environment.push({
      id: genId(),
      date: dateStr,
      temperature: Math.round(temp * 10) / 10,
      humidity: Math.round(Math.max(20, Math.min(95, humidity))),
      lightHours: randFloat(14, 16),
      ammoniaLevel: randFloat(5, 25),
      ventilation: pick(VENTILATION_LEVELS),
      notes: temp > 30 ? 'Heat stress conditions' : ''
    });

    // ---- PER-FLOCK SIMULATION ----
    let dailyTotalEggs = 0;
    let dailyEggsByType = { S: 0, M: 0, L: 0, XL: 0, Jumbo: 0 };

    flocks.forEach(f => {
      const st = flockState[f.id];
      if (f.status === 'descarte' || st.currentHens <= 0) return;

      // Calculate age in weeks
      const ageWeeks = Math.floor((new Date(dateStr + 'T12:00:00Z') - new Date(f.birthDate + 'T12:00:00Z')) / (7 * 24 * 3600 * 1000));
      const weekIdx = ageWeeks - 18;

      // Hen-Day % from breed curve
      let henDayPct = 0;
      if (weekIdx >= 0 && weekIdx < GENERIC_CURVE.length) {
        henDayPct = GENERIC_CURVE[weekIdx];
      } else if (weekIdx >= GENERIC_CURVE.length) {
        henDayPct = Math.max(30, GENERIC_CURVE[GENERIC_CURVE.length - 1] - (weekIdx - GENERIC_CURVE.length) * 1.5);
      }

      // Apply curveAdjust
      henDayPct *= f.curveAdjust;

      // VET vs NOVET peak adjustment
      if (!f.vetGroup) {
        henDayPct *= randFloat(0.80, 0.92); // NOVET produces 80-92% of standard
      }

      // Heat stress penalty
      if (temp > 30) henDayPct *= 0.90;
      if (temp > 35) henDayPct *= 0.80;

      // Recent outbreak penalty
      if (day - st.lastOutbreakDay < 14) henDayPct *= 0.70;

      // Daily production
      const eggs = Math.round(st.currentHens * (henDayPct / 100) * randFloat(0.95, 1.05));
      const broken = Math.round(eggs * randFloat(0.005, 0.02));

      // Size distribution
      const eggsS = Math.round(eggs * EGG_DIST.S * randFloat(0.8, 1.2));
      const eggsM = Math.round(eggs * EGG_DIST.M * randFloat(0.8, 1.2));
      const eggsL = Math.round(eggs * EGG_DIST.L * randFloat(0.8, 1.2));
      const eggsXL = Math.round(eggs * EGG_DIST.XL * randFloat(0.8, 1.2));
      const eggsJumbo = Math.max(0, eggs - eggsS - eggsM - eggsL - eggsXL);

      // Mortality
      let deaths = 0;
      const mortRate = f.vetGroup ? randFloat(0.0002, 0.0005) : randFloat(0.0007, 0.0017); // per day
      if (rand() < mortRate * st.currentHens) {
        deaths = Math.max(1, Math.round(st.currentHens * mortRate));
      }
      // Extra deaths during outbreaks
      if (day - st.lastOutbreakDay < 7 && !f.vetGroup) {
        deaths += randInt(0, 3);
      }
      st.currentHens = Math.max(0, st.currentHens - deaths);
      st.totalDeaths += deaths;

      const prodRecord = {
        id: genId(),
        flockId: f.id,
        date: dateStr,
        eggsCollected: Math.max(0, eggs - broken),
        eggsBroken: broken,
        eggsS, eggsM, eggsL, eggsXL, eggsJumbo,
        deaths,
        deathCause: deaths > 0 ? pick(DEATH_CAUSES) : '',
        eggType: 'conventional',
        marketChannel: 'wholesale',
        yolkScore: randInt(6, 9),
        shellColor: pick(['blanco', 'marron', 'crema']),
        notes: ''
      };
      dailyProduction.push(prodRecord);

      // Accumulate eggs by type for daily aggregate inventory (not per-flock)
      [{ k: 'eggsS', t: 'S' }, { k: 'eggsM', t: 'M' }, { k: 'eggsL', t: 'L' }, { k: 'eggsXL', t: 'XL' }, { k: 'eggsJumbo', t: 'Jumbo' }].forEach(s => {
        if (prodRecord[s.k] > 0) {
          dailyEggsByType[s.t] += prodRecord[s.k];
          eggStock[s.t] += prodRecord[s.k];
        }
      });

      dailyTotalEggs += Math.max(0, eggs - broken);

      // Feed consumption: weekly aggregate per flock (~120g/hen/day × 7)
      if (day % 7 === 0) {
        const feedPerHen = f.vetGroup ? randFloat(0.110, 0.125) : randFloat(0.115, 0.135); // kg/day
        const feedQty = Math.round(st.currentHens * feedPerHen * 7 * 10) / 10;
        feedConsumption.push({
          id: genId(), flockId: f.id, date: dateStr,
          quantityKg: feedQty, type: pick(FEED_TYPES)
        });
      }

      // Vaccine check
      const todayVax = vaccineSchedule[f.id]?.filter(v => v.day === day) || [];
      todayVax.forEach(v => {
        vaccines.push({
          id: genId(), flockId: f.id, name: v.type,
          dateApplied: dateStr, dateDue: addDays(dateStr, -randInt(0, 7)),
          status: 'applied', method: pick(['water', 'spray', 'injection', 'eye_drop']),
          coverage: f.vetGroup ? randFloat(95, 100) : randFloat(60, 85),
          notes: f.vetGroup ? 'VET supervised' : 'Self-administered'
        });
      });

      // Outbreaks (NOVET gets more)
      const outbreakChance = f.vetGroup ? 0.0008 : 0.005; // per day
      if (rand() < outbreakChance && day - st.lastOutbreakDay > 30) {
        st.lastOutbreakDay = day;
        st.outbreakCount++;
        const obDeaths = f.vetGroup ? randInt(0, 5) : randInt(5, 30);
        st.currentHens = Math.max(0, st.currentHens - obDeaths);
        st.totalDeaths += obDeaths;
        outbreaks.push({
          id: genId(), flockId: f.id, date: dateStr,
          disease: pick(['Newcastle', 'Coccidiosis', 'Bronchitis', 'Salmonella', 'Mycoplasma', 'Colibacillosis']),
          affectedCount: randInt(10, 100), deaths: obDeaths,
          status: f.vetGroup ? 'controlled' : 'active',
          treatment: f.vetGroup ? 'Immediate antibiotic + quarantine' : 'Delayed response',
          notes: f.vetGroup ? 'Outbreak controlled within 48h' : 'Outbreak spread due to delayed response'
        });
        // Medication for VET flocks
        if (f.vetGroup) {
          medications.push({
            id: genId(), flockId: f.id, name: pick(['Enrofloxacin', 'Tylosin', 'Amoxicillin', 'Sulfadimethoxine']),
            dateStart: dateStr, dateEnd: addDays(dateStr, randInt(5, 10)),
            dosage: randFloat(0.5, 2.0).toFixed(1) + ' ml/L', route: 'water',
            withdrawalDays: randInt(5, 14), notes: 'Prescribed by vet'
          });
        }
      }
    });

    // ---- DAILY AGGREGATE INVENTORY IN (by egg type, not per flock) ----
    EGG_TYPES.forEach(t => {
      if (dailyEggsByType[t] > 0) {
        inventory.push({ id: genId(), date: dateStr, flockId: '', eggType: t, qtyIn: dailyEggsByType[t], qtyOut: 0, source: 'production', ref: '' });
      }
    });

    // ---- SALES / INCOME ----
    // Distribute eggs across channels, ~3-15 sales per day
    if (dailyTotalEggs > 0 && !isWeekend) {
      const numSales = randInt(3, 15);
      const eggsPerSale = Math.floor(dailyTotalEggs / numSales);

      for (let s = 0; s < numSales && dailyTotalEggs > 0; s++) {
        const client = pick(clients);
        const channel = client.marketChannel || pick(CHANNELS);
        const eggType = pick(EGG_TYPES);
        const qty = Math.min(s === numSales - 1 ? dailyTotalEggs : randInt(Math.floor(eggsPerSale * 0.5), Math.ceil(eggsPerSale * 1.5)), dailyTotalEggs);
        dailyTotalEggs -= qty;

        // Price from channel
        const priceRange = CHANNEL_PRICES[channel];
        const unitPrice = Math.round(randFloat(priceRange[0], priceRange[1]) * 100) / 100;

        const incRecord = {
          id: genId(), date: dateStr, type: 'eggs',
          quantity: qty, unitPrice,
          eggType, marketChannel: channel,
          clientId: client.id, clientName: client.name,
          notes: ''
        };
        income.push(incRecord);

        // Inventory OUT
        inventory.push({
          id: genId(), date: dateStr, flockId: '', eggType,
          qtyIn: 0, qtyOut: qty, source: 'sale', ref: incRecord.id
        });
        if (eggStock[eggType] !== undefined) eggStock[eggType] = Math.max(0, eggStock[eggType] - qty);
      }
    }

    // Additional income: manure, birds (weekly)
    if (dayOfWeek === 3) {
      // Manure sales
      income.push({
        id: genId(), date: dateStr, type: 'manure',
        quantity: randInt(500, 2000), unitPrice: randFloat(0.01, 0.03),
        eggType: '', marketChannel: 'direct',
        clientId: pick(clients).id, notes: 'Weekly manure sale'
      });
    }
    if (day % 30 === 15 && rand() < 0.3) {
      // Bird sales (cull hens)
      income.push({
        id: genId(), date: dateStr, type: 'birds',
        quantity: randInt(10, 50), unitPrice: randFloat(2, 5),
        eggType: '', marketChannel: 'wholesale',
        clientId: pick(clients).id, notes: 'Cull hen sales'
      });
    }

    // ---- EXPENSES ----
    // Daily: labor (spread monthly)
    if (new Date(dateStr + 'T12:00:00Z').getDate() === 1) {
      // Monthly labor
      const numWorkers = randInt(2, 4);
      expenses.push({
        id: genId(), date: dateStr, category: 'labor',
        description: `Monthly labor - ${numWorkers} workers`,
        amount: numWorkers * randFloat(400, 600),
        notes: 'Monthly payroll'
      });
      // Monthly utilities
      expenses.push({
        id: genId(), date: dateStr, category: 'infrastructure',
        description: 'Electricity, water, maintenance',
        amount: randFloat(150, 300),
        notes: 'Monthly utilities'
      });
      // VET services (monthly)
      expenses.push({
        id: genId(), date: dateStr, category: 'vaccines',
        description: 'Veterinary services',
        amount: randFloat(200, 500),
        notes: 'Monthly vet contract (VET flocks)'
      });
      // Misc
      if (rand() < 0.5) {
        expenses.push({
          id: genId(), date: dateStr, category: 'other',
          description: pick(['Office supplies', 'Cleaning products', 'PPE equipment', 'Vehicle fuel']),
          amount: randFloat(50, 200), notes: ''
        });
      }
    }

    // Feed purchases (every 7-14 days)
    if (day % randInt(7, 14) === 0 || day === 0) {
      const fpQty = randFloat(500, 2000);
      feedPurchases.push({
        id: genId(), date: dateStr, type: pick(FEED_TYPES),
        quantityKg: Math.round(fpQty), cost: Math.round(fpQty * randFloat(0.35, 0.45)),
        supplier: pick(FEED_SUPPLIERS)
      });
    }

    // Transport expenses (2-3x per week)
    if (dayOfWeek === 1 || dayOfWeek === 4 || (dayOfWeek === 6 && rand() < 0.3)) {
      expenses.push({
        id: genId(), date: dateStr, category: 'transport',
        description: 'Egg delivery route',
        amount: randFloat(30, 80), notes: pick(ROUTES) + ' route'
      });
    }

    // ---- BIOSECURITY ----
    // Visitors (1-3 per week)
    if (rand() < 0.3) {
      biosecurity.visitors.push({
        id: genId(), date: dateStr,
        name: pick(LATAM_NAMES_FIRST) + ' ' + pick(LATAM_NAMES_LAST),
        company: pick(['AgroVet SA', 'Purina Rep', 'Gobierno SENASA', 'Comprador', 'Tecnico', 'Inspector']),
        purpose: pick(['inspection', 'delivery', 'purchase', 'maintenance', 'veterinary']),
        vehiclePlate: randInt(100, 999) + '-' + String.fromCharCode(65 + randInt(0, 25)) + String.fromCharCode(65 + randInt(0, 25)) + String.fromCharCode(65 + randInt(0, 25)),
        disinfected: rand() < 0.8,
        notes: ''
      });
    }

    // Disinfection (per zone schedule)
    biosecurity.zones.forEach(z => {
      const lastDisDay = Math.floor((new Date(dateStr + 'T12:00:00Z') - new Date(z.lastDisinfection + 'T12:00:00Z')) / (24 * 3600 * 1000));
      if (lastDisDay >= z.frequencyDays && rand() < 0.7) {
        biosecurity.disinfections.push({
          id: genId(), date: dateStr, zoneId: z.id, zoneName: z.name,
          product: pick(['Virkon S', 'Glutaraldehyde 2%', 'Quaternary ammonium', 'Chlorhexidine']),
          method: pick(['spray', 'foam', 'fumigation']),
          notes: ''
        });
        z.lastDisinfection = dateStr;
      }
    });

    // ---- DAILY CHECKLIST (weekly to save size) ----
    if (day % 7 === 0 && rand() < 0.9) {
      checklist.push({
        id: genId(), date: dateStr, shift: 'morning',
        items: [
          { task: 'Water check', done: true },
          { task: 'Feed check', done: true },
          { task: 'Egg collection', done: true },
          { task: 'Mortality count', done: true },
          { task: 'Temperature reading', done: rand() < 0.95 },
          { task: 'Ventilation check', done: rand() < 0.9 }
        ],
        user: pick(['Pedro Galponero', 'Ana Galponera']),
        notes: ''
      });
    }

    // ---- LOGBOOK ----
    if (rand() < 0.4) {
      logbook.push({
        id: genId(), date: dateStr,
        category: pick(['observation', 'incident', 'maintenance', 'weather', 'health']),
        title: pick(['Normal operation', 'Feed delivery noted', 'Ventilation adjusted', 'Hen behavior normal', 'Cleaning completed', 'Visitor registered']),
        description: pick(['All systems normal', 'Routine check completed', 'Minor adjustment needed', 'Weather conditions noted', 'Stock levels checked']),
        author: pick(['Pedro', 'Ana', 'Maria', 'Admin'])
      });
    }

    // ---- KPI SNAPSHOT (weekly) ----
    if (day % 7 === 0) {
      const totalHens = Object.values(flockState).reduce((s, st) => s + st.currentHens, 0);
      const last7Prod = dailyProduction.filter(p => p.date > addDays(dateStr, -7) && p.date <= dateStr);
      const last7Eggs = last7Prod.reduce((s, p) => s + (p.eggsCollected || 0), 0);
      const avgHenDay = totalHens > 0 ? ((last7Eggs / 7) / totalHens * 100) : 0;
      const last7Feed = feedConsumption.filter(c => c.date > addDays(dateStr, -7) && c.date <= dateStr);
      const totalFeedKg = last7Feed.reduce((s, c) => s + (c.quantityKg || 0), 0);
      const eggMassKg = last7Eggs * 0.06;
      const fcr = eggMassKg > 0 ? totalFeedKg / eggMassKg : 0;
      const totalDeaths = Object.values(flockState).reduce((s, st) => s + st.totalDeaths, 0);
      const totalOriginal = flocks.reduce((s, f) => s + f.count, 0);
      const mortality = totalOriginal > 0 ? (totalDeaths / totalOriginal * 100) : 0;
      const last7Inc = income.filter(i => i.date > addDays(dateStr, -7) && i.date <= dateStr);
      const last7Exp = expenses.filter(e => e.date > addDays(dateStr, -7) && e.date <= dateStr);
      const weekIncome = last7Inc.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
      const weekExpense = last7Exp.reduce((s, e) => s + (e.amount || 0), 0);
      const costPerEgg = last7Eggs > 0 ? weekExpense / last7Eggs : 0;

      kpiSnapshots.push({
        id: genId(), date: dateStr, activeHens: totalHens,
        henDay: Math.round(avgHenDay * 10) / 10,
        fcr: Math.round(fcr * 100) / 100,
        mortality: Math.round(mortality * 10) / 10,
        costPerEgg: Math.round(costPerEgg * 1000) / 1000,
        netIncome: Math.round((weekIncome - weekExpense) * 100) / 100,
        weeklyEggs: last7Eggs,
        weeklyIncome: Math.round(weekIncome * 100) / 100,
        weeklyExpense: Math.round(weekExpense * 100) / 100
      });
    }

    // Audit log (sample — major events only to keep size manageable)
    if (day % 3 === 0) {
      auditLog.push({
        ts: dateStr + 'T08:00:00.000Z', user: pick(['Admin Granjero', 'Maria Supervisora', 'Pedro Galponero']),
        action: 'create', module: 'production',
        detail: 'Daily production recorded for ' + dateStr, before: null, after: null
      });
    }
    if (income.length > 0 && day % 5 === 0) {
      auditLog.push({
        ts: dateStr + 'T10:00:00.000Z', user: pick(['Admin Granjero', 'Carlos Gerente']),
        action: 'create', module: 'income',
        detail: 'Sales recorded for ' + dateStr, before: null, after: null
      });
    }
  }

  // Generate additional audit log entries for variety
  ['flocks', 'clients', 'config', 'vaccines', 'expenses'].forEach(mod => {
    for (let i = 0; i < 50; i++) {
      const d = randInt(0, SIM_DAYS - 1);
      auditLog.push({
        ts: addDays(START_DATE, d) + 'T' + String(randInt(6, 20)).padStart(2, '0') + ':' + String(randInt(0, 59)).padStart(2, '0') + ':00.000Z',
        user: pick(['Admin Granjero', 'Maria Supervisora', 'Carlos Gerente', 'Dr. Santiago Vet']),
        action: pick(['create', 'update', 'delete']),
        module: mod,
        detail: pick(['Record created', 'Record updated', 'Record modified', 'Settings changed', 'Data imported']),
        before: null, after: null
      });
    }
  });

  // Sort audit log by timestamp
  auditLog.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

  return {
    dailyProduction, inventory, income, expenses,
    feedPurchases, feedConsumption, environment,
    outbreaks, vaccines, medications,
    biosecurity, logbook, checklist, auditLog,
    kpiSnapshots, traceability, personnel, planning, weatherCache
  };
}

// ============ ASSEMBLE DATA ============
function assembleData() {
  console.log('Generating 1,000 clients...');
  const clients = generateClients(1000);

  console.log('Generating 28 flocks...');
  const flocks = generateFlocks(28);

  console.log('Generating users...');
  const users = generateUsers();

  console.log(`Simulating ${SIM_DAYS} days...`);
  const sim = simulate(flocks, clients);

  console.log('Assembling final DATA object...');

  const DATA = {
    flocks,
    dailyProduction: sim.dailyProduction,
    vaccines: sim.vaccines,
    medications: sim.medications,
    outbreaks: sim.outbreaks,
    feed: {
      purchases: sim.feedPurchases,
      consumption: sim.feedConsumption
    },
    clients,
    finances: {
      income: sim.income,
      expenses: sim.expenses,
      receivables: []
    },
    environment: sim.environment,
    logbook: sim.logbook,
    settings: {
      minFeedStock: 100,
      maxMortality: 5,
      alertDaysBefore: 3,
      defaultChecklist: ['Water check', 'Feed check', 'Egg collection', 'Mortality count', 'Temperature reading', 'Ventilation check'],
      fontScale: 'normal',
      darkMode: false,
      campoMode: false,
      vetMode: false,
      taxRate: 15,
      depreciationYears: 7,
      assetValue: 50000
    },
    farm: {
      name: 'Granja Avicola Los Andes',
      location: 'Valle del Mantaro, Peru',
      capacity: 20000,
      currency: '$',
      lat: -12.06,
      lng: -75.21,
      owmApiKey: '',
      mqttBroker: '',
      mqttUser: '',
      mqttPass: '',
      mqttTopicPrefix: 'egglogu/'
    },
    kpiSnapshots: sim.kpiSnapshots,
    biosecurity: sim.biosecurity,
    traceability: sim.traceability,
    personnel: sim.personnel,
    planning: sim.planning,
    weatherCache: sim.weatherCache,
    checklist: sim.checklist,
    inventory: sim.inventory,
    auditLog: sim.auditLog,
    users
  };

  return DATA;
}

// ============ MAIN ============
console.log('=== EGGlogU MEGA Simulation ===');
console.log(`Start date: ${START_DATE}`);
console.log(`Duration: ${SIM_DAYS} days`);
console.log(`Target: 1,000 clients (600 VET / 400 NOVET)`);
console.log('');

const data = assembleData();

// Stats
console.log('\n=== Simulation Stats ===');
console.log(`Flocks: ${data.flocks.length} (${data.flocks.filter(f => f.vetGroup).length} VET / ${data.flocks.filter(f => !f.vetGroup).length} NOVET)`);
console.log(`Clients: ${data.clients.length} (${data.clients.filter(c => c.vetGroup).length} VET / ${data.clients.filter(c => !c.vetGroup).length} NOVET)`);
console.log(`Users: ${data.users.length}`);
console.log(`Total hens (initial): ${data.flocks.reduce((s, f) => s + f.count, 0)}`);
console.log(`Production records: ${data.dailyProduction.length}`);
console.log(`Income records: ${data.finances.income.length}`);
console.log(`Expense records: ${data.finances.expenses.length}`);
console.log(`Feed purchases: ${data.feed.purchases.length}`);
console.log(`Feed consumption: ${data.feed.consumption.length}`);
console.log(`Inventory records: ${data.inventory.length}`);
console.log(`Vaccine records: ${data.vaccines.length}`);
console.log(`Outbreak records: ${data.outbreaks.length}`);
console.log(`Medication records: ${data.medications.length}`);
console.log(`Environment records: ${data.environment.length}`);
console.log(`Biosecurity visitors: ${data.biosecurity.visitors.length}`);
console.log(`Logbook entries: ${data.logbook.length}`);
console.log(`KPI snapshots: ${data.kpiSnapshots.length}`);
console.log(`Audit log entries: ${data.auditLog.length}`);
console.log(`Personnel: ${data.personnel.length}`);

// Financial summary
const totalIncome = data.finances.income.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
const totalExpenses = data.finances.expenses.reduce((s, e) => s + (e.amount || 0), 0);
const totalFeedCost = data.feed.purchases.reduce((s, p) => s + (p.cost || 0), 0);
console.log(`\n=== Financial Summary ===`);
console.log(`Total Income: $${totalIncome.toFixed(2)}`);
console.log(`Total Expenses: $${totalExpenses.toFixed(2)}`);
console.log(`Total Feed Cost: $${totalFeedCost.toFixed(2)}`);
console.log(`Net (before feed): $${(totalIncome - totalExpenses).toFixed(2)}`);
console.log(`Net (after feed): $${(totalIncome - totalExpenses - totalFeedCost).toFixed(2)}`);

// VET vs NOVET comparison
const vetFlockIds = new Set(data.flocks.filter(f => f.vetGroup).map(f => f.id));
const novetFlockIds = new Set(data.flocks.filter(f => !f.vetGroup).map(f => f.id));
const vetEggs = data.dailyProduction.filter(p => vetFlockIds.has(p.flockId)).reduce((s, p) => s + (p.eggsCollected || 0), 0);
const novetEggs = data.dailyProduction.filter(p => novetFlockIds.has(p.flockId)).reduce((s, p) => s + (p.eggsCollected || 0), 0);
const vetDeaths = data.dailyProduction.filter(p => vetFlockIds.has(p.flockId)).reduce((s, p) => s + (p.deaths || 0), 0);
const novetDeaths = data.dailyProduction.filter(p => novetFlockIds.has(p.flockId)).reduce((s, p) => s + (p.deaths || 0), 0);
const vetOutbreaks = data.outbreaks.filter(o => vetFlockIds.has(o.flockId)).length;
const novetOutbreaks = data.outbreaks.filter(o => novetFlockIds.has(o.flockId)).length;

console.log(`\n=== VET vs NOVET ===`);
console.log(`VET: ${vetEggs} eggs, ${vetDeaths} deaths, ${vetOutbreaks} outbreaks`);
console.log(`NOVET: ${novetEggs} eggs, ${novetDeaths} deaths, ${novetOutbreaks} outbreaks`);

// Write output
const json = JSON.stringify(data);
fs.writeFileSync(OUTPUT_FILE, json);
const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
console.log(`\n=== Output ===`);
console.log(`File: ${OUTPUT_FILE}`);
console.log(`Size: ${sizeMB} MB`);
console.log(`Total records: ${data.dailyProduction.length + data.finances.income.length + data.finances.expenses.length + data.inventory.length + data.vaccines.length + data.feed.consumption.length + data.auditLog.length + data.environment.length}`);
console.log('\nDone! Import this file into EGGlogU via Config > Import.');
