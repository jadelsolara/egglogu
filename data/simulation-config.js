#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// EGGlogU — Simulation Config & Learning Engine
// Extends MEGA_simulation.js with configurable scenarios
// that learn from test results and real usage patterns
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// ============ SCENARIO PRESETS ============
const SCENARIOS = {

  // Default full simulation
  standard: {
    name: 'Standard (Full)',
    clients: 1000,
    flocks: 28,
    days: 365,
    seed: 42,
    vetRatio: 0.64,    // 18 VET / 28 total
    mortalityMultiplier: 1.0,
    diseaseFrequency: 'normal',
    priceVolatility: 'normal',
    weatherSeverity: 'normal',
  },

  // Stress test: extreme conditions
  stress: {
    name: 'Stress (Extreme)',
    clients: 5000,
    flocks: 100,
    days: 365,
    seed: 777,
    vetRatio: 0.5,
    mortalityMultiplier: 2.5,
    diseaseFrequency: 'epidemic',
    priceVolatility: 'hyperinflation',
    weatherSeverity: 'extreme',
  },

  // Rural Latin America: small farms, no vet access
  ruralLatam: {
    name: 'Rural LATAM',
    clients: 200,
    flocks: 8,
    days: 365,
    seed: 101,
    vetRatio: 0.12,      // Very few have vet access
    mortalityMultiplier: 1.8,
    diseaseFrequency: 'high',
    priceVolatility: 'high',
    weatherSeverity: 'high',
    connectivity: 'intermittent',  // For offline-first testing
    avgBirdsPerFlock: 500,
  },

  // Large-scale industrial operation
  industrial: {
    name: 'Industrial',
    clients: 50,
    flocks: 200,
    days: 365,
    seed: 999,
    vetRatio: 0.95,
    mortalityMultiplier: 0.6,
    diseaseFrequency: 'low',
    priceVolatility: 'low',
    weatherSeverity: 'controlled',
    avgBirdsPerFlock: 50000,
  },

  // Quick smoke test
  smoke: {
    name: 'Smoke Test',
    clients: 10,
    flocks: 3,
    days: 30,
    seed: 1,
    vetRatio: 0.66,
    mortalityMultiplier: 1.0,
    diseaseFrequency: 'normal',
    priceVolatility: 'normal',
    weatherSeverity: 'normal',
  },

  // Edge cases: maximum data variety
  edgeCases: {
    name: 'Edge Cases',
    clients: 100,
    flocks: 15,
    days: 365,
    seed: 13,
    vetRatio: 0.0,       // No vet at all
    mortalityMultiplier: 3.0,
    diseaseFrequency: 'pandemic',
    priceVolatility: 'crash',
    weatherSeverity: 'catastrophic',
    includeCorruptData: true,  // Bad dates, negative numbers, null fields
  },

  // Seasonal analysis (short but all seasons)
  seasonal: {
    name: 'Seasonal Analysis',
    clients: 100,
    flocks: 10,
    days: 730,   // 2 full years
    seed: 365,
    vetRatio: 0.5,
    mortalityMultiplier: 1.0,
    diseaseFrequency: 'seasonal',
    priceVolatility: 'seasonal',
    weatherSeverity: 'seasonal',
  },
};

// ============ LEARNING ENGINE ============
// Reads test results and adjusts scenarios to target weak spots

class SimulationLearner {
  constructor(resultsDir = 'reports') {
    this.resultsDir = resultsDir;
    this.learningsFile = path.join(resultsDir, 'simulation-learnings.json');
    this.learnings = this._loadLearnings();
  }

  _loadLearnings() {
    try {
      return JSON.parse(fs.readFileSync(this.learningsFile, 'utf8'));
    } catch {
      return {
        totalRuns: 0,
        failurePatterns: {},
        weakAreas: [],
        adjustments: {},
        history: [],
      };
    }
  }

  save() {
    const dir = path.dirname(this.learningsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.learningsFile, JSON.stringify(this.learnings, null, 2));
  }

  /** Record a test result and learn from it */
  recordResult(suiteName, passed, details = {}) {
    this.learnings.totalRuns++;
    this.learnings.history.push({
      timestamp: new Date().toISOString(),
      suite: suiteName,
      passed,
      details,
    });

    // Keep only last 100 results
    if (this.learnings.history.length > 100) {
      this.learnings.history = this.learnings.history.slice(-100);
    }

    if (!passed) {
      const pattern = details.errorType || 'unknown';
      this.learnings.failurePatterns[pattern] = (this.learnings.failurePatterns[pattern] || 0) + 1;

      // Track weak areas
      if (details.area && !this.learnings.weakAreas.includes(details.area)) {
        this.learnings.weakAreas.push(details.area);
      }
    }

    this.save();
  }

  /** Generate an adaptive scenario based on learned weaknesses */
  generateAdaptiveScenario() {
    const base = { ...SCENARIOS.standard };
    base.name = 'Adaptive (Learned)';
    base.seed = Date.now() % 100000;

    const weakAreas = this.learnings.weakAreas;
    const failures = this.learnings.failurePatterns;

    // If network tests fail often → simulate worse connectivity
    if (failures['network'] > 2 || weakAreas.includes('offline')) {
      base.connectivity = 'poor';
    }

    // If data handling tests fail → generate more edge case data
    if (failures['data_corruption'] > 1 || weakAreas.includes('data')) {
      base.includeCorruptData = true;
      base.clients = 3000;
    }

    // If performance tests fail → generate heavier loads
    if (failures['performance'] > 2 || weakAreas.includes('performance')) {
      base.clients = 5000;
      base.flocks = 80;
    }

    // If mortality/health tests fail → increase disease pressure
    if (failures['health'] > 1 || weakAreas.includes('health')) {
      base.mortalityMultiplier = 2.0;
      base.diseaseFrequency = 'epidemic';
    }

    // If financial tests fail → increase price volatility
    if (failures['finance'] > 1 || weakAreas.includes('finance')) {
      base.priceVolatility = 'hyperinflation';
    }

    return base;
  }

  /** Get summary stats */
  getSummary() {
    const recent = this.learnings.history.slice(-20);
    const recentPassed = recent.filter(r => r.passed).length;
    return {
      totalRuns: this.learnings.totalRuns,
      recentPassRate: recent.length > 0 ? `${Math.round(recentPassed / recent.length * 100)}%` : 'N/A',
      topFailures: Object.entries(this.learnings.failurePatterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      weakAreas: this.learnings.weakAreas,
    };
  }
}

// ============ CLI INTERFACE ============
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  if (command === 'list') {
    console.log('\n═══ Available Simulation Scenarios ═══\n');
    for (const [key, scenario] of Object.entries(SCENARIOS)) {
      console.log(`  ${key.padEnd(15)} — ${scenario.name} (${scenario.clients} clients, ${scenario.flocks} flocks, ${scenario.days} days)`);
    }
    console.log('\nUsage: node simulation-config.js <scenario|adaptive|summary>');
  }

  else if (command === 'adaptive') {
    const learner = new SimulationLearner();
    const scenario = learner.generateAdaptiveScenario();
    console.log('\n═══ Adaptive Scenario (Based on Learnings) ═══\n');
    console.log(JSON.stringify(scenario, null, 2));
  }

  else if (command === 'summary') {
    const learner = new SimulationLearner();
    const summary = learner.getSummary();
    console.log('\n═══ Simulation Learning Summary ═══\n');
    console.log(`Total runs: ${summary.totalRuns}`);
    console.log(`Recent pass rate: ${summary.recentPassRate}`);
    console.log(`Weak areas: ${summary.weakAreas.join(', ') || 'None detected'}`);
    if (summary.topFailures.length > 0) {
      console.log('Top failures:');
      summary.topFailures.forEach(([pattern, count]) => {
        console.log(`  ${pattern}: ${count} times`);
      });
    }
  }

  else if (SCENARIOS[command]) {
    console.log(JSON.stringify(SCENARIOS[command], null, 2));
  }

  else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

module.exports = { SCENARIOS, SimulationLearner };
