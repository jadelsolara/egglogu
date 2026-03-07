// EGGlogU — KPI Snapshot System & Alert Engine
// Used by dashboard and reporting components.

import { Store } from './store.js';
import { t } from './i18n.js';
import { todayStr, fmtNum, fmtDate, sanitizeHTML, genId } from './utils.js';
import { activeHens, activeHensByFlock } from './veng.js';
import { CATALOGS, tc } from './catalogs.js';

// ============ KPI SNAPSHOT ============
export function computeKpiSnapshot() {
  const D = Store.get();
  const hens = activeHens();
  const today = todayStr();
  const tp = D.dailyProduction.filter(p => p.date === today);
  const eggsToday = tp.reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const henDay = hens > 0 ? ((eggsToday / hens) * 100) : 0;

  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d30s = d30.toISOString().substring(0, 10);
  const p30 = D.dailyProduction.filter(p => p.date >= d30s);
  const te30 = p30.reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const teKg = te30 * 0.06;
  const f30 = D.feed.consumption.filter(c => c.date >= d30s);
  const tfKg = f30.reduce((s, c) => s + (c.quantityKg || 0), 0);
  const fcr = teKg > 0 ? (tfKg / teKg) : 0;

  const tDeaths = D.dailyProduction.reduce((s, p) => s + (p.deaths || 0), 0);
  const tInit = D.flocks.reduce((s, f) => s + (f.count || 0), 0);
  const mort = tInit > 0 ? ((tDeaths / tInit) * 100) : 0;

  const tExp = D.finances.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const tEggs = D.dailyProduction.reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const cpe = tEggs > 0 ? tExp / tEggs : 0;

  const mo = today.substring(0, 7);
  const mInc = D.finances.income.filter(i => i.date && i.date.startsWith(mo)).reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
  const mExp = D.finances.expenses.filter(e => e.date && e.date.startsWith(mo)).reduce((s, e) => s + (e.amount || 0), 0);
  const stock = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) - D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);

  return {
    date: today, activeHens: hens, eggsToday, henDay: Math.round(henDay * 10) / 10,
    fcr: Math.round(fcr * 100) / 100, mortality: Math.round(mort * 10) / 10,
    costPerEgg: Math.round(cpe * 100) / 100, netIncome: mInc - mExp,
    feedStock: Math.round(stock * 10) / 10,
    totalFlocks: D.flocks.filter(f => f.status !== 'descarte').length,
    activeOutbreaks: D.outbreaks.filter(o => o.status === 'active').length
  };
}

export function saveKpiSnapshot() {
  const D = Store.get();
  const snap = { id: genId(), ...computeKpiSnapshot() };
  D.kpiSnapshots.push(snap);
  Store.save(D);
}

export function snapshotDelta(current, previous) {
  if (!previous && previous !== 0) return '';
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return `<span class="snapshot-badge snapshot-same">= </span>`;
  return diff > 0
    ? `<span class="snapshot-badge snapshot-up">\u25B2 ${fmtNum(diff, 1)}</span>`
    : `<span class="snapshot-badge snapshot-down">\u25BC ${fmtNum(Math.abs(diff), 1)}</span>`;
}

// ============ ALERTS ============
export function getAlerts(D) {
  if (!D) D = Store.get();
  const alerts = [];
  const today = todayStr();
  const ad = D.settings.alertDaysBefore || 3;
  const soon = new Date(); soon.setDate(soon.getDate() + ad);
  const soonStr = soon.toISOString().substring(0, 10);

  // Vaccines
  D.vaccines.filter(v => v.status !== 'applied').forEach(v => {
    const f = D.flocks.find(x => x.id === v.flockId);
    const fn = f ? f.name : '';
    if (v.scheduledDate < today) alerts.push({ type: 'danger', icon: '\uD83D\uDC89', msg: `${t('alert_vaccine_overdue')}: ${v.vaccineName} - ${fn}` });
    else if (v.scheduledDate <= soonStr) alerts.push({ type: 'warning', icon: '\uD83D\uDC89', msg: `${t('alert_vaccine_soon')}: ${v.vaccineName} - ${fn} (${fmtDate(v.scheduledDate)})` });
  });

  // Feed stock
  const stock = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) - D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
  if (stock < (D.settings.minFeedStock || 50)) alerts.push({ type: 'warning', icon: '\uD83C\uDF3E', msg: `${t('alert_low_feed')}: ${fmtNum(stock, 1)} kg` });

  // Mortality
  const tD = D.dailyProduction.reduce((s, p) => s + (p.deaths || 0), 0);
  const tI = D.flocks.reduce((s, f) => s + (f.count || 0), 0);
  if (tI > 0 && (tD / tI) * 100 > (D.settings.maxMortality || 5)) alerts.push({ type: 'danger', icon: '\u26A0\uFE0F', msg: `${t('alert_high_mortality')}: ${fmtNum((tD / tI) * 100, 1)}%` });

  // Outbreaks
  D.outbreaks.filter(o => o.status === 'active').forEach(o => {
    const f = D.flocks.find(x => x.id === o.flockId);
    alerts.push({ type: 'danger', icon: '\uD83E\uDDA0', msg: `${t('alert_active_outbreak')}: ${o.disease} - ${f ? f.name : ''}` });
  });

  // Withdrawal
  D.medications.forEach(m => {
    if (m.withdrawalEnd && m.withdrawalEnd >= today) {
      const f = D.flocks.find(x => x.id === m.flockId);
      alerts.push({ type: 'warning', icon: '\u23F3', msg: `${t('alert_withdrawal')}: ${m.name} - ${f ? f.name : ''} (${fmtDate(m.withdrawalEnd)})` });
    }
  });

  // Biosecurity
  if (D.biosecurity) {
    D.biosecurity.zones.forEach(z => {
      if (z.lastDisinfection && z.frequencyDays) {
        const next = new Date(z.lastDisinfection + 'T12:00:00');
        next.setDate(next.getDate() + z.frequencyDays);
        if (next.toISOString().substring(0, 10) < today) alerts.push({ type: 'warning', icon: '\uD83D\uDEE1\uFE0F', msg: `${t('alert_bio_disinfection')}: ${z.name}` });
      }
    });
    const unresolved = D.biosecurity.pestSightings.filter(p => !p.resolved).length;
    if (unresolved > 0) alerts.push({ type: 'warning', icon: '\uD83D\uDC00', msg: `${t('alert_bio_pests')}: ${unresolved}` });
    const recentCross = D.biosecurity.visitors.filter(v => v.fromFarmHealth === 'outbreak' && v.date >= new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10));
    if (recentCross.length) alerts.push({ type: 'danger', icon: '\u26A0\uFE0F', msg: `${t('alert_bio_cross')}: ${recentCross.map(v => sanitizeHTML(v.name)).join(', ')}` });
  }

  // Client claims
  const openClaims = (D.clientClaims || []).filter(c => c.status !== 'resolved').length;
  if (openClaims > 0) alerts.push({ type: 'warning', icon: '\uD83D\uDCCB', msg: t('clm_alert_open').replace('{n}', openClaims) });

  return alerts;
}

// ============ RECOMMENDATIONS ============
export function getRecommendations(D) {
  if (!D) D = Store.get();
  const recs = [];
  const hens = activeHens();

  // Low production
  if (hens > 0) {
    const today = todayStr();
    const tp = D.dailyProduction.filter(p => p.date === today);
    const eggs = tp.reduce((s, p) => s + (p.eggsCollected || 0), 0);
    const henDay = (eggs / hens) * 100;
    if (henDay < 50 && henDay > 0) recs.push({ priority: 'high', icon: '\uD83D\uDCC9', msg: t('rec_low_production') || 'Production below 50% — check feed, water, lighting, and stress factors.' });
  }

  // No flocks
  if (!D.flocks.length) recs.push({ priority: 'medium', icon: '\uD83D\uDC23', msg: t('rec_add_flock') || 'Add your first flock to start tracking production.' });

  // No production data today
  if (D.flocks.filter(f => f.status !== 'descarte').length > 0) {
    const today = todayStr();
    const todayProd = D.dailyProduction.filter(p => p.date === today);
    if (!todayProd.length) recs.push({ priority: 'medium', icon: '\uD83D\uDCDD', msg: t('rec_record_today') || 'Record today\'s production data.' });
  }

  // High FCR
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d30s = d30.toISOString().substring(0, 10);
  const eggs30 = D.dailyProduction.filter(p => p.date >= d30s).reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const feed30 = D.feed.consumption.filter(c => c.date >= d30s).reduce((s, c) => s + (c.quantityKg || 0), 0);
  const eggKg = eggs30 * 0.06;
  if (eggKg > 0 && feed30 / eggKg > 3) recs.push({ priority: 'high', icon: '\uD83C\uDF3E', msg: t('rec_high_fcr') || 'Feed conversion ratio above 3.0 — review feed quality and waste.' });

  return recs;
}
