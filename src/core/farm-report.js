// EGGlogU — Farm Status Report Generator
// Generates narrative text interpreting KPI/alert data like a vet/consultant report.
// Three sections: Health, Operations/Production, Finances.

import { Store } from './store.js';
import { getLang } from './i18n.js';
import { todayStr, fmtNum, fmtMoney, fmtDate } from './utils.js';
import { activeHens, activeHensByFlock } from './veng.js';
import { computeKpiSnapshot, getAlerts } from './kpi.js';

// ── Helpers ──────────────────────────────────────────────────

function _days(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr + 'T12:00:00');
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

function _avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function _trend7vs30(dailyVals) {
  // Compare last 7 days avg vs 30 days avg
  if (dailyVals.length < 7) return null;
  const last7 = _avg(dailyVals.slice(-7));
  const all = _avg(dailyVals);
  if (all === 0) return null;
  return ((last7 - all) / all) * 100;
}

function _feedStockDays(D) {
  const stock = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) -
                D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
  if (stock <= 0) return 0;
  // Avg daily consumption from last 14 days
  const d14 = new Date(); d14.setDate(d14.getDate() - 14);
  const d14s = d14.toISOString().substring(0, 10);
  const recent = D.feed.consumption.filter(c => c.date >= d14s);
  const days = new Set(recent.map(c => c.date)).size || 1;
  const dailyAvg = recent.reduce((s, c) => s + (c.quantityKg || 0), 0) / days;
  return dailyAvg > 0 ? Math.round(stock / dailyAvg) : 999;
}

// ── Bilingual report text (ES/EN, falls back to ES) ──────────

const _txt = {
  es: {
    // Section headers
    h_health: 'Estado Sanitario',
    h_ops: 'Operación y Producción',
    h_fin: 'Finanzas',
    h_summary: 'Resumen Ejecutivo',
    // Health
    health_excellent: 'La situación sanitaria del gallinero es excelente. No hay brotes activos ni mortalidad fuera de rango.',
    health_good: 'La situación sanitaria es buena en general.',
    health_concern: 'Se detectan puntos de atención sanitaria que requieren seguimiento.',
    health_critical: 'ATENCIÓN: Situación sanitaria crítica que requiere acción inmediata.',
    mort_normal: 'La mortalidad acumulada es de {pct}%, dentro del rango normal (<3%).',
    mort_watch: 'La mortalidad acumulada es de {pct}% — por encima del promedio esperado. Revisar causas de muerte y condiciones ambientales.',
    mort_high: 'ALERTA: Mortalidad de {pct}% — nivel alto. Se recomienda necropsia y revisión de bioseguridad urgente.',
    mort_flock: 'En {name}: {deaths} bajas de {initial} aves ({pct}%). ',
    outbreak_active: 'Hay {n} brote(s) activo(s): {list}. Se requiere protocolo de contención y seguimiento veterinario.',
    outbreak_none: 'No hay brotes activos registrados.',
    vac_overdue: 'URGENTE: {n} vacuna(s) vencida(s) pendientes de aplicación: {list}.',
    vac_upcoming: 'Próximas vacunas programadas: {list}.',
    vac_ok: 'Todas las vacunas están al día.',
    withdrawal_active: 'Hay {n} período(s) de retiro activo(s). Los huevos de los lotes afectados NO deben comercializarse hasta: {list}.',
    bio_ok: 'Protocolos de bioseguridad al día.',
    bio_disinfect: 'Zonas pendientes de desinfección: {list}.',
    bio_pests: 'Se reportan {n} avistamiento(s) de plagas sin resolver.',
    bio_cross: 'RIESGO: Visitantes recientes provenientes de granjas con brotes: {list}.',
    // Operations
    ops_summary: 'Hoy se recolectaron {eggs} huevos con {hens} gallinas activas en {flocks} lote(s).',
    henday_excellent: 'El porcentaje de postura (hen-day) es {pct}% — excelente rendimiento productivo.',
    henday_good: 'El porcentaje de postura es {pct}% — buen nivel de producción.',
    henday_low: 'El porcentaje de postura es {pct}% — por debajo del promedio esperado. Verificar alimentación, iluminación (14-16h), agua y factores de estrés.',
    henday_critical: 'ALERTA: Postura en {pct}% — nivel crítico. Posibles causas: muda, enfermedad, estrés térmico, deficiencia nutricional, o problemas de iluminación.',
    henday_trend_up: 'Tendencia ascendente: la producción de los últimos 7 días supera el promedio mensual en {pct}%.',
    henday_trend_down: 'Tendencia descendente: la producción de los últimos 7 días está {pct}% por debajo del promedio mensual. Investigar posibles causas.',
    henday_trend_stable: 'Producción estable respecto al promedio del mes.',
    fcr_good: 'La conversión alimenticia (FCR) es {v} — eficiente (objetivo: <2.2).',
    fcr_normal: 'La conversión alimenticia es {v} — dentro del rango normal (2.0-2.5).',
    fcr_high: 'La conversión alimenticia es {v} — elevada. Revisar calidad del alimento, desperdicio, y si hay aves improductivas consumiendo.',
    fcr_critical: 'ALERTA: FCR de {v} — muy por encima del óptimo. Se pierde rentabilidad por cada kilo de alimento. Acción correctiva urgente.',
    feed_stock: 'Stock de alimento: {kg} kg disponibles, estimado para {days} días de operación.',
    feed_low: 'ALERTA: El stock de alimento alcanza para solo {days} días. Programar compra inmediata.',
    feed_critical: 'CRÍTICO: Alimento agotado o insuficiente para las próximas 48 horas.',
    env_heat: 'Estrés térmico detectado (THI > 28). Aumentar ventilación y agua fresca. Considerar cortinas húmedas.',
    env_cold: 'Temperatura por debajo de lo óptimo ({temp}°C). Verificar calefacción y corrientes de aire.',
    env_humidity: 'Humedad fuera del rango ideal ({hum}%). Rango óptimo: 50-70%.',
    no_data_today: 'No se han registrado datos de producción hoy. Registrar antes del cierre del día.',
    // Finances
    fin_income: 'Ingreso neto del mes: {amount}.',
    fin_positive: 'La operación es rentable este mes con un margen positivo.',
    fin_negative: 'La operación muestra pérdida este mes. Revisar costos y precios de venta.',
    fin_cpe: 'El costo por huevo es de {amount}.',
    fin_cpe_high: 'El costo por huevo ({amount}) es elevado. Principales rubros a revisar: alimento (60-70% del costo), mano de obra, medicamentos.',
    fin_margin: 'Margen por huevo vendido: {amount} ({pct}%).',
    fin_receivables: 'Cuentas por cobrar pendientes: {amount} ({n} facturas).',
    fin_expenses_breakdown: 'Principales gastos del mes: {list}.',
    // Summary
    sum_good: 'El gallinero opera dentro de parámetros normales. Sin acciones urgentes requeridas.',
    sum_attention: 'Se identifican {n} punto(s) de atención que requieren seguimiento esta semana.',
    sum_critical: 'Se detectan {n} situación(es) crítica(s) que requieren acción inmediata.',
  },
  en: {
    h_health: 'Health Status',
    h_ops: 'Operations & Production',
    h_fin: 'Finances',
    h_summary: 'Executive Summary',
    health_excellent: 'The poultry house health status is excellent. No active outbreaks or abnormal mortality.',
    health_good: 'Overall health status is good.',
    health_concern: 'Health concerns detected that require monitoring.',
    health_critical: 'ATTENTION: Critical health situation requiring immediate action.',
    mort_normal: 'Cumulative mortality is {pct}%, within normal range (<3%).',
    mort_watch: 'Cumulative mortality is {pct}% — above expected average. Review causes of death and environmental conditions.',
    mort_high: 'ALERT: Mortality at {pct}% — high level. Necropsy and urgent biosecurity review recommended.',
    mort_flock: 'In {name}: {deaths} losses out of {initial} birds ({pct}%). ',
    outbreak_active: 'There are {n} active outbreak(s): {list}. Containment protocol and veterinary follow-up required.',
    outbreak_none: 'No active outbreaks on record.',
    vac_overdue: 'URGENT: {n} overdue vaccine(s) pending application: {list}.',
    vac_upcoming: 'Upcoming scheduled vaccines: {list}.',
    vac_ok: 'All vaccines are up to date.',
    withdrawal_active: '{n} active withdrawal period(s). Eggs from affected flocks must NOT be sold until: {list}.',
    bio_ok: 'Biosecurity protocols up to date.',
    bio_disinfect: 'Zones pending disinfection: {list}.',
    bio_pests: '{n} unresolved pest sighting(s) reported.',
    bio_cross: 'RISK: Recent visitors from farms with outbreaks: {list}.',
    ops_summary: 'Today: {eggs} eggs collected from {hens} active hens in {flocks} flock(s).',
    henday_excellent: 'Hen-day rate is {pct}% — excellent production performance.',
    henday_good: 'Hen-day rate is {pct}% — good production level.',
    henday_low: 'Hen-day rate is {pct}% — below expected. Check feed, lighting (14-16h), water, and stress factors.',
    henday_critical: 'ALERT: Hen-day at {pct}% — critical. Possible causes: molting, disease, heat stress, nutritional deficiency, or lighting issues.',
    henday_trend_up: 'Upward trend: last 7 days production exceeds monthly average by {pct}%.',
    henday_trend_down: 'Downward trend: last 7 days production is {pct}% below monthly average. Investigate causes.',
    henday_trend_stable: 'Production stable relative to monthly average.',
    fcr_good: 'Feed conversion ratio (FCR) is {v} — efficient (target: <2.2).',
    fcr_normal: 'Feed conversion ratio is {v} — within normal range (2.0-2.5).',
    fcr_high: 'Feed conversion ratio is {v} — elevated. Review feed quality, waste, and unproductive birds.',
    fcr_critical: 'ALERT: FCR at {v} — well above optimal. Profitability lost per kg of feed. Urgent corrective action needed.',
    feed_stock: 'Feed stock: {kg} kg available, estimated for {days} days of operation.',
    feed_low: 'ALERT: Feed stock lasts only {days} days. Schedule purchase immediately.',
    feed_critical: 'CRITICAL: Feed depleted or insufficient for the next 48 hours.',
    env_heat: 'Heat stress detected (THI > 28). Increase ventilation and fresh water. Consider wet curtains.',
    env_cold: 'Temperature below optimal ({temp}°C). Check heating and drafts.',
    env_humidity: 'Humidity outside ideal range ({hum}%). Optimal range: 50-70%.',
    no_data_today: 'No production data recorded today. Record before end of day.',
    fin_income: 'Net income this month: {amount}.',
    fin_positive: 'The operation is profitable this month with a positive margin.',
    fin_negative: 'The operation shows a loss this month. Review costs and selling prices.',
    fin_cpe: 'Cost per egg is {amount}.',
    fin_cpe_high: 'Cost per egg ({amount}) is high. Main cost drivers: feed (60-70%), labor, medications.',
    fin_margin: 'Margin per egg sold: {amount} ({pct}%).',
    fin_receivables: 'Accounts receivable pending: {amount} ({n} invoices).',
    fin_expenses_breakdown: 'Main expenses this month: {list}.',
    sum_good: 'The poultry house operates within normal parameters. No urgent action required.',
    sum_attention: '{n} issue(s) identified that require follow-up this week.',
    sum_critical: '{n} critical situation(s) detected requiring immediate action.',
  }
};

function _t(key, vars) {
  const lang = getLang();
  let s = (_txt[lang] && _txt[lang][key]) || _txt.es[key] || key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => { s = s.replace('{' + k + '}', v); });
  }
  return s;
}

// ── Report Generation ────────────────────────────────────────

/**
 * Generate health section of the farm report.
 * Returns array of { text, severity } objects.
 */
function _healthReport(D, snap) {
  const lines = [];
  const today = todayStr();

  // Overall mortality assessment
  const mort = snap.mortality;
  if (mort < 3) {
    lines.push({ text: _t('mort_normal', { pct: fmtNum(mort, 1) }), severity: 'ok' });
  } else if (mort < 5) {
    lines.push({ text: _t('mort_watch', { pct: fmtNum(mort, 1) }), severity: 'warning' });
  } else {
    lines.push({ text: _t('mort_high', { pct: fmtNum(mort, 1) }), severity: 'danger' });
  }

  // Per-flock mortality detail (only for flocks with issues)
  D.flocks.filter(f => f.status !== 'descarte').forEach(f => {
    const deaths = D.dailyProduction.filter(p => p.flockId === f.id).reduce((s, p) => s + (p.deaths || 0), 0);
    const initial = f.count || f.initialCount || 0;
    const pct = initial > 0 ? (deaths / initial) * 100 : 0;
    if (pct > 3) {
      lines.push({ text: _t('mort_flock', { name: f.name, deaths, initial, pct: fmtNum(pct, 1) }), severity: pct > 5 ? 'danger' : 'warning' });
    }
  });

  // Outbreaks
  const activeOutbreaks = D.outbreaks.filter(o => o.status === 'active');
  if (activeOutbreaks.length > 0) {
    const list = activeOutbreaks.map(o => {
      const f = D.flocks.find(x => x.id === o.flockId);
      return `${o.disease} (${f ? f.name : '?'})`;
    }).join(', ');
    lines.push({ text: _t('outbreak_active', { n: activeOutbreaks.length, list }), severity: 'danger' });
  } else {
    lines.push({ text: _t('outbreak_none'), severity: 'ok' });
  }

  // Vaccines
  const overdueVac = D.vaccines.filter(v => v.status !== 'applied' && v.scheduledDate < today);
  const upcomingVac = D.vaccines.filter(v => v.status !== 'applied' && v.scheduledDate >= today);
  if (overdueVac.length > 0) {
    const list = overdueVac.map(v => {
      const f = D.flocks.find(x => x.id === v.flockId);
      return `${v.vaccineName} (${f ? f.name : '?'}, ${fmtDate(v.scheduledDate)})`;
    }).join(', ');
    lines.push({ text: _t('vac_overdue', { n: overdueVac.length, list }), severity: 'danger' });
  } else if (upcomingVac.length > 0) {
    const list = upcomingVac.slice(0, 3).map(v => {
      const f = D.flocks.find(x => x.id === v.flockId);
      return `${v.vaccineName} (${f ? f.name : ''}, ${fmtDate(v.scheduledDate)})`;
    }).join(', ');
    lines.push({ text: _t('vac_upcoming', { list }), severity: 'info' });
  } else {
    lines.push({ text: _t('vac_ok'), severity: 'ok' });
  }

  // Withdrawal periods
  const activeWith = D.medications.filter(m => m.withdrawalEnd && m.withdrawalEnd >= today);
  if (activeWith.length > 0) {
    const list = activeWith.map(m => {
      const f = D.flocks.find(x => x.id === m.flockId);
      return `${m.name} → ${f ? f.name : ''} (${fmtDate(m.withdrawalEnd)})`;
    }).join(', ');
    lines.push({ text: _t('withdrawal_active', { n: activeWith.length, list }), severity: 'warning' });
  }

  // Biosecurity
  if (D.biosecurity) {
    const overdueZones = D.biosecurity.zones.filter(z => {
      if (!z.lastDisinfection || !z.frequencyDays) return false;
      const next = new Date(z.lastDisinfection + 'T12:00:00');
      next.setDate(next.getDate() + z.frequencyDays);
      return next.toISOString().substring(0, 10) < today;
    });
    if (overdueZones.length > 0) {
      lines.push({ text: _t('bio_disinfect', { list: overdueZones.map(z => z.name).join(', ') }), severity: 'warning' });
    }
    const pests = D.biosecurity.pestSightings.filter(p => !p.resolved).length;
    if (pests > 0) {
      lines.push({ text: _t('bio_pests', { n: pests }), severity: 'warning' });
    }
    const recentCross = D.biosecurity.visitors.filter(v =>
      v.fromFarmHealth === 'outbreak' && v.date >= new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10)
    );
    if (recentCross.length) {
      lines.push({ text: _t('bio_cross', { list: recentCross.map(v => v.name).join(', ') }), severity: 'danger' });
    }
    if (!overdueZones.length && !pests && !recentCross.length) {
      lines.push({ text: _t('bio_ok'), severity: 'ok' });
    }
  }

  return lines;
}

/**
 * Generate operations/production section.
 */
function _opsReport(D, snap) {
  const lines = [];
  const today = todayStr();

  // Today's production summary
  const todayProd = D.dailyProduction.filter(p => p.date === today);
  if (!todayProd.length && D.flocks.filter(f => f.status !== 'descarte').length > 0) {
    lines.push({ text: _t('no_data_today'), severity: 'warning' });
  } else {
    lines.push({ text: _t('ops_summary', { eggs: fmtNum(snap.eggsToday), hens: fmtNum(snap.activeHens), flocks: snap.totalFlocks }), severity: 'info' });
  }

  // Hen-day analysis
  if (snap.activeHens > 0) {
    const hd = snap.henDay;
    if (hd >= 85) {
      lines.push({ text: _t('henday_excellent', { pct: fmtNum(hd, 1) }), severity: 'ok' });
    } else if (hd >= 65) {
      lines.push({ text: _t('henday_good', { pct: fmtNum(hd, 1) }), severity: 'ok' });
    } else if (hd >= 40) {
      lines.push({ text: _t('henday_low', { pct: fmtNum(hd, 1) }), severity: 'warning' });
    } else if (hd > 0) {
      lines.push({ text: _t('henday_critical', { pct: fmtNum(hd, 1) }), severity: 'danger' });
    }

    // 7-day trend vs 30-day average
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const d30s = d30.toISOString().substring(0, 10);
    const dailyEggs = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().substring(0, 10);
      const eggs = D.dailyProduction.filter(p => p.date === ds).reduce((s, p) => s + (p.eggsCollected || 0), 0);
      dailyEggs.push(eggs);
    }
    const trend = _trend7vs30(dailyEggs);
    if (trend !== null) {
      if (trend > 5) {
        lines.push({ text: _t('henday_trend_up', { pct: fmtNum(Math.abs(trend), 1) }), severity: 'ok' });
      } else if (trend < -5) {
        lines.push({ text: _t('henday_trend_down', { pct: fmtNum(Math.abs(trend), 1) }), severity: 'warning' });
      } else {
        lines.push({ text: _t('henday_trend_stable'), severity: 'ok' });
      }
    }
  }

  // FCR analysis
  if (snap.fcr > 0) {
    if (snap.fcr < 2.2) {
      lines.push({ text: _t('fcr_good', { v: fmtNum(snap.fcr, 2) }), severity: 'ok' });
    } else if (snap.fcr <= 2.5) {
      lines.push({ text: _t('fcr_normal', { v: fmtNum(snap.fcr, 2) }), severity: 'ok' });
    } else if (snap.fcr <= 3.0) {
      lines.push({ text: _t('fcr_high', { v: fmtNum(snap.fcr, 2) }), severity: 'warning' });
    } else {
      lines.push({ text: _t('fcr_critical', { v: fmtNum(snap.fcr, 2) }), severity: 'danger' });
    }
  }

  // Feed stock
  const stockDays = _feedStockDays(D);
  const stockKg = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) -
                  D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
  if (stockDays <= 2) {
    lines.push({ text: _t('feed_critical'), severity: 'danger' });
  } else if (stockDays <= 7) {
    lines.push({ text: _t('feed_low', { days: stockDays }), severity: 'warning' });
  } else {
    lines.push({ text: _t('feed_stock', { kg: fmtNum(Math.max(0, stockKg), 1), days: stockDays }), severity: 'ok' });
  }

  // Environment (latest reading)
  const lastEnv = D.environment.length > 0 ? D.environment[D.environment.length - 1] : null;
  if (lastEnv) {
    if (lastEnv.temperature !== null && lastEnv.humidity !== null) {
      const thi = (1.8 * lastEnv.temperature + 32) - (0.55 - 0.0055 * lastEnv.humidity) * (1.8 * lastEnv.temperature - 26);
      if (thi > 28) {
        lines.push({ text: _t('env_heat'), severity: 'danger' });
      }
    }
    if (lastEnv.temperature !== null && lastEnv.temperature < 16) {
      lines.push({ text: _t('env_cold', { temp: lastEnv.temperature }), severity: 'warning' });
    }
    if (lastEnv.humidity !== null && (lastEnv.humidity < 50 || lastEnv.humidity > 70)) {
      lines.push({ text: _t('env_humidity', { hum: lastEnv.humidity }), severity: 'warning' });
    }
  }

  return lines;
}

/**
 * Generate financial section.
 */
function _finReport(D, snap) {
  const lines = [];
  const today = todayStr();
  const mo = today.substring(0, 7);

  // Net income
  const mInc = D.finances.income.filter(i => i.date && i.date.startsWith(mo))
    .reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
  const mExp = D.finances.expenses.filter(e => e.date && e.date.startsWith(mo))
    .reduce((s, e) => s + (e.amount || 0), 0);
  const net = mInc - mExp;

  lines.push({ text: _t('fin_income', { amount: fmtMoney(net) }), severity: net >= 0 ? 'ok' : 'danger' });
  if (net >= 0) {
    lines.push({ text: _t('fin_positive'), severity: 'ok' });
  } else {
    lines.push({ text: _t('fin_negative'), severity: 'danger' });
  }

  // Cost per egg
  if (snap.costPerEgg > 0) {
    const totalEggs = D.dailyProduction.reduce((s, p) => s + (p.eggsCollected || 0), 0);
    // Average selling price per egg
    const totalRevenue = D.finances.income.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    const totalSold = D.finances.income.reduce((s, i) => s + (i.quantity || 0), 0);
    const avgPrice = totalSold > 0 ? totalRevenue / totalSold : 0;

    if (avgPrice > 0 && snap.costPerEgg > avgPrice * 0.8) {
      lines.push({ text: _t('fin_cpe_high', { amount: fmtMoney(snap.costPerEgg) }), severity: 'warning' });
    } else {
      lines.push({ text: _t('fin_cpe', { amount: fmtMoney(snap.costPerEgg) }), severity: 'ok' });
    }

    // Margin per egg
    if (avgPrice > 0) {
      const margin = avgPrice - snap.costPerEgg;
      const marginPct = (margin / avgPrice) * 100;
      lines.push({ text: _t('fin_margin', { amount: fmtMoney(margin), pct: fmtNum(marginPct, 1) }), severity: margin > 0 ? 'ok' : 'danger' });
    }
  }

  // Accounts receivable
  if (D.finances.receivables) {
    const pending = D.finances.receivables.filter(r => r.status !== 'paid');
    if (pending.length > 0) {
      const total = pending.reduce((s, r) => s + (r.amount || 0), 0);
      lines.push({ text: _t('fin_receivables', { amount: fmtMoney(total), n: pending.length }), severity: total > net * 0.5 ? 'warning' : 'info' });
    }
  }

  // Expense breakdown (top categories this month)
  const monthExp = D.finances.expenses.filter(e => e.date && e.date.startsWith(mo));
  if (monthExp.length > 0) {
    const byCat = {};
    monthExp.forEach(e => {
      const cat = e.category || e.type || 'other';
      byCat[cat] = (byCat[cat] || 0) + (e.amount || 0);
    });
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (sorted.length > 0) {
      const list = sorted.map(([cat, amt]) => `${cat}: ${fmtMoney(amt)}`).join(', ');
      lines.push({ text: _t('fin_expenses_breakdown', { list }), severity: 'info' });
    }
  }

  return lines;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Generate the complete farm status report.
 * Returns { date, health[], ops[], fin[], summary, criticalCount, warningCount }
 * Each section entry: { text: string, severity: 'ok'|'info'|'warning'|'danger' }
 */
export function generateFarmReport(D) {
  if (!D) D = Store.get();
  const snap = computeKpiSnapshot();

  const health = _healthReport(D, snap);
  const ops = _opsReport(D, snap);
  const fin = _finReport(D, snap);

  const all = [...health, ...ops, ...fin];
  const criticalCount = all.filter(l => l.severity === 'danger').length;
  const warningCount = all.filter(l => l.severity === 'warning').length;

  let summary;
  if (criticalCount > 0) {
    summary = { text: _t('sum_critical', { n: criticalCount }), severity: 'danger' };
  } else if (warningCount > 0) {
    summary = { text: _t('sum_attention', { n: warningCount }), severity: 'warning' };
  } else {
    summary = { text: _t('sum_good'), severity: 'ok' };
  }

  // Overall header
  const dangerCount = all.filter(l => l.severity === 'danger').length;
  let headerKey;
  if (dangerCount > 0) headerKey = 'health_critical';
  else if (warningCount > 0) headerKey = 'health_concern';
  else if (health.some(l => l.severity === 'warning')) headerKey = 'health_good';
  else headerKey = 'health_excellent';

  return {
    date: todayStr(),
    healthHeader: _t(headerKey),
    health,
    ops,
    fin,
    summary,
    criticalCount,
    warningCount
  };
}
