// EGGlogU — VENG Validation Engines (Zero Tolerance)
// Gate processors, cross-validation, math verification, census

import { Store } from './store.js';
import { sanitizeHTML, todayStr } from './utils.js';
import { BREED_CURVES } from './catalogs.js';
import { Bus } from './bus.js';

/** Get active hens across all flocks */
export function activeHens() {
  const D = Store.get();
  let n = 0;
  D.flocks.forEach(f => { if (f.status !== 'descarte') n += activeHensByFlock(f.id); });
  return n;
}

/** Get active hens for a specific flock */
export function activeHensByFlock(fid) {
  const D = Store.get();
  const f = D.flocks.find(x => x.id === fid);
  if (!f) return 0;
  const deaths = D.dailyProduction.filter(p => p.flockId === fid).reduce((s, p) => s + (p.deaths || 0), 0);
  const oD = D.outbreaks.filter(o => o.flockId === fid).reduce((s, o) => s + (o.deaths || 0), 0);
  return Math.max(0, (f.count || f.initialCount || 0) - deaths - oD);
}

/** Calculate flock age in weeks */
export function flockAge(f) {
  if (!f || !f.birthDate) return { weeks: -1, days: 0 };
  const diff = Date.now() - new Date(f.birthDate + 'T00:00:00').getTime();
  const days = Math.floor(diff / 86400000);
  return { weeks: Math.floor(days / 7), days };
}

/** Determine lifecycle stage for a flock */
export function flockLifecycleStage(f) {
  const age = flockAge(f);
  if (age.weeks < 0) return null;
  if (age.weeks <= 6) return { id: 'cria', name: 'Cria' };
  if (age.weeks <= 16) return { id: 'recria', name: 'Recria' };
  return { id: 'produccion', name: 'Produccion' };
}

export const VENG = {
  gate: {
    production(o, D) {
      const e = [], w = [];
      const hens = activeHensByFlock(o.flockId);
      if (o.date > todayStr()) e.push({ field: 'p-date', msg: 'Future date not allowed' });
      if (hens > 0 && o.eggsCollected > hens) e.push({ field: 'p-eggs', msg: 'Eggs (' + o.eggsCollected + ') exceed active hens (' + hens + ')' });
      if (o.eggsBroken > o.eggsCollected) e.push({ field: 'p-broken', msg: 'Broken eggs (' + o.eggsBroken + ') exceed collected (' + o.eggsCollected + ')' });
      const sizeSum = (o.eggsS || 0) + (o.eggsM || 0) + (o.eggsL || 0) + (o.eggsXL || 0) + (o.eggsJumbo || 0);
      if (sizeSum > 0 && sizeSum > o.eggsCollected) e.push({ field: 'p-s', msg: 'Size breakdown (' + sizeSum + ') exceeds collected (' + o.eggsCollected + ')' });
      if (o.deaths > 0 && hens > 0 && o.deaths > hens) e.push({ field: 'p-deaths', msg: 'Deaths (' + o.deaths + ') exceed active hens (' + hens + ')' });
      const dup = D.dailyProduction.find(p => p.date === o.date && p.flockId === o.flockId && (!o.id || p.id !== o.id));
      if (dup) w.push({ field: 'p-date', msg: 'Duplicate: production already recorded for this flock on ' + o.date });
      if (hens > 0) {
        const hd = (o.eggsCollected / hens) * 100;
        if (hd > 105) w.push({ field: 'p-eggs', msg: 'HD% is ' + hd.toFixed(1) + '% — exceeds 105%, verify count' });
        const f = D.flocks.find(x => x.id === o.flockId);
        if (f) {
          const age = flockAge(f);
          const bc = BREED_CURVES[f.targetCurve || f.breed];
          if (bc && age.weeks >= 0) {
            const idx = Math.min(age.weeks, bc.length - 1);
            const expected = bc[idx] * (f.curveAdjust || 1);
            if (hd > 0 && Math.abs(hd - expected) > 25) w.push({ field: 'p-eggs', msg: 'HD% (' + hd.toFixed(1) + '%) deviates >25pts from breed curve (' + expected.toFixed(1) + '%)' });
          }
        }
      }
      return { ok: e.length === 0, errors: e, warnings: w };
    },
    flock(o, D) {
      const e = [], w = [];
      if (o.curveAdjust < 0.3 || o.curveAdjust > 2.0) e.push({ field: 'f-curve', msg: 'Curve adjust must be 0.3-2.0 (got ' + o.curveAdjust + ')' });
      if (o.count > 50000) w.push({ field: 'f-count', msg: 'Large flock (' + o.count + ' hens) — verify count' });
      const dup = D.flocks.find(f => f.name.toLowerCase() === o.name.toLowerCase() && (!o.id || f.id !== o.id));
      if (dup) e.push({ field: 'f-name', msg: 'Flock name "' + o.name + '" already exists' });
      if (o.birthDate > todayStr()) w.push({ field: 'f-birth', msg: 'Birth date is in the future' });
      return { ok: e.length === 0, errors: e, warnings: w };
    },
    feedCons(o, D) {
      const e = [], w = [];
      if (o.date > todayStr()) e.push({ field: 'fc-date', msg: 'Future date not allowed' });
      const hens = activeHensByFlock(o.flockId);
      if (hens > 0) {
        const perHen = (o.quantityKg / hens) * 1000;
        if (perHen < 50) w.push({ field: 'fc-qty', msg: 'Very low: ' + perHen.toFixed(0) + 'g/hen (normal 80-160g)' });
        if (perHen > 250) w.push({ field: 'fc-qty', msg: 'Very high: ' + perHen.toFixed(0) + 'g/hen (normal 80-160g)' });
        if (perHen > 400) e.push({ field: 'fc-qty', msg: 'Impossible: ' + perHen.toFixed(0) + 'g/hen exceeds 400g max' });
      }
      const stock = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) - D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
      if (o.quantityKg > stock && stock >= 0) w.push({ field: 'fc-qty', msg: 'Consumption (' + o.quantityKg + 'kg) exceeds feed stock (' + stock.toFixed(1) + 'kg)' });
      return { ok: e.length === 0, errors: e, warnings: w };
    },
    income(o, D) {
      const e = [], w = [];
      if (o.date > todayStr()) e.push({ field: 'fi-date', msg: 'Future date not allowed' });
      if (o.type === 'eggs' && o.quantity > 0) {
        const inv = D.inventory.reduce((s, i) => s + (i.qtyIn || 0) - (i.qtyOut || 0), 0);
        if (o.quantity > inv && inv >= 0) w.push({ field: 'fi-qty', msg: 'Sale qty (' + o.quantity + ') exceeds inventory (' + Math.floor(inv) + ')' });
      }
      if (o.unitPrice > 0 && o.quantity > 0) {
        const total = o.unitPrice * o.quantity;
        if (total > 1000000) w.push({ field: 'fi-price', msg: 'High transaction: ' + total.toFixed(2) + ' — verify' });
      }
      return { ok: e.length === 0, errors: e, warnings: w };
    },
    expense(o, D) {
      const e = [], w = [];
      if (o.date > todayStr()) e.push({ field: 'fe-date', msg: 'Future date not allowed' });
      if (o.amount > 500000) w.push({ field: 'fe-amt', msg: 'Large expense: ' + o.amount.toFixed(2) + ' — verify amount' });
      return { ok: e.length === 0, errors: e, warnings: w };
    }
  },

  xval(D) {
    const issues = []; let score = 100; const penalty = 5;
    const invBal = D.inventory.reduce((s, i) => s + (i.qtyIn || 0) - (i.qtyOut || 0), 0);
    if (invBal < 0) { issues.push({ severity: 'error', module: 'inventory', msg: 'Negative egg inventory: ' + Math.floor(invBal) }); score -= penalty * 2; }
    const feedStock = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) - D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
    if (feedStock < -0.1) { issues.push({ severity: 'error', module: 'feed', msg: 'Negative feed stock: ' + feedStock.toFixed(1) + 'kg' }); score -= penalty * 2; }
    const flockIds = new Set(D.flocks.map(f => f.id));
    const orphanProd = D.dailyProduction.filter(p => p.flockId && !flockIds.has(p.flockId));
    if (orphanProd.length) { issues.push({ severity: 'warning', module: 'production', msg: orphanProd.length + ' production records reference deleted flocks' }); score -= penalty; }
    const orphanFeed = D.feed.consumption.filter(c => c.flockId && !flockIds.has(c.flockId));
    if (orphanFeed.length) { issues.push({ severity: 'warning', module: 'feed', msg: orphanFeed.length + ' feed records reference deleted flocks' }); score -= penalty; }
    const orphanVax = D.vaccines.filter(v => v.flockId && !flockIds.has(v.flockId));
    if (orphanVax.length) { issues.push({ severity: 'warning', module: 'vaccines', msg: orphanVax.length + ' vaccine records reference deleted flocks' }); score -= penalty; }
    const clientIds = new Set(D.clients.map(c => c.id));
    const orphanInc = D.finances.income.filter(i => i.clientId && !clientIds.has(i.clientId));
    if (orphanInc.length) { issues.push({ severity: 'warning', module: 'income', msg: orphanInc.length + ' income records reference deleted clients' }); score -= penalty; }
    D.flocks.forEach(f => {
      const deaths = D.dailyProduction.filter(p => p.flockId === f.id).reduce((s, p) => s + (p.deaths || 0), 0);
      const oDeaths = D.outbreaks.filter(o => o.flockId === f.id).reduce((s, o) => s + (o.deaths || 0), 0);
      if (deaths + oDeaths > (f.count || 0)) { issues.push({ severity: 'error', module: 'flocks', msg: 'Flock "' + f.name + '": total deaths (' + (deaths + oDeaths) + ') exceed initial count (' + f.count + ')' }); score -= penalty; }
    });
    const totalProdEggs = D.dailyProduction.reduce((s, p) => s + (p.eggsCollected || 0), 0);
    const totalInvIn = D.inventory.filter(i => i.source === 'production').reduce((s, i) => s + (i.qtyIn || 0), 0);
    const gap = Math.abs(totalProdEggs - totalInvIn);
    if (gap > 10 && totalProdEggs > 0) { issues.push({ severity: 'warning', module: 'inventory', msg: 'Production-inventory gap: ' + gap + ' eggs' }); score -= Math.min(penalty, Math.ceil(gap / totalProdEggs * 20)); }
    const d30 = new Date(); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().substring(0, 10);
    D.flocks.forEach(f => {
      const eggs = D.dailyProduction.filter(p => p.flockId === f.id && p.date >= d30s).reduce((s, p) => s + (p.eggsCollected || 0), 0);
      const feedKg = D.feed.consumption.filter(c => c.flockId === f.id && c.date >= d30s).reduce((s, c) => s + (c.quantityKg || 0), 0);
      const eggKg = eggs * 0.06; const fcr = eggKg > 0 ? feedKg / eggKg : 0;
      if (fcr > 5 && feedKg > 0) { issues.push({ severity: 'warning', module: 'feed', msg: 'Flock "' + f.name + '": FCR=' + fcr.toFixed(2) + ' (>5 abnormal)' }); score -= penalty; }
    });
    const prodDates = new Set(D.dailyProduction.map(p => p.date));
    if (D.dailyProduction.length > 7) {
      const sorted = [...prodDates].sort();
      for (let i = 1; i < Math.min(sorted.length, 60); i++) {
        const prev = new Date(sorted[i - 1] + 'T12:00:00');
        const curr = new Date(sorted[i] + 'T12:00:00');
        const diff = Math.round((curr - prev) / 864e5);
        if (diff > 3) { issues.push({ severity: 'info', module: 'production', msg: 'Gap: no data between ' + sorted[i - 1] + ' and ' + sorted[i] + ' (' + diff + ' days)' }); score -= 1; }
      }
    }
    return { score: Math.max(0, score), issues, timestamp: new Date().toISOString() };
  },

  mathv(D) {
    const checks = []; let pass = 0, total = 0;
    const mo = todayStr().substring(0, 7);
    const mInc = D.finances.income.filter(i => i.date && i.date.startsWith(mo)).reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    const mExp = D.finances.expenses.filter(e => e.date && e.date.startsWith(mo)).reduce((s, e) => s + (e.amount || 0), 0);
    const grossProfit = mInc - mExp;
    const taxRate = (D.settings.taxRate || 0) / 100;
    const depY = D.settings.depreciationYears || 5;
    const assetVal = D.settings.assetValue || 0;
    const monthlyDep = assetVal > 0 ? assetVal / (depY * 12) : 0;
    const opProfit = grossProfit - monthlyDep;
    const taxAmt = opProfit > 0 ? opProfit * taxRate : 0;
    const netProfit = opProfit - taxAmt;
    total++;
    const expectedNet = mInc - mExp - monthlyDep - (opProfit > 0 ? opProfit * taxRate : 0);
    if (Math.abs(netProfit - expectedNet) < 0.01) { pass++; checks.push({ name: 'Net Profit Formula', ok: true, detail: 'Income-Expenses-Depreciation-Tax = ' + netProfit.toFixed(2) }); }
    else { checks.push({ name: 'Net Profit Formula', ok: false, detail: 'Mismatch: computed=' + netProfit.toFixed(2) + ' vs expected=' + expectedNet.toFixed(2) }); }
    const tEggs = D.dailyProduction.reduce((s, p) => s + (p.eggsCollected || 0), 0);
    const tExp = D.finances.expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const cpe = tEggs > 0 ? tExp / tEggs : 0;
    total++;
    if (tEggs > 0) {
      const verify = cpe * tEggs;
      if (Math.abs(verify - tExp) < 0.01) { pass++; checks.push({ name: 'Cost/Egg Verification', ok: true, detail: 'CPE(' + cpe.toFixed(4) + ') x Eggs(' + tEggs + ') = ' + verify.toFixed(2) }); }
      else { checks.push({ name: 'Cost/Egg Verification', ok: false, detail: 'CPE*Eggs=' + verify.toFixed(2) + ' != TotalExp=' + tExp.toFixed(2) }); }
    } else { pass++; checks.push({ name: 'Cost/Egg Verification', ok: true, detail: 'No eggs yet' }); }
    const totalIncAmt = D.finances.income.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    const totalIncQty = D.finances.income.reduce((s, i) => s + (i.quantity || 0), 0);
    const avgPrice = totalIncQty > 0 ? totalIncAmt / totalIncQty : 0;
    const breakEven = avgPrice > 0 ? Math.ceil(tExp / avgPrice) : 0;
    total++;
    if (avgPrice > 0) {
      const verify = breakEven * avgPrice;
      if (verify >= tExp * 0.99) { pass++; checks.push({ name: 'Break-Even Check', ok: true, detail: 'BE(' + breakEven + ') x AvgPrice(' + avgPrice.toFixed(4) + ') >= Expenses(' + tExp.toFixed(2) + ')' }); }
      else { checks.push({ name: 'Break-Even Check', ok: false, detail: 'BE*Price=' + verify.toFixed(2) + ' < Expenses=' + tExp.toFixed(2) }); }
    } else { pass++; checks.push({ name: 'Break-Even Check', ok: true, detail: 'No sales yet' }); }
    total++;
    if (Math.abs(totalIncAmt - totalIncAmt) < 0.01) { pass++; checks.push({ name: 'Channel Revenue Sum', ok: true, detail: 'Sum of all income = ' + totalIncAmt.toFixed(2) }); }
    const invIn = D.inventory.reduce((s, i) => s + (i.qtyIn || 0), 0);
    const invOut = D.inventory.reduce((s, i) => s + (i.qtyOut || 0), 0);
    const invBal = invIn - invOut;
    total++;
    if (invBal >= 0) { pass++; checks.push({ name: 'Inventory Balance', ok: true, detail: 'In(' + invIn + ') - Out(' + invOut + ') = ' + invBal + ' >= 0' }); }
    else { checks.push({ name: 'Inventory Balance', ok: false, detail: 'In(' + invIn + ') - Out(' + invOut + ') = ' + invBal + ' < 0' }); }
    const totalInit = D.flocks.reduce((s, f) => s + (f.count || 0), 0);
    const totalActive = activeHens();
    total++;
    if (totalActive <= totalInit) { pass++; checks.push({ name: 'Active Hens <= Initial', ok: true, detail: 'Active(' + totalActive + ') <= Initial(' + totalInit + ')' }); }
    else { checks.push({ name: 'Active Hens <= Initial', ok: false, detail: 'Active(' + totalActive + ') > Initial(' + totalInit + ')' }); }
    return { pass, total, pct: total > 0 ? Math.round((pass / total) * 100) : 100, checks, timestamp: new Date().toISOString() };
  },

  census(D) {
    const f = []; const today = todayStr();
    const flocks = (D.flocks || []).filter(fl => fl.status !== 'descarte');
    const prod = D.dailyProduction || [];
    const vacc = D.vaccines || []; const meds = D.medications || [];
    const outbreaks = D.outbreaks || [];
    const feedP = D.feed ? D.feed.purchases : [];
    const feedC = D.feed ? D.feed.consumption : [];
    const income = D.finances ? D.finances.income : [];
    const expenses = D.finances ? D.finances.expenses : [];
    const inv = D.inventory || [];
    const env = D.environment || [];
    const chk = D.checklist || [];
    const bio = D.biosecurity ? D.biosecurity.visitors : [];
    const totalHens = flocks.reduce((s, fl) => {
      const d = prod.filter(p => p.flockId === fl.id).reduce((a, p) => a + (p.deaths || 0), 0);
      return s + Math.max(0, (fl.initialCount || fl.count || 0) - d);
    }, 0);

    const d30 = new Date(); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().substring(0, 10);

    // SANITARY
    const flocksWithVacc = new Set(vacc.map(v => v.flockId));
    const noVacc = flocks.filter(fl => !flocksWithVacc.has(fl.id));
    if (noVacc.length > 0 && flocks.length > 0) {
      f.push({ cat: 'sanitary', sev: 'critical', code: 'NO_VACCINE_PROGRAM', metric: Math.round((noVacc.length / flocks.length) * 100), unit: '%', bench: 0, msg: noVacc.length + '/' + flocks.length + ' active flocks have ZERO vaccines', rec: 'Establish vaccination schedule' });
    }
    flocks.forEach(fl => {
      const recs = prod.filter(p => p.flockId === fl.id && p.date >= d30s);
      const deaths = recs.reduce((s, p) => s + (p.deaths || 0), 0);
      const hens = fl.initialCount || fl.count || 0;
      if (hens > 0) {
        const pct = (deaths / hens) * 100;
        if (pct > 3) f.push({ cat: 'sanitary', sev: 'critical', code: 'HIGH_MORTALITY', metric: +pct.toFixed(1), unit: '%/30d', bench: 1.5, msg: 'Flock "' + fl.name + '": ' + pct.toFixed(1) + '% mortality in 30 days', rec: 'Veterinary inspection urgently needed' });
        else if (pct > 1.5) f.push({ cat: 'sanitary', sev: 'warning', code: 'ELEVATED_MORTALITY', metric: +pct.toFixed(1), unit: '%/30d', bench: 1.5, msg: 'Flock "' + fl.name + '": ' + pct.toFixed(1) + '% mortality in 30 days', rec: 'Monitor closely' });
      }
    });
    const untreated = outbreaks.filter(o => !o.resolved && !meds.some(m => m.flockId === o.flockId && m.date >= o.dateDetected));
    if (untreated.length > 0) f.push({ cat: 'sanitary', sev: 'critical', code: 'UNTREATED_OUTBREAKS', metric: untreated.length, unit: 'outbreaks', bench: 0, msg: untreated.length + ' outbreak(s) without treatment', rec: 'Register treatment for every outbreak' });
    if (bio.length === 0 && flocks.length > 0) f.push({ cat: 'sanitary', sev: 'warning', code: 'NO_BIOSECURITY_LOGS', metric: 0, unit: 'visits', bench: 1, msg: 'Zero biosecurity visitor logs', rec: 'Log all farm visitors' });

    // NUTRITIONAL
    flocks.forEach(fl => {
      const cons = feedC.filter(c => c.flockId === fl.id && c.date >= d30s);
      const hens = fl.initialCount || fl.count || 0;
      if (cons.length > 0 && hens > 0) {
        const totalKg = cons.reduce((s, c) => s + (c.quantityKg || 0), 0);
        const gPerHenDay = (totalKg * 1000) / (hens * Math.max(cons.length, 1));
        if (gPerHenDay > 200) f.push({ cat: 'nutritional', sev: 'warning', code: 'HIGH_FEED_PER_HEN', metric: +gPerHenDay.toFixed(0), unit: 'g/hen/d', bench: 120, msg: 'Flock "' + fl.name + '": ' + gPerHenDay.toFixed(0) + 'g/hen/day (expect ~120g)', rec: 'Check feed waste' });
        else if (gPerHenDay < 80 && gPerHenDay > 0) f.push({ cat: 'nutritional', sev: 'warning', code: 'LOW_FEED_PER_HEN', metric: +gPerHenDay.toFixed(0), unit: 'g/hen/d', bench: 120, msg: 'Flock "' + fl.name + '": ' + gPerHenDay.toFixed(0) + 'g/hen/day (expect ~120g)', rec: 'Insufficient feeding — review feed plan' });
      }
    });
    flocks.forEach(fl => {
      const recs = prod.filter(p => p.flockId === fl.id && p.date >= d30s);
      const cons = feedC.filter(c => c.flockId === fl.id && c.date >= d30s);
      const eggs = recs.reduce((s, p) => s + (p.eggsCollected || 0), 0);
      const feedKg = cons.reduce((s, c) => s + (c.quantityKg || 0), 0);
      if (eggs > 0 && feedKg > 0) {
        const fcr = feedKg / (eggs * 0.06);
        if (fcr > 3) f.push({ cat: 'nutritional', sev: 'critical', code: 'HIGH_FCR', metric: +fcr.toFixed(2), unit: 'kg/kg', bench: 2.2, msg: 'Flock "' + fl.name + '": FCR=' + fcr.toFixed(2), rec: 'Review feed quality' });
        else if (fcr > 2.5) f.push({ cat: 'nutritional', sev: 'warning', code: 'ELEVATED_FCR', metric: +fcr.toFixed(2), unit: 'kg/kg', bench: 2.2, msg: 'Flock "' + fl.name + '": FCR=' + fcr.toFixed(2), rec: 'Optimize feed formula' });
      }
    });
    if (feedC.length === 0 && flocks.length > 0) f.push({ cat: 'nutritional', sev: 'warning', code: 'NO_FEED_TRACKING', metric: 0, unit: 'records', bench: 1, msg: 'Zero feed consumption records', rec: 'Register daily feed per flock' });

    // FINANCIAL
    const totInc = income.reduce((s, i) => s + (i.totalPrice || ((i.unitPrice || 0) * (i.quantity || 0))), 0);
    const totExp = expenses.reduce((s, e) => s + (e.amount || 0), 0) + feedP.reduce((s, p) => s + ((p.pricePerKg || 0) * (p.quantityKg || 0)), 0);
    if (totInc > 0 || totExp > 0) {
      const margin = totInc > 0 ? ((totInc - totExp) / totInc) * 100 : -100;
      if (margin < 0) f.push({ cat: 'financial', sev: 'critical', code: 'NEGATIVE_MARGIN', metric: +margin.toFixed(1), unit: '%', bench: 10, msg: 'Net margin ' + margin.toFixed(1) + '% — losing money', rec: 'Review pricing, reduce costs' });
      else if (margin < 5) f.push({ cat: 'financial', sev: 'warning', code: 'LOW_MARGIN', metric: +margin.toFixed(1), unit: '%', bench: 10, msg: 'Net margin only ' + margin.toFixed(1) + '%', rec: 'Target minimum 10% margin' });
    }
    if (income.length === 0 && prod.length > 0) f.push({ cat: 'financial', sev: 'warning', code: 'NO_INCOME_RECORDS', metric: 0, unit: 'records', bench: 1, msg: 'Production exists but zero sales recorded', rec: 'Register all sales' });
    const channels = new Set(income.map(i => i.marketChannel || 'default'));
    if (income.length > 5 && channels.size <= 1) f.push({ cat: 'financial', sev: 'info', code: 'SINGLE_CHANNEL', metric: 1, unit: 'channels', bench: 3, msg: 'Single sales channel — high dependency', rec: 'Diversify channels' });

    // OPERATIONAL
    if (prod.length > 5) {
      const dates = [...new Set(prod.map(p => p.date))].sort();
      let maxGap = 0;
      for (let i = 1; i < dates.length; i++) { const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000; if (diff > maxGap) maxGap = diff; }
      if (maxGap > 7) f.push({ cat: 'operational', sev: 'warning', code: 'LARGE_PRODUCTION_GAP', metric: maxGap, unit: 'days', bench: 1, msg: 'Largest gap: ' + maxGap + ' days', rec: 'Record production daily' });
    }
    flocks.forEach(fl => {
      const recs = prod.filter(p => p.flockId === fl.id && p.date >= d30s);
      const hens = fl.initialCount || fl.count || 0;
      if (recs.length > 5 && hens > 0) {
        const avgEggs = recs.reduce((s, p) => s + (p.eggsCollected || 0), 0) / recs.length;
        const hd = (avgEggs / hens) * 100;
        const expected = fl.breed ? 80 : 75;
        if (hd < expected * 0.6 && hd > 0) f.push({ cat: 'operational', sev: 'warning', code: 'LOW_HENDAY', metric: +hd.toFixed(1), unit: '%', bench: expected, msg: 'Flock "' + fl.name + '": HD%=' + hd.toFixed(1) + '%', rec: 'Check age, lighting, nutrition, stress' });
      }
    });
    const usedModules = new Set();
    if (prod.length > 0) usedModules.add('production');
    if (feedC.length > 0) usedModules.add('feed');
    if (vacc.length > 0) usedModules.add('vaccines');
    if (income.length > 0) usedModules.add('income');
    if (env.length > 0) usedModules.add('environment');
    if (chk.length > 0) usedModules.add('checklist');
    if (bio.length > 0) usedModules.add('biosecurity');
    if (inv.length > 0) usedModules.add('inventory');
    const core = ['production', 'feed', 'income', 'vaccines'];
    const unused = core.filter(m => !usedModules.has(m));
    if (unused.length > 0 && flocks.length > 0) f.push({ cat: 'operational', sev: 'info', code: 'UNUSED_MODULES', metric: unused.length, unit: 'modules', bench: 0, msg: 'Core modules not used: ' + unused.join(', '), rec: 'Use all core modules' });
    if (env.length === 0 && flocks.length > 0) f.push({ cat: 'operational', sev: 'info', code: 'NO_ENVIRONMENT', metric: 0, unit: 'readings', bench: 1, msg: 'No temperature/humidity readings', rec: 'Track environment' });

    // DATA QUALITY
    const xv = VENG.xval(D);
    if (xv.score < 70) f.push({ cat: 'data', sev: 'critical', code: 'LOW_XVAL_SCORE', metric: xv.score, unit: '/100', bench: 90, msg: 'Data integrity score: ' + xv.score + '/100', rec: 'Fix cross-validation issues' });
    else if (xv.score < 90) f.push({ cat: 'data', sev: 'warning', code: 'MODERATE_XVAL_SCORE', metric: xv.score, unit: '/100', bench: 90, msg: 'Data integrity score: ' + xv.score + '/100', rec: 'Review flagged issues' });
    const mv = VENG.mathv(D);
    if (mv.pct < 100) f.push({ cat: 'data', sev: 'warning', code: 'MATHV_FAILURES', metric: mv.pct, unit: '%', bench: 100, msg: 'Math verification: ' + mv.pass + '/' + mv.total + ' pass (' + mv.pct + '%)', rec: 'Check financial formulas' });

    // SCORES
    const byCat = { sanitary: [], nutritional: [], financial: [], operational: [], data: [] };
    f.forEach(x => { if (byCat[x.cat]) byCat[x.cat].push(x); });
    function catScore(arr) { if (arr.length === 0) return 100; let s = 100; arr.forEach(x => { if (x.sev === 'critical') s -= 20; else if (x.sev === 'warning') s -= 10; else s -= 3; }); return Math.max(0, s); }
    const scores = { sanitary: catScore(byCat.sanitary), nutritional: catScore(byCat.nutritional), financial: catScore(byCat.financial), operational: catScore(byCat.operational), data: catScore(byCat.data) };
    const overall = Math.round((scores.sanitary + scores.nutritional + scores.financial + scores.operational + scores.data) / 5);
    return { timestamp: new Date().toISOString(), overall, scores, findings: f, critical: f.filter(x => x.sev === 'critical').length, warning: f.filter(x => x.sev === 'warning').length, info: f.filter(x => x.sev === 'info').length };
  }
};
