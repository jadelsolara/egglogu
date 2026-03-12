// ══════════════════════════════════════════════════════════════
// EGGlogU — Smart Historical Data Import Wizard
// Imports data from external systems or old backups, analyzes it,
// maps columns intelligently, validates, and loads into the system.
// ══════════════════════════════════════════════════════════════

import { Bus, Store, t, sanitizeHTML, escapeAttr } from '../core/index.js';

// ── Module definitions ──────────────────────────────────────────
const MODULES = {
  clients:    { icon: '👥', storeKey: 'clients',    reqFields: ['name'] },
  flocks:     { icon: '🐔', storeKey: 'flocks',     reqFields: ['name', 'initialCount'] },
  production: { icon: '🥚', storeKey: 'dailyProduction', reqFields: ['date', 'eggs'] },
  feed:       { icon: '🌾', storeKey: 'feed',       reqFields: ['date', 'quantity'], nested: 'purchases' },
  health:     { icon: '💉', storeKey: 'vaccines',   reqFields: ['vaccine', 'date'] },
  finances_income:  { icon: '💰', storeKey: 'finances', reqFields: ['date', 'amount'], nested: 'income' },
  finances_expense: { icon: '📉', storeKey: 'finances', reqFields: ['date', 'amount'], nested: 'expenses' },
  orders:     { icon: '📦', storeKey: 'orders',     reqFields: ['date', 'client'] },
};

// ── Fuzzy field maps (bilingual ES/EN) ───────────────────────────
const FIELD_MAPS = {
  clients: {
    name:      ['nombre','name','cliente','client','razon_social','razon social','company','empresa','nombres'],
    phone:     ['telefono','phone','tel','celular','mobile','fono','movil','contacto'],
    email:     ['correo','email','e-mail','mail','correo_electronico','e_mail'],
    rut:       ['rut','tax_id','taxid','id_fiscal','dni','nit','cuit','rfc','cedula','id','identificacion','ci'],
    address:   ['direccion','address','domicilio','dir','calle','street'],
    route:     ['ruta','route','zona','zone','sector','area','region'],
    notes:     ['notas','notes','observaciones','comentarios','comments','obs'],
    priceS:    ['precio_s','price_s','small','pequeño','precio_pequeño','s'],
    priceM:    ['precio_m','price_m','medium','mediano','precio_mediano','m'],
    priceL:    ['precio_l','price_l','large','grande','precio_grande','l'],
    priceXL:   ['precio_xl','price_xl','extra_large','xl','precio_xl'],
    priceJumbo:['precio_jumbo','price_jumbo','jumbo','precio_jumbo','j'],
  },
  flocks: {
    name:         ['nombre','name','lote','flock','galpon','batch','galpón','id_lote'],
    breed:        ['raza','breed','linea','line','genetics','genética','variedad'],
    initialCount: ['cantidad','count','initial','aves','birds','cantidad_inicial','total_aves','cabezas','inicial'],
    birthDate:    ['nacimiento','birth','birthdate','fecha_nacimiento','hatch_date','fecha_nac','nac'],
    purchaseDate: ['compra','purchase','fecha_compra','purchase_date','ingreso','fecha_ingreso','entrada'],
    supplier:     ['proveedor','supplier','vendor','origen'],
    cost:         ['costo','cost','precio','price','valor','inversion','inversión'],
    notes:        ['notas','notes','observaciones','obs'],
  },
  production: {
    date:     ['fecha','date','dia','day','periodo','period'],
    flock:    ['lote','flock','galpon','galpón','batch','id_lote','nombre_lote'],
    eggs:     ['huevos','eggs','produccion','production','total','cantidad','total_huevos','recoleccion','recolección'],
    broken:   ['rotos','broken','defectuosos','defective','descarte','quiebre','rotura'],
    sizeS:    ['pequeño','small','s','size_s','chico'],
    sizeM:    ['mediano','medium','m','size_m'],
    sizeL:    ['grande','large','l','size_l'],
    sizeXL:   ['extra_grande','extra_large','xl','size_xl'],
    sizeJumbo:['jumbo','size_jumbo','super'],
    deaths:   ['muertes','deaths','mortality','mortalidad','bajas','decesos'],
  },
  feed: {
    date:     ['fecha','date','dia','day'],
    type:     ['tipo','type','alimento','feed','producto','nombre'],
    quantity: ['cantidad','quantity','kg','kilos','peso','weight','volumen'],
    cost:     ['costo','cost','precio','price','valor','total'],
    supplier: ['proveedor','supplier','vendor'],
    flock:    ['lote','flock','galpon','galpón','destino'],
  },
  health: {
    vaccine:  ['vacuna','vaccine','producto','product','nombre','name','medicamento','medication'],
    date:     ['fecha','date','fecha_aplicacion','applied_date','aplicacion','application'],
    flock:    ['lote','flock','galpon','galpón'],
    batch:    ['lote_vacuna','batch','serie','serial'],
    route:    ['via','route','vía','administracion','ruta'],
    notes:    ['notas','notes','observaciones','obs'],
  },
  finances_income: {
    date:        ['fecha','date','dia','day'],
    amount:      ['monto','amount','valor','value','total','ingreso','income'],
    type:        ['tipo','type','concepto','concept','categoria','category'],
    description: ['descripcion','description','detalle','detail','nota','note'],
    client:      ['cliente','client','comprador','buyer'],
  },
  finances_expense: {
    date:        ['fecha','date','dia','day'],
    amount:      ['monto','amount','valor','value','total','gasto','expense'],
    category:    ['categoria','category','tipo','type','concepto','concept','rubro'],
    description: ['descripcion','description','detalle','detail','nota','note'],
  },
  orders: {
    date:    ['fecha','date','fecha_orden','order_date','fecha_venta'],
    client:  ['cliente','client','comprador','buyer','nombre'],
    total:   ['total','monto','amount','valor','value'],
    status:  ['estado','status'],
    notes:   ['notas','notes','observaciones','obs','detalle'],
  },
};

// ── Date format patterns ─────────────────────────────────────────
const DATE_PATTERNS = [
  { regex: /^\d{4}-\d{2}-\d{2}$/, format: 'YYYY-MM-DD', parse: s => s },
  { regex: /^\d{2}\/\d{2}\/\d{4}$/, format: 'DD/MM/YYYY', parse: s => { const p=s.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; }},
  { regex: /^\d{2}-\d{2}-\d{4}$/, format: 'DD-MM-YYYY', parse: s => { const p=s.split('-'); return `${p[2]}-${p[1]}-${p[0]}`; }},
  { regex: /^\d{1,2}\/\d{1,2}\/\d{4}$/, format: 'D/M/YYYY', parse: s => { const p=s.split('/'); return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; }},
  { regex: /^\d{1,2}\/\d{1,2}\/\d{2}$/, format: 'D/M/YY', parse: s => { const p=s.split('/'); const y=parseInt(p[2]); return `${y>50?'19':'20'}${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; }},
  { regex: /^\d{4}\/\d{2}\/\d{2}$/, format: 'YYYY/MM/DD', parse: s => s.replace(/\//g,'-') },
];

// ── CSV Parser ───────────────────────────────────────────────────
function detectDelimiter(text) {
  const firstLine = text.split('\n')[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of firstLine) { if (ch in counts) counts[ch]++; }
  return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
}

function parseCSV(text, delimiter) {
  const rows = [];
  let row = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === delimiter) { row.push(field.trim()); field = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i+1] === '\n')) {
        if (ch === '\r') i++;
        row.push(field.trim()); field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

// ── Fuzzy Match ──────────────────────────────────────────────────
function normalize(s) { return (s||'').toLowerCase().replace(/[^a-z0-9áéíóúñü]/g,'').replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i').replace(/[óò]/g,'o').replace(/[úù]/g,'u').replace(/ñ/g,'n'); }

function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  // Simple Levenshtein ratio
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({length:m+1}, (_,i) => {
    const r = new Array(n+1);
    r[0] = i;
    return r;
  });
  for (let j=1;j<=n;j++) d[0][j]=j;
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return 1 - d[m][n] / Math.max(m, n);
}

function autoMapColumns(headers, moduleKey) {
  const fieldMap = FIELD_MAPS[moduleKey] || {};
  const mapping = {}; // headerIndex → { field, confidence }
  const usedFields = new Set();

  headers.forEach((header, idx) => {
    let bestField = null, bestScore = 0;
    for (const [field, aliases] of Object.entries(fieldMap)) {
      if (usedFields.has(field)) continue;
      for (const alias of aliases) {
        const score = similarity(header, alias);
        if (score > bestScore) { bestScore = score; bestField = field; }
      }
    }
    if (bestField && bestScore >= 0.6) {
      mapping[idx] = { field: bestField, confidence: bestScore };
      usedFields.add(bestField);
    }
  });
  return mapping;
}

// ── Date detection ───────────────────────────────────────────────
function detectDateFormat(values) {
  for (const pat of DATE_PATTERNS) {
    const matches = values.filter(v => v && pat.regex.test(v.trim())).length;
    if (matches >= values.length * 0.5) return pat;
  }
  return DATE_PATTERNS[0]; // default ISO
}

function parseDate(value, pattern) {
  if (!value) return null;
  const v = value.trim();
  try { return pattern.parse(v); } catch { return v; }
}

// ── Validation ───────────────────────────────────────────────────
function validateRow(row, moduleKey, mapping, headers, datePat) {
  const mod = MODULES[moduleKey];
  const errors = [];
  const mapped = {};

  for (const [idxStr, m] of Object.entries(mapping)) {
    const idx = parseInt(idxStr);
    let val = row[idx] || '';
    // Parse dates
    if (['date','birthDate','purchaseDate'].includes(m.field) && val) {
      val = parseDate(val, datePat) || val;
    }
    // Parse numbers
    if (['eggs','broken','sizeS','sizeM','sizeL','sizeXL','sizeJumbo','deaths','initialCount','quantity','cost','amount','total','priceS','priceM','priceL','priceXL','priceJumbo'].includes(m.field) && val) {
      const n = parseFloat(val.replace(/[^0-9.,\-]/g,'').replace(',','.'));
      val = isNaN(n) ? val : n;
    }
    mapped[m.field] = val;
  }

  // Check required fields
  for (const req of (mod.reqFields || [])) {
    if (!mapped[req] && mapped[req] !== 0) {
      errors.push(t('imp_missing_field') + ': ' + req);
    }
  }

  return { mapped, errors };
}

// ── Generate unique ID ──────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,6); }

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

class EggDataImport extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._step = 0; // 0=hidden, 1=module+upload, 2=mapping, 3=preview, 4=report
    this._module = '';
    this._rawData = [];
    this._headers = [];
    this._mapping = {};
    this._datePat = DATE_PATTERNS[0];
    this._validated = [];
    this._imported = [];
    this._skipped = [];
    this._unmappedCols = [];
  }

  connectedCallback() {
    Bus.on('show:data-import', () => this._open());
    this.render();
  }

  _open() {
    this._step = 1;
    this._module = '';
    this._rawData = [];
    this._headers = [];
    this._mapping = {};
    this._validated = [];
    this._imported = [];
    this._skipped = [];
    this._unmappedCols = [];
    this.render();
  }

  _close() {
    this._step = 0;
    this.render();
  }

  render() {
    if (this._step === 0) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const steps = [
      { n: 1, label: t('imp_step_select') },
      { n: 2, label: t('imp_step_map') },
      { n: 3, label: t('imp_step_preview') },
      { n: 4, label: t('imp_step_report') },
    ];

    this.shadowRoot.innerHTML = `
<style>
:host { display:block; }
.overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px }
.wizard { background:var(--bg,#fff);border-radius:12px;width:100%;max-width:900px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3) }
.wizard-header { padding:20px 24px;border-bottom:1px solid var(--border,#e0e0e0);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#0E2240,#1565C0);color:#fff }
.wizard-header h2 { margin:0;font-size:18px }
.close-btn { background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px 8px;border-radius:4px }
.close-btn:hover { background:rgba(255,255,255,.15) }
.steps { display:flex;gap:0;padding:0 24px;border-bottom:1px solid var(--border,#e0e0e0);background:var(--bg-alt,#f8f9fa) }
.step { flex:1;padding:12px 8px;text-align:center;font-size:12px;color:var(--text-light,#888);position:relative }
.step.active { color:#1565C0;font-weight:600 }
.step.done { color:#4CAF50 }
.step::after { content:'';position:absolute;bottom:0;left:20%;right:20%;height:3px;border-radius:2px;background:transparent }
.step.active::after { background:#1565C0 }
.step.done::after { background:#4CAF50 }
.step-num { display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:50%;border:2px solid currentColor;font-size:11px;margin-right:4px;font-weight:700 }
.step.done .step-num { background:#4CAF50;color:#fff;border-color:#4CAF50 }
.step.active .step-num { background:#1565C0;color:#fff;border-color:#1565C0 }
.wizard-body { flex:1;overflow-y:auto;padding:24px }
.wizard-footer { padding:16px 24px;border-top:1px solid var(--border,#e0e0e0);display:flex;justify-content:space-between;gap:12px }
.btn { padding:8px 20px;border-radius:6px;border:none;cursor:pointer;font-size:14px;font-weight:500;transition:.15s }
.btn-primary { background:#1565C0;color:#fff } .btn-primary:hover { background:#0d47a1 }
.btn-secondary { background:#e0e0e0;color:#333 } .btn-secondary:hover { background:#ccc }
.btn-success { background:#4CAF50;color:#fff } .btn-success:hover { background:#388E3C }
.btn-danger { background:#F44336;color:#fff }
.btn:disabled { opacity:.5;cursor:not-allowed }

.module-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px }
.module-card { border:2px solid var(--border,#e0e0e0);border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:.2s }
.module-card:hover { border-color:#1565C0;background:rgba(21,101,192,.05) }
.module-card.selected { border-color:#1565C0;background:rgba(21,101,192,.1) }
.module-card .icon { font-size:28px;margin-bottom:6px }
.module-card .label { font-size:13px;font-weight:600 }

.drop-zone { border:2px dashed var(--border,#ccc);border-radius:12px;padding:40px;text-align:center;cursor:pointer;transition:.2s;margin-top:16px }
.drop-zone:hover,.drop-zone.dragover { border-color:#1565C0;background:rgba(21,101,192,.05) }
.drop-zone .icon { font-size:40px;margin-bottom:8px;opacity:.6 }
.drop-zone p { margin:4px 0;color:var(--text-light,#888);font-size:13px }

.map-table { width:100%;border-collapse:collapse;font-size:13px }
.map-table th { text-align:left;padding:8px 10px;background:var(--bg-alt,#f5f5f5);border-bottom:2px solid var(--border,#e0e0e0);font-size:12px }
.map-table td { padding:8px 10px;border-bottom:1px solid var(--border,#eee) }
.map-table select { width:100%;padding:6px;border-radius:4px;border:1px solid var(--border,#ccc);font-size:13px }
.confidence { display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px }
.conf-high { background:#4CAF50 } .conf-med { background:#FFA726 } .conf-low { background:#F44336 }

.preview-table { width:100%;border-collapse:collapse;font-size:12px;overflow-x:auto }
.preview-table th { background:var(--bg-alt,#f5f5f5);padding:6px 8px;text-align:left;border-bottom:2px solid var(--border,#ddd);white-space:nowrap }
.preview-table td { padding:6px 8px;border-bottom:1px solid var(--border,#eee);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.preview-table tr.error { background:rgba(244,67,54,.08) }
.preview-table tr.ok { background:rgba(76,175,80,.04) }

.stat-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px }
.stat-card { padding:16px;border-radius:8px;text-align:center;border:1px solid var(--border,#e0e0e0) }
.stat-card .num { font-size:28px;font-weight:700;line-height:1.2 }
.stat-card .lbl { font-size:12px;color:var(--text-light,#888);margin-top:2px }

.tag { display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600 }
.tag-ok { background:rgba(76,175,80,.15);color:#2E7D32 }
.tag-err { background:rgba(244,67,54,.15);color:#C62828 }
.tag-warn { background:rgba(255,167,38,.15);color:#E65100 }
.tag-skip { background:rgba(0,0,0,.08);color:#666 }

.report-section { margin-bottom:20px }
.report-section h4 { margin:0 0 8px;font-size:14px }
.report-list { list-style:none;padding:0;margin:0;font-size:13px }
.report-list li { padding:6px 8px;border-bottom:1px solid var(--border,#eee);display:flex;align-items:center;gap:8px }

.file-info { display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-alt,#f5f5f5);border-radius:8px;margin-top:12px }
.file-info .fi-icon { font-size:24px }
.file-info .fi-name { font-weight:600;font-size:14px }
.file-info .fi-meta { font-size:12px;color:var(--text-light,#888) }

.progress-bar { width:100%;height:8px;background:var(--border,#e0e0e0);border-radius:4px;overflow:hidden;margin:16px 0 }
.progress-fill { height:100%;background:linear-gradient(90deg,#1565C0,#4CAF50);border-radius:4px;transition:width .3s }

.alert { padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px }
.alert-info { background:rgba(21,101,192,.08);border-left:3px solid #1565C0 }
.alert-warn { background:rgba(255,167,38,.1);border-left:3px solid #FFA726 }
</style>

<div class="overlay">
<div class="wizard">
  <div class="wizard-header">
    <h2>📥 ${t('imp_title')}</h2>
    <button class="close-btn" data-action="close">&times;</button>
  </div>
  <div class="steps">
    ${steps.map(s => `<div class="step ${s.n === this._step ? 'active' : s.n < this._step ? 'done' : ''}"><span class="step-num">${s.n < this._step ? '✓' : s.n}</span>${s.label}</div>`).join('')}
  </div>
  <div class="wizard-body">${this._renderStep()}</div>
  <div class="wizard-footer">${this._renderFooter()}</div>
</div>
</div>`;

    this._bindEvents();
  }

  // ── Step renderers ─────────────────────────────────────────────

  _renderStep() {
    switch (this._step) {
      case 1: return this._renderStep1();
      case 2: return this._renderStep2();
      case 3: return this._renderStep3();
      case 4: return this._renderStep4();
      default: return '';
    }
  }

  // Step 1: Module selection + file upload
  _renderStep1() {
    const mods = [
      ['clients', t('cli_title')],
      ['flocks', t('flock_title')],
      ['production', t('prod_title')],
      ['feed', t('feed_title')],
      ['health', t('san_vaccines')],
      ['finances_income', t('fin_income')],
      ['finances_expense', t('fin_expenses')],
      ['orders', t('ord_tab')],
    ];
    return `
<div class="alert alert-info">
  <strong>${t('imp_info_title')}</strong><br>
  ${t('imp_info_desc')}
</div>
<h3 style="margin:0 0 12px;font-size:15px">${t('imp_select_module')}</h3>
<div class="module-grid">
  ${mods.map(([key, label]) => `<div class="module-card ${this._module===key?'selected':''}" data-module="${key}"><div class="icon">${MODULES[key].icon}</div><div class="label">${label}</div></div>`).join('')}
</div>
${this._module ? `
<h3 style="margin:16px 0 8px;font-size:15px">${t('imp_upload_file')}</h3>
<div class="drop-zone" id="drop-zone">
  <div class="icon">📄</div>
  <p><strong>${t('imp_drop_here')}</strong></p>
  <p>${t('imp_formats')}</p>
  <input type="file" id="file-input" accept=".csv,.tsv,.txt,.json" style="display:none">
</div>
${this._headers.length ? `
<div class="file-info">
  <div class="fi-icon">✅</div>
  <div>
    <div class="fi-name">${sanitizeHTML(this._fileName || '')}</div>
    <div class="fi-meta">${this._rawData.length} ${t('imp_rows_detected')} · ${this._headers.length} ${t('imp_cols_detected')} · ${t('imp_delimiter')}: "${this._detectedDelimiter === '\t' ? 'TAB' : sanitizeHTML(this._detectedDelimiter || ',')}"</div>
  </div>
</div>` : ''}` : ''}`;
  }

  // Step 2: Column mapping
  _renderStep2() {
    const fieldMap = FIELD_MAPS[this._module] || {};
    const allFields = Object.keys(fieldMap);
    const mod = MODULES[this._module];

    return `
<div class="alert alert-info">${t('imp_map_desc')}</div>
<div style="overflow-x:auto">
<table class="map-table">
  <thead><tr>
    <th>${t('imp_col_original')}</th>
    <th>${t('imp_col_sample')}</th>
    <th>${t('imp_col_maps_to')}</th>
    <th>${t('imp_col_confidence')}</th>
  </tr></thead>
  <tbody>
    ${this._headers.map((h, i) => {
      const m = this._mapping[i];
      const sample = (this._rawData[0] && this._rawData[0][i]) || '';
      const confClass = m ? (m.confidence >= 0.8 ? 'conf-high' : m.confidence >= 0.6 ? 'conf-med' : 'conf-low') : '';
      const confPct = m ? Math.round(m.confidence * 100) + '%' : '';
      return `<tr>
        <td><strong>${sanitizeHTML(h)}</strong></td>
        <td style="color:var(--text-light,#888);max-width:200px;overflow:hidden;text-overflow:ellipsis">${sanitizeHTML(String(sample).substring(0, 60))}</td>
        <td>
          <select data-col="${i}">
            <option value="">— ${t('imp_skip_col')} —</option>
            ${allFields.map(f => `<option value="${f}" ${m && m.field===f ? 'selected' : ''}>${f} ${(mod.reqFields||[]).includes(f) ? '*' : ''}</option>`).join('')}
          </select>
        </td>
        <td>${m ? `<span class="confidence ${confClass}"></span>${confPct}` : `<span class="tag tag-skip">${t('imp_unmapped')}</span>`}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>
</div>
<div style="margin-top:12px;font-size:12px;color:var(--text-light,#888)">* = ${t('imp_required_field')}</div>`;
  }

  // Step 3: Preview + validation
  _renderStep3() {
    this._runValidation();
    const ok = this._validated.filter(r => r.errors.length === 0);
    const err = this._validated.filter(r => r.errors.length > 0);
    const mappedFields = Object.values(this._mapping).map(m => m.field);
    const unmapped = this._headers.filter((_, i) => !this._mapping[i]);

    // Duplicate detection
    const D = Store.get();
    const dupCount = this._detectDuplicates(ok.map(r => r.mapped), D);

    return `
<div class="stat-grid">
  <div class="stat-card"><div class="num" style="color:#1565C0">${this._rawData.length}</div><div class="lbl">${t('imp_total_rows')}</div></div>
  <div class="stat-card"><div class="num" style="color:#4CAF50">${ok.length}</div><div class="lbl">${t('imp_valid_rows')}</div></div>
  <div class="stat-card"><div class="num" style="color:#F44336">${err.length}</div><div class="lbl">${t('imp_error_rows')}</div></div>
  <div class="stat-card"><div class="num" style="color:#FFA726">${dupCount}</div><div class="lbl">${t('imp_duplicates')}</div></div>
</div>

<div class="stat-grid">
  <div class="stat-card"><div class="num" style="color:#1565C0">${mappedFields.length}</div><div class="lbl">${t('imp_mapped_cols')}</div></div>
  <div class="stat-card"><div class="num" style="color:#888">${unmapped.length}</div><div class="lbl">${t('imp_unmapped_cols')}</div></div>
</div>

${unmapped.length ? `<div class="alert alert-warn"><strong>${t('imp_unmapped_warning')}:</strong> ${unmapped.map(h => sanitizeHTML(h)).join(', ')}<br><small>${t('imp_unmapped_note')}</small></div>` : ''}

${err.length ? `
<div class="report-section">
  <h4 style="color:#F44336">${t('imp_errors_detail')}</h4>
  <div style="max-height:200px;overflow-y:auto">
  <table class="preview-table">
    <thead><tr><th>${t('imp_row')}</th><th>${t('imp_error')}</th><th>${t('imp_data')}</th></tr></thead>
    <tbody>
    ${err.slice(0, 50).map((r, i) => `<tr class="error">
      <td>#${r.rowNum}</td>
      <td>${r.errors.map(e => `<span class="tag tag-err">${sanitizeHTML(e)}</span>`).join(' ')}</td>
      <td style="font-size:11px">${Object.entries(r.mapped).filter(([,v])=>v).slice(0,3).map(([k,v])=>`${k}: ${sanitizeHTML(String(v).substring(0,30))}`).join(', ')}</td>
    </tr>`).join('')}
    ${err.length > 50 ? `<tr><td colspan="3" style="text-align:center;color:var(--text-light,#888)">... ${t('imp_and_more').replace('{n}', err.length - 50)}</td></tr>` : ''}
    </tbody>
  </table>
  </div>
</div>` : ''}

<div class="report-section">
  <h4>${t('imp_preview_data')}</h4>
  <div style="overflow-x:auto;max-height:300px">
  <table class="preview-table">
    <thead><tr>${mappedFields.map(f => `<th>${f}</th>`).join('')}<th>${t('status')}</th></tr></thead>
    <tbody>
    ${ok.slice(0, 20).map(r => `<tr class="ok">
      ${mappedFields.map(f => `<td>${sanitizeHTML(String(r.mapped[f] ?? ''))}</td>`).join('')}
      <td><span class="tag tag-ok">OK</span></td>
    </tr>`).join('')}
    ${ok.length > 20 ? `<tr><td colspan="${mappedFields.length+1}" style="text-align:center;color:var(--text-light,#888)">... ${ok.length - 20} ${t('imp_more_rows')}</td></tr>` : ''}
    </tbody>
  </table>
  </div>
</div>`;
  }

  // Step 4: Import report
  _renderStep4() {
    return `
<div style="text-align:center;margin-bottom:24px">
  <div style="font-size:48px;margin-bottom:8px">${this._importError ? '❌' : '✅'}</div>
  <h3 style="margin:0">${this._importError ? t('imp_failed') : t('imp_success')}</h3>
</div>

<div class="stat-grid">
  <div class="stat-card"><div class="num" style="color:#4CAF50">${this._imported.length}</div><div class="lbl">${t('imp_imported')}</div></div>
  <div class="stat-card"><div class="num" style="color:#F44336">${this._skipped.length}</div><div class="lbl">${t('imp_skipped')}</div></div>
  <div class="stat-card"><div class="num" style="color:#FFA726">${this._dupsSkipped || 0}</div><div class="lbl">${t('imp_dups_skipped')}</div></div>
</div>

${this._imported.length ? `
<div class="report-section">
  <h4 style="color:#4CAF50">${t('imp_imported_detail')}</h4>
  <p style="font-size:13px;color:var(--text-light,#888)">${t('imp_imported_note')}</p>
  <div style="max-height:200px;overflow-y:auto">
  <table class="preview-table">
    <thead><tr><th>#</th>${Object.keys(this._imported[0]||{}).filter(k=>k!=='id'&&k!=='_imported'&&k!=='_importDate').slice(0,5).map(k=>`<th>${k}</th>`).join('')}</tr></thead>
    <tbody>
    ${this._imported.slice(0, 15).map((r, i) => `<tr class="ok"><td>${i+1}</td>${Object.entries(r).filter(([k])=>k!=='id'&&k!=='_imported'&&k!=='_importDate').slice(0,5).map(([,v])=>`<td>${sanitizeHTML(String(v??'').substring(0,40))}</td>`).join('')}</tr>`).join('')}
    ${this._imported.length > 15 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-light,#888)">... +${this._imported.length - 15}</td></tr>` : ''}
    </tbody>
  </table>
  </div>
</div>` : ''}

${this._skipped.length ? `
<div class="report-section">
  <h4 style="color:#F44336">${t('imp_skipped_detail')}</h4>
  <ul class="report-list">
    ${this._skipped.slice(0, 20).map(s => `<li><span class="tag tag-err">${t('imp_row')} #${s.rowNum}</span> ${s.errors.map(e => sanitizeHTML(e)).join(', ')}</li>`).join('')}
    ${this._skipped.length > 20 ? `<li style="color:var(--text-light,#888)">... +${this._skipped.length - 20}</li>` : ''}
  </ul>
</div>` : ''}

${this._unmappedCols.length ? `
<div class="report-section">
  <h4 style="color:#888">${t('imp_unmapped_report')}</h4>
  <p style="font-size:13px;color:var(--text-light,#888)">${t('imp_unmapped_report_note')}</p>
  <div style="display:flex;flex-wrap:wrap;gap:6px">
    ${this._unmappedCols.map(c => `<span class="tag tag-skip">${sanitizeHTML(c)}</span>`).join('')}
  </div>
</div>` : ''}`;
  }

  // ── Footer ─────────────────────────────────────────────────────

  _renderFooter() {
    switch (this._step) {
      case 1:
        return `<button class="btn btn-secondary" data-action="close">${t('cancel')}</button>
                <button class="btn btn-primary" data-action="next" ${!this._headers.length ? 'disabled' : ''}>${t('imp_next')} →</button>`;
      case 2:
        return `<button class="btn btn-secondary" data-action="prev">← ${t('imp_back')}</button>
                <button class="btn btn-primary" data-action="next">${t('imp_next')} →</button>`;
      case 3:
        const okCount = this._validated.filter(r => r.errors.length === 0).length;
        return `<button class="btn btn-secondary" data-action="prev">← ${t('imp_back')}</button>
                <button class="btn btn-success" data-action="import" ${!okCount ? 'disabled' : ''}>${t('imp_execute')} (${okCount} ${t('imp_records')})</button>`;
      case 4:
        return `<button class="btn btn-primary" data-action="close">${t('imp_done')}</button>`;
      default:
        return '';
    }
  }

  // ── Event binding ──────────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) {
        // Module card click
        const card = e.target.closest('[data-module]');
        if (card) {
          this._module = card.dataset.module;
          this._rawData = []; this._headers = []; this._mapping = {};
          this.render();
        }
        return;
      }

      switch (btn.dataset.action) {
        case 'close': this._close(); break;
        case 'next': this._nextStep(); break;
        case 'prev': this._prevStep(); break;
        case 'import': this._executeImport(); break;
      }
    });

    // File drop zone
    const dz = root.getElementById('drop-zone');
    if (dz) {
      dz.addEventListener('click', () => root.getElementById('file-input')?.click());
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files[0]) this._handleFile(e.dataTransfer.files[0]); });
    }

    const fi = root.getElementById('file-input');
    if (fi) fi.addEventListener('change', (e) => { if (e.target.files[0]) this._handleFile(e.target.files[0]); });

    // Column mapping selects
    root.querySelectorAll('select[data-col]').forEach(sel => {
      sel.addEventListener('change', () => {
        const col = parseInt(sel.dataset.col);
        if (sel.value) {
          this._mapping[col] = { field: sel.value, confidence: 1 };
        } else {
          delete this._mapping[col];
        }
      });
    });
  }

  // ── File handling ──────────────────────────────────────────────

  _handleFile(file) {
    this._fileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let text = reader.result;
        // Remove BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

        if (file.name.endsWith('.json')) {
          this._parseJSON(text);
        } else {
          this._parseCSVFile(text);
        }
        this.render();
      } catch (err) {
        Bus.emit('toast', { msg: t('imp_parse_error') + ': ' + err.message, type: 'error' });
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  _parseCSVFile(text) {
    const delimiter = detectDelimiter(text);
    this._detectedDelimiter = delimiter;
    const rows = parseCSV(text, delimiter);
    if (rows.length < 2) throw new Error('Not enough rows');
    this._headers = rows[0];
    this._rawData = rows.slice(1);
    this._mapping = autoMapColumns(this._headers, this._module);

    // Detect date format from data
    const dateFields = Object.entries(this._mapping).filter(([,m]) => ['date','birthDate','purchaseDate'].includes(m.field));
    if (dateFields.length) {
      const colIdx = parseInt(dateFields[0][0]);
      const dateValues = this._rawData.map(r => r[colIdx]).filter(Boolean).slice(0, 20);
      this._datePat = detectDateFormat(dateValues);
    }
  }

  _parseJSON(text) {
    const data = JSON.parse(text);
    let rows;

    if (Array.isArray(data)) {
      rows = data;
    } else if (data._meta && typeof data === 'object') {
      // EGGlogU backup format
      const mod = MODULES[this._module];
      if (mod.nested) {
        rows = (data[mod.storeKey] && data[mod.storeKey][mod.nested]) || [];
      } else {
        rows = data[mod.storeKey] || [];
      }
    } else {
      // Try first array property
      const arrKey = Object.keys(data).find(k => Array.isArray(data[k]));
      rows = arrKey ? data[arrKey] : [];
    }

    if (!rows.length) throw new Error('No data found');

    // Convert to tabular format
    const allKeys = new Set();
    rows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
    this._headers = [...allKeys].filter(k => k !== 'id' && !k.startsWith('_'));
    this._rawData = rows.map(r => this._headers.map(h => r[h] != null ? String(r[h]) : ''));
    this._mapping = autoMapColumns(this._headers, this._module);
    this._detectedDelimiter = 'JSON';

    // Detect date format
    const dateFields = Object.entries(this._mapping).filter(([,m]) => ['date','birthDate','purchaseDate'].includes(m.field));
    if (dateFields.length) {
      const colIdx = parseInt(dateFields[0][0]);
      const dateValues = this._rawData.map(r => r[colIdx]).filter(Boolean).slice(0, 20);
      this._datePat = detectDateFormat(dateValues);
    }
  }

  // ── Validation ─────────────────────────────────────────────────

  _runValidation() {
    this._validated = this._rawData.map((row, i) => {
      const result = validateRow(row, this._module, this._mapping, this._headers, this._datePat);
      return { ...result, rowNum: i + 2 }; // +2 = 1-indexed + header row
    });
  }

  _detectDuplicates(mappedRows, D) {
    const mod = MODULES[this._module];
    let existing = [];
    if (mod.nested) {
      existing = (D[mod.storeKey] && D[mod.storeKey][mod.nested]) || [];
    } else {
      existing = D[mod.storeKey] || [];
    }

    let dupCount = 0;
    if (this._module === 'clients') {
      const existingRuts = new Set(existing.map(c => normalize(c.rut || '')).filter(Boolean));
      const existingNames = new Set(existing.map(c => normalize(c.name || '')));
      mappedRows.forEach(r => {
        if (r.rut && existingRuts.has(normalize(r.rut))) dupCount++;
        else if (r.name && existingNames.has(normalize(r.name))) dupCount++;
      });
    } else if (this._module === 'production') {
      const existingKeys = new Set(existing.map(p => `${p.date}_${p.flockId||p.flock}`));
      mappedRows.forEach(r => {
        if (r.date && existingKeys.has(`${r.date}_${r.flock}`)) dupCount++;
      });
    }
    return dupCount;
  }

  // ── Import execution ───────────────────────────────────────────

  _executeImport() {
    try {
      const D = Store.get();
      const mod = MODULES[this._module];
      const validRows = this._validated.filter(r => r.errors.length === 0);
      this._skipped = this._validated.filter(r => r.errors.length > 0);
      this._unmappedCols = this._headers.filter((_, i) => !this._mapping[i]);

      // Get existing data
      let target;
      if (mod.nested) {
        if (!D[mod.storeKey]) D[mod.storeKey] = {};
        if (!D[mod.storeKey][mod.nested]) D[mod.storeKey][mod.nested] = [];
        target = D[mod.storeKey][mod.nested];
      } else {
        if (!D[mod.storeKey]) D[mod.storeKey] = [];
        target = D[mod.storeKey];
      }

      // Build existing lookup for dedup
      const existingLookup = this._buildLookup(target);
      this._imported = [];
      this._dupsSkipped = 0;

      for (const row of validRows) {
        const record = { ...row.mapped, id: uid(), _imported: true, _importDate: new Date().toISOString() };

        // Dedup check
        const dupKey = this._getDupKey(record);
        if (dupKey && existingLookup.has(dupKey)) {
          this._dupsSkipped++;
          continue;
        }
        if (dupKey) existingLookup.add(dupKey);

        // Module-specific transformations
        this._transformRecord(record);
        target.push(record);
        this._imported.push(record);
      }

      // Update client code sequence if importing clients
      if (this._module === 'clients') {
        const maxSeq = target.reduce((max, c) => {
          if (c.clientCode) {
            const n = parseInt(c.clientCode.replace(/\D/g, ''));
            return n > max ? n : max;
          }
          return max;
        }, D._clientCodeSeq || 0);
        D._clientCodeSeq = maxSeq;
      }

      Store.save(D);
      this._importError = false;
      Bus.emit('toast', { msg: `${t('imp_success')}: ${this._imported.length} ${t('imp_records')}`, type: 'success' });

    } catch (err) {
      this._importError = true;
      Bus.emit('toast', { msg: t('imp_failed') + ': ' + err.message, type: 'error' });
    }

    this._step = 4;
    this.render();
  }

  _buildLookup(existing) {
    const set = new Set();
    existing.forEach(r => {
      const key = this._getDupKeyFromExisting(r);
      if (key) set.add(key);
    });
    return set;
  }

  _getDupKey(record) {
    switch (this._module) {
      case 'clients':
        if (record.rut) return 'rut:' + normalize(record.rut);
        if (record.name) return 'name:' + normalize(record.name);
        return null;
      case 'production':
        return record.date && record.flock ? `${record.date}_${record.flock}` : null;
      case 'flocks':
        return record.name ? 'name:' + normalize(record.name) : null;
      default:
        return null; // No dedup for other modules
    }
  }

  _getDupKeyFromExisting(r) {
    switch (this._module) {
      case 'clients':
        if (r.rut) return 'rut:' + normalize(r.rut);
        if (r.name) return 'name:' + normalize(r.name);
        return null;
      case 'production':
        return r.date && (r.flockId || r.flock) ? `${r.date}_${r.flockId || r.flock}` : null;
      case 'flocks':
        return r.name ? 'name:' + normalize(r.name) : null;
      default:
        return null;
    }
  }

  _transformRecord(record) {
    switch (this._module) {
      case 'clients':
        // Auto-generate client code if missing
        if (!record.clientCode) {
          const D = Store.get();
          const seq = (D._clientCodeSeq || D.clients.length || 0) + 1;
          record.clientCode = 'CLI-' + String(seq).padStart(5, '0');
          D._clientCodeSeq = seq;
        }
        record.active = true;
        break;
      case 'flocks':
        record.active = true;
        if (record.initialCount) record.initialCount = parseInt(record.initialCount) || 0;
        if (record.cost) record.cost = parseFloat(record.cost) || 0;
        break;
      case 'production':
        if (record.eggs) record.eggs = parseInt(record.eggs) || 0;
        if (record.broken) record.broken = parseInt(record.broken) || 0;
        if (record.deaths) record.deaths = parseInt(record.deaths) || 0;
        break;
      case 'feed':
        if (record.quantity) record.quantity = parseFloat(record.quantity) || 0;
        if (record.cost) record.cost = parseFloat(record.cost) || 0;
        break;
      case 'finances_income':
      case 'finances_expense':
        if (record.amount) record.amount = parseFloat(record.amount) || 0;
        break;
      case 'orders':
        record.status = record.status || 'delivered'; // Historical orders = delivered
        if (record.total) record.total = parseFloat(record.total) || 0;
        record.items = record.items || [];
        break;
    }
  }

  // ── Navigation ─────────────────────────────────────────────────

  _nextStep() {
    if (this._step === 1 && this._headers.length) {
      this._step = 2;
    } else if (this._step === 2) {
      // Validate at least one mapping exists
      const mappedCount = Object.keys(this._mapping).length;
      if (!mappedCount) {
        Bus.emit('toast', { msg: t('imp_no_mapping'), type: 'warning' });
        return;
      }
      // Check required fields are mapped
      const mod = MODULES[this._module];
      const mappedFields = new Set(Object.values(this._mapping).map(m => m.field));
      const missingReq = (mod.reqFields || []).filter(f => !mappedFields.has(f));
      if (missingReq.length) {
        Bus.emit('toast', { msg: t('imp_missing_required') + ': ' + missingReq.join(', '), type: 'warning' });
        return;
      }
      this._step = 3;
    }
    this.render();
  }

  _prevStep() {
    if (this._step > 1) { this._step--; this.render(); }
  }
}

customElements.define('egg-data-import', EggDataImport);
