// EGGlogU — Environment Web Component
// Manual recording, IoT gauges (MQTT), history chart + DataTable,
// stress events CRUD, predictive analytics (outbreak risk, forecast, anomalies, breed benchmark)

import {
  Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate, todayStr, genId,
  validateForm, emptyState, DataTable, kpi, flockSelect, catalogSelect,
  showFieldError, clearFieldErrors, CATALOGS, BREED_CURVES,
  activeHens, activeHensByFlock, flockAge, tc
} from '../core/index.js';
import { modalVal, getModalBody } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

// ─── Theme helpers (mirrors monolith) ───
const THEMES = {
  blue: { rgb: '26,60,110' }, green: { rgb: '46,125,50' }, purple: { rgb: '106,27,154' },
  black: { rgb: '55,71,79' }, dark: { rgb: '144,202,249' }
};

function themeColor(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

function themeRgba(a) {
  const th = THEMES[localStorage.getItem('egglogu_theme') || 'blue'] || THEMES.blue;
  return 'rgba(' + th.rgb + ',' + a + ')';
}

/** Temperature-Humidity Index */
function calcTHI(temp, h) {
  return (1.8 * temp + 32) - (0.55 - 0.0055 * h) * (1.8 * temp - 26);
}

// ─── Stress event type list ───
const STRESS_TYPES = ['heat', 'disease', 'feed_change', 'power', 'predator', 'other'];

// ─── Component ───
class EggEnvironment extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._currentTab = 'manual';
    this._forecastDays = 7;
    this._charts = {};
    this._mqttClient = null;
    this._mqttConnected = false;
  }

  connectedCallback() {
    this.render();
    this._setupBus();
  }

  disconnectedCallback() {
    this.cleanup();
  }

  cleanup() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    this._destroyCharts();
    this._disconnectMQTT();
  }

  // ──────────────────────── Bus ────────────────────────
  _setupBus() {
    this._unsubs.push(
      Bus.on('modal:action', (ev) => this._onModalAction(ev)),
      Bus.on('modal:change', (ev) => this._onModalChange(ev))
    );
  }

  _onModalAction({ action, id }) {
    switch (action) {
      case 'save-env': this._saveEnv(id || ''); break;
      case 'save-stress': this._saveStress(id || ''); break;
    }
  }

  _onModalChange() { /* reserved for future dynamic form updates */ }

  // ──────────────────────── Render orchestrator ────────────────────────
  render() {
    const D = Store.get();
    let h = this._baseStyle();
    h += `<div class="page-header"><h2>${t('env_title')}</h2></div>`;

    // Tabs
    h += '<div class="tabs">';
    h += this._tab('manual', '\uD83D\uDCDD ' + t('env_manual'));
    h += this._tab('iot', '\uD83D\uDCE1 ' + t('iot_title'));
    h += this._tab('history', '\uD83D\uDCCA ' + t('env_history'));
    h += this._tab('stress', '\u26A1 ' + t('stress_title'));
    h += this._tab('predictions', '\uD83E\uDD16 ' + (t('pred_title') || 'Predictions'));
    h += '</div>';

    switch (this._currentTab) {
      case 'manual': h += this._renderManual(D); break;
      case 'iot': h += this._renderIoT(D); break;
      case 'history': h += this._renderHistory(D); break;
      case 'stress': h += this._renderStressEvents(D); break;
      case 'predictions': h += this._renderPredictions(D); break;
    }

    this.shadowRoot.innerHTML = h;
    this._bindEvents();

    // Post-render hooks
    if (this._currentTab === 'iot') this._updateIoTGauges();
    if (this._currentTab === 'history') this._renderHistoryChart(D);
    if (this._currentTab === 'predictions') this._renderForecastChart(D);
  }

  _tab(key, label) {
    return `<div class="tab${this._currentTab === key ? ' active' : ''}" data-tab="${key}">${label}</div>`;
  }

  // ──────────────────────── Event delegation ────────────────────────
  _bindEvents() {
    this.shadowRoot.addEventListener('click', (e) => {
      // Tab switching
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this._currentTab = tab.dataset.tab;
        this._destroyCharts();
        this.render();
        return;
      }
      // Action buttons
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'show-env-form': this._showEnvForm(btn.dataset.id || ''); break;
        case 'delete-env': this._deleteEnv(btn.dataset.id); break;
        case 'connect-mqtt': this._connectMQTT(); break;
        case 'disconnect-mqtt': this._disconnectMQTT(); break;
        case 'save-iot-to-env': this._saveIoTToEnv(); break;
        case 'go-config': Bus.emit('nav:request', { section: 'config' }); break;
        case 'show-stress-form': this._showStressForm(btn.dataset.id || ''); break;
        case 'delete-stress': this._deleteStress(btn.dataset.id); break;
        case 'set-forecast-days':
          this._forecastDays = parseInt(btn.dataset.days) || 7;
          this._destroyCharts();
          this.render();
          break;
        case 'bulk-delete-env': {
          const ids = JSON.parse(btn.dataset.ids || '[]');
          if (!confirm(t('confirm_delete'))) return;
          const Db = Store.get();
          Db.environment = Db.environment.filter(e => !ids.includes(e.id));
          Store.set(Db);
          this.render();
          break;
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  TAB 1 — MANUAL ENTRY
  // ══════════════════════════════════════════════════════════════
  _renderManual(D) {
    let h = `<div style="text-align:right;margin-bottom:8px"><button class="btn btn-primary" data-action="show-env-form">${t('env_add')}</button></div>`;

    // Optimal ranges card
    h += `<div class="card"><h3>${t('env_optimal')}</h3><div class="kpi-grid">
      ${kpi(t('env_temp'), t('env_temp_range'), '', '')}
      ${kpi(t('env_humidity'), t('env_humidity_range'), '', '', t('info_env_humidity'))}
      ${kpi(t('env_light'), t('env_light_range'), '', '', t('info_env_light'))}
      ${kpi(t('env_density'), t('env_density_range'), '', '', t('info_env_density'))}
    </div></div>`;

    // Latest reading
    const sorted = [...(D.environment || [])].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];
    if (latest) {
      const tOk = latest.temperature >= 18 && latest.temperature <= 24;
      const hOk = latest.humidity >= 40 && latest.humidity <= 70;
      const lOk = latest.lightHours >= 14 && latest.lightHours <= 16;
      h += `<div class="card"><h3>${t('env_latest_reading')} (${fmtDate(latest.date)})</h3><div class="kpi-grid">`;
      h += `<div class="kpi-card ${tOk ? '' : 'danger'}"><div class="kpi-label">${t('env_temp')}</div><div class="kpi-value">${latest.temperature || '-'}\u00B0C</div><div class="kpi-sub">${tOk ? '\u2713 ' + t('env_ok') : '\u26A0 ' + t('env_out_of_range')}</div></div>`;
      h += `<div class="kpi-card ${hOk ? '' : 'warning'}"><div class="kpi-label">${t('env_humidity')}</div><div class="kpi-value">${latest.humidity || '-'}%</div><div class="kpi-sub">${hOk ? '\u2713 ' + t('env_ok') : '\u26A0 ' + t('env_out_of_range')}</div></div>`;
      h += `<div class="kpi-card ${lOk ? '' : 'warning'}"><div class="kpi-label">${t('env_light')}</div><div class="kpi-value">${latest.lightHours || '-'} hrs</div><div class="kpi-sub">${lOk ? '\u2713 ' + t('env_ok') : '\u26A0 ' + t('env_out_of_range')}</div></div>`;
      if (latest.temperature && latest.humidity) {
        const thi = calcTHI(latest.temperature, latest.humidity);
        h += `<div class="kpi-card ${thi > 28 ? 'danger' : thi > 25 ? 'warning' : ''}"><div class="kpi-label">${t('env_thi')}</div><div class="kpi-value">${thi.toFixed(1)}</div><div class="kpi-sub">${thi > 28 ? t('weather_heat_alert') : 'OK'}</div></div>`;
      }
      h += '</div></div>';
    }

    // Recent table
    if (!sorted.length) {
      h += emptyState('\uD83C\uDF21\uFE0F', t('no_data'), t('env_add'), null);
    } else {
      h += '<div class="card"><div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('date')}</th><th>${t('env_temp')}</th><th>${t('env_humidity')}</th><th>${t('env_light')}</th><th>${t('env_ammonia')}</th><th>THI</th><th>${t('notes')}</th><th>${t('actions')}</th>`;
      h += '</tr></thead><tbody>';
      sorted.slice(0, 20).forEach(e => {
        const tOk = e.temperature >= 18 && e.temperature <= 24;
        const hOk = e.humidity >= 40 && e.humidity <= 70;
        const thi = (e.temperature && e.humidity) ? calcTHI(e.temperature, e.humidity) : null;
        h += `<tr>
          <td>${fmtDate(e.date)}</td>
          <td style="color:${tOk ? 'var(--success)' : 'var(--danger)'}">${e.temperature || '-'}\u00B0C</td>
          <td style="color:${hOk ? 'var(--success)' : 'var(--warning)'}">${e.humidity || '-'}%</td>
          <td>${e.lightHours || '-'} hrs</td>
          <td>${e.ammoniaLevel || '-'} ppm</td>
          <td>${thi ? thi.toFixed(1) : '-'}</td>
          <td>${sanitizeHTML(e.notes || '-')}</td>
          <td><div class="btn-group">
            <button class="btn btn-secondary btn-sm" data-action="show-env-form" data-id="${escapeAttr(e.id)}">${t('edit')}</button>
            <button class="btn btn-danger btn-sm" data-action="delete-env" data-id="${escapeAttr(e.id)}">${t('delete')}</button>
          </div></td>
        </tr>`;
      });
      h += '</tbody></table></div></div>';
    }
    return h;
  }

  _showEnvForm(id) {
    const D = Store.get();
    const e = id ? (D.environment || []).find(x => x.id === id) : null;
    const body = `
      <div class="form-group"><label>${t('date')}</label><input type="date" id="en-date" value="${e ? e.date : todayStr()}"></div>
      <div class="form-row">
        <div class="form-group"><label>${t('env_temp')}</label><input type="number" id="en-temp" value="${e ? e.temperature || '' : ''}" step="0.1"></div>
        <div class="form-group"><label>${t('env_humidity')}</label><input type="number" id="en-hum" value="${e ? e.humidity || '' : ''}" step="1" min="0" max="100"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('env_light')}</label><input type="number" id="en-light" value="${e ? e.lightHours || '' : ''}" step="0.5" min="0" max="24"></div>
        <div class="form-group"><label>${t('env_ammonia')} (ppm)</label><input type="number" id="en-ammonia" value="${e ? e.ammoniaLevel || '' : ''}" step="0.1" min="0"></div>
      </div>
      <div class="form-group"><label>${t('env_ventilation')}</label><select id="en-vent">${catalogSelect(CATALOGS.ventilationLevels, e ? e.ventilation || '' : '', false)}</select></div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="en-notes">${e ? escapeAttr(e.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="close">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-env" data-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: e ? t('edit') : t('env_add'), body });
  }

  _saveEnv(id) {
    clearFieldErrors();
    const body = getModalBody();
    if (!body) return;
    const val = (sel) => { const el = body.querySelector(sel); return el ? el.value : ''; };
    const o = {
      date: val('#en-date'),
      temperature: parseFloat(val('#en-temp')) || null,
      humidity: parseFloat(val('#en-hum')) || null,
      lightHours: parseFloat(val('#en-light')) || null,
      ammoniaLevel: parseFloat(val('#en-ammonia')) || null,
      ventilation: val('#en-vent'),
      notes: val('#en-notes')
    };
    const v = validateForm({
      'en-date': { value: o.date, rules: { required: true, date: true } },
      'en-temp': { value: val('#en-temp'), rules: { numeric: true } },
      'en-hum': { value: val('#en-hum'), rules: { numeric: true, min: 0, max: 100 } },
      'en-light': { value: val('#en-light'), rules: { numeric: true, min: 0, max: 24 } },
      'en-ammonia': { value: val('#en-ammonia'), rules: { numeric: true, min: 0 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }
    const D = Store.get();
    if (id) {
      const i = D.environment.findIndex(e => e.id === id);
      if (i >= 0) D.environment[i] = { ...D.environment[i], ...o };
    } else {
      o.id = genId();
      D.environment.push(o);
    }
    Store.set(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteEnv(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.environment = D.environment.filter(e => e.id !== id);
    Store.set(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ══════════════════════════════════════════════════════════════
  //  TAB 2 — IoT LIVE GAUGES (MQTT)
  // ══════════════════════════════════════════════════════════════
  _renderIoT(D) {
    if (!D.farm.mqttBroker) {
      return `<div class="card"><p>${t('iot_no_config')}</p>
        <button class="btn btn-primary" data-action="go-config">${t('cfg_title')}</button></div>`;
    }
    let h = `<div class="card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div id="mqtt-indicator"><span class="mqtt-status ${this._mqttConnected ? 'connected' : 'disconnected'}">${this._mqttConnected ? '\u25CF MQTT' : '\u25CB MQTT'}</span></div>
        <button class="btn btn-primary btn-sm" data-action="connect-mqtt">${t('iot_connect')}</button>
        <button class="btn btn-secondary btn-sm" data-action="disconnect-mqtt">${t('iot_disconnect')}</button>
      </div>
      <div id="iot-gauges"><p style="color:var(--text-light)">${t('iot_no_config')}</p></div>
    </div>`;
    return h;
  }

  _connectMQTT() {
    const D = Store.get();
    if (!D.farm.mqttBroker) { Bus.emit('toast', { msg: t('iot_no_config'), type: 'error' }); return; }
    try {
      /* global mqtt */
      if (typeof mqtt === 'undefined') {
        Bus.emit('toast', { msg: 'MQTT library not loaded', type: 'error' });
        return;
      }
      this._mqttClient = mqtt.connect(D.farm.mqttBroker, {
        username: D.farm.mqttUser || undefined,
        password: D.farm.mqttPass || undefined,
        reconnectPeriod: 5000,
        connectTimeout: 10000
      });
      this._mqttClient.on('connect', () => {
        this._mqttConnected = true;
        this._mqttClient.subscribe((D.farm.mqttTopicPrefix || 'egglogu/') + 'sensors/#');
        this._updateMqttStatus();
        Bus.emit('toast', { msg: t('iot_connect') + ' OK' });
      });
      this._mqttClient.on('message', (topic, payload) => this._onMqttMessage(topic, payload));
      this._mqttClient.on('error', () => { this._mqttConnected = false; this._updateMqttStatus(); });
      this._mqttClient.on('close', () => { this._mqttConnected = false; this._updateMqttStatus(); });
    } catch (e) {
      Bus.emit('toast', { msg: 'MQTT Error: ' + sanitizeHTML(e.message), type: 'error' });
    }
  }

  _disconnectMQTT() {
    if (this._mqttClient) { this._mqttClient.end(); this._mqttClient = null; }
    this._mqttConnected = false;
    this._updateMqttStatus();
    Bus.emit('toast', { msg: t('iot_disconnect') });
  }

  _onMqttMessage(topic, payload) {
    try {
      const data = JSON.parse(payload.toString());
      const D = Store.get();
      const prefix = D.farm.mqttTopicPrefix || 'egglogu/';
      const sensor = topic.replace(prefix + 'sensors/', '');
      const reading = { id: genId(), ts: Date.now(), sensor, value: data.value, unit: data.unit || '' };
      D.iotReadings.push(reading);
      if (D.iotReadings.length > 500) D.iotReadings = D.iotReadings.slice(-300);
      Store.set(D);
      this._updateIoTGauges();
    } catch (e) { /* silently ignore malformed payloads */ }
  }

  _updateMqttStatus() {
    const el = this.shadowRoot.getElementById('mqtt-indicator');
    if (!el) return;
    el.innerHTML = `<span class="mqtt-status ${this._mqttConnected ? 'connected' : 'disconnected'}">${this._mqttConnected ? '\u25CF MQTT' : '\u25CB MQTT'}</span>`;
  }

  _updateIoTGauges() {
    const D = Store.get();
    const el = this.shadowRoot.getElementById('iot-gauges');
    if (!el) return;
    const latest = {};
    (D.iotReadings || []).slice(-20).forEach(r => { latest[r.sensor] = { value: r.value, unit: r.unit, ts: r.ts }; });
    const sensors = ['temperature', 'humidity', 'ammonia', 'light'];
    let h = '<div class="kpi-grid">';
    sensors.forEach(s => {
      const d = latest[s];
      const val = d ? d.value : '--';
      const unit = d ? d.unit : '';
      let cls = '';
      if (s === 'temperature' && d) { cls = d.value > 30 || d.value < 15 ? 'danger' : d.value > 26 ? 'warning' : ''; }
      if (s === 'humidity' && d) { cls = d.value > 80 || d.value < 30 ? 'danger' : d.value > 70 ? 'warning' : ''; }
      if (s === 'ammonia' && d) { cls = d.value > 25 ? 'danger' : d.value > 15 ? 'warning' : ''; }
      h += kpi(t('iot_' + s) || s, typeof val === 'number' ? val.toFixed(1) : val, unit, cls);
    });
    if (latest.temperature && latest.humidity) {
      const thi = calcTHI(latest.temperature.value, latest.humidity.value);
      h += kpi('THI', thi.toFixed(1), thi > 28 ? t('weather_heat_alert') : 'OK', thi > 28 ? 'danger' : thi > 25 ? 'warning' : '');
    }
    h += '</div>';
    if (Object.keys(latest).length) {
      const lastTs = D.iotReadings[D.iotReadings.length - 1]?.ts || 0;
      h += `<div style="margin-top:8px">
        <button class="btn btn-secondary btn-sm" data-action="save-iot-to-env">${t('iot_save_reading')}</button>
        <span style="margin-left:8px;font-size:11px;color:var(--text-light)">${t('weather_last_update')}: ${new Date(lastTs).toLocaleTimeString()}</span>
      </div>`;
    }
    el.innerHTML = h;
  }

  _saveIoTToEnv() {
    const D = Store.get();
    const latest = {};
    (D.iotReadings || []).slice(-20).forEach(r => { latest[r.sensor] = { value: r.value }; });
    const o = {
      id: genId(), date: todayStr(),
      temperature: latest.temperature?.value || null,
      humidity: latest.humidity?.value || null,
      lightHours: null, ventilation: '',
      ammoniaLevel: latest.ammonia?.value || null,
      notes: 'IoT auto-save'
    };
    D.environment.push(o);
    Store.set(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
  }

  // ══════════════════════════════════════════════════════════════
  //  TAB 3 — HISTORY (Chart + DataTable)
  // ══════════════════════════════════════════════════════════════
  _renderHistory(D) {
    if (!(D.environment || []).length) return emptyState('\uD83D\uDCCA', t('no_data'));
    let h = '<div class="card"><h3>' + t('env_history') + '</h3><div class="chart-container"><canvas id="chart-env"></canvas></div></div>';

    // DataTable
    const envData = D.environment.map(e => {
      const thi = (e.temperature && e.humidity) ? calcTHI(e.temperature, e.humidity) : null;
      return { ...e, _thi: thi };
    });
    h += DataTable.create({
      id: 'envHistory', data: envData, emptyIcon: '\uD83D\uDCCA', emptyText: t('no_data'),
      columns: [
        { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        { key: 'temperature', label: t('env_temp'), type: 'number', sortable: true, render: r => (r.temperature || '-') + '\u00B0C' },
        { key: 'humidity', label: t('env_humidity'), type: 'number', sortable: true, render: r => (r.humidity || '-') + '%' },
        { key: 'lightHours', label: t('env_light'), type: 'number', sortable: true, render: r => (r.lightHours || '-') + ' hrs' },
        { key: 'ammoniaLevel', label: t('env_ammonia'), type: 'number', sortable: true, render: r => (r.ammoniaLevel || '-') + ' ppm' },
        { key: '_thi', label: 'THI', type: 'number', sortable: true, render: r => r._thi ? r._thi.toFixed(1) : '-' },
        { key: 'notes', label: t('notes'), type: 'text', render: r => sanitizeHTML(r.notes || '-') }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="show-env-form" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-env" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [
        { label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true, action: ids => {
          if (!confirm(t('confirm_delete'))) return;
          const Db = Store.get();
          Db.environment = Db.environment.filter(e => !ids.includes(e.id));
          Store.set(Db);
          this.render();
        }}
      ]
    });
    return h;
  }

  _renderHistoryChart(D) {
    setTimeout(() => {
      const c = this.shadowRoot.getElementById('chart-env');
      if (!c || typeof Chart === 'undefined') return;
      const recs = [...(D.environment || [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
      if (!recs.length) return;
      this._charts.env = new Chart(c, {
        type: 'line',
        data: {
          labels: recs.map(r => r.date.substring(5)),
          datasets: [
            { label: t('env_temp') + ' \u00B0C', data: recs.map(r => r.temperature), borderColor: '#C62828', tension: 0.3, yAxisID: 'y' },
            { label: t('env_humidity') + ' %', data: recs.map(r => r.humidity), borderColor: themeColor('--primary'), tension: 0.3, yAxisID: 'y1' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { position: 'left', title: { display: true, text: '\u00B0C' } },
            y1: { position: 'right', title: { display: true, text: '%' }, grid: { drawOnChartArea: false } }
          }
        }
      });
    }, 100);
  }

  // ══════════════════════════════════════════════════════════════
  //  TAB 4 — STRESS EVENTS
  // ══════════════════════════════════════════════════════════════
  _renderStressEvents(D) {
    let h = `<div class="page-header" style="margin-bottom:12px">
      <h3>${t('stress_title')}</h3>
      <button class="btn btn-primary btn-sm" data-action="show-stress-form">${t('add')}</button>
    </div>`;
    if (!(D.stressEvents || []).length) return h + emptyState('\u26A1', t('no_data'));
    h += '<div class="card"><div class="stress-timeline">';
    [...D.stressEvents].sort((a, b) => b.date.localeCompare(a.date)).forEach(ev => {
      const sColor = ['', '#4CAF50', '#FFC107', '#FF9800', '#F44336', '#9C27B0'][ev.severity] || '#999';
      const f = (D.flocks || []).find(x => x.id === ev.flockId);
      // Production impact
      const evDate = new Date(ev.date + 'T12:00:00');
      const after3 = new Date(evDate); after3.setDate(after3.getDate() + 3);
      const before = D.dailyProduction.filter(p => p.date < ev.date).slice(-3);
      const afterP = D.dailyProduction.filter(p => p.date > ev.date && p.date <= after3.toISOString().substring(0, 10));
      const avgBefore = before.length > 0 ? before.reduce((s, p) => s + (p.eggsCollected || 0), 0) / before.length : 0;
      const avgAfter = afterP.length > 0 ? afterP.reduce((s, p) => s + (p.eggsCollected || 0), 0) / afterP.length : 0;
      const impact = avgBefore > 0 ? ((avgAfter - avgBefore) / avgBefore * 100) : 0;
      h += `<div class="stress-event" style="border-left:4px solid ${sColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
          <strong>${fmtDate(ev.date)}</strong>
          <span class="badge badge-${ev.severity >= 4 ? 'danger' : ev.severity >= 3 ? 'warning' : 'info'}">${t('stress_' + ev.type) || ev.type} (${ev.severity}/5)</span>
        </div>
        <p style="margin:4px 0">${sanitizeHTML(ev.description)}</p>
        <div style="font-size:12px;color:var(--text-light)">${f ? sanitizeHTML(f.name) : t('all')} | ${t('prod_title')}: <span style="color:${impact < 0 ? 'var(--danger)' : 'var(--success)'}">${impact > 0 ? '+' : ''}${fmtNum(impact, 1)}%</span></div>
        <div class="btn-group" style="margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="show-stress-form" data-id="${escapeAttr(ev.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-stress" data-id="${escapeAttr(ev.id)}">${t('delete')}</button>
        </div>
      </div>`;
    });
    h += '</div></div>';
    return h;
  }

  _showStressForm(id) {
    const D = Store.get();
    const ev = id ? (D.stressEvents || []).find(x => x.id === id) : null;
    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="st-date" value="${ev ? ev.date : todayStr()}"></div>
        <div class="form-group"><label>${t('stress_type')}</label><select id="st-type">${STRESS_TYPES.map(ty => `<option value="${ty}"${ev && ev.type === ty ? ' selected' : ''}>${t('stress_' + ty) || ty}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('stress_severity')} (1-5)</label><input type="number" id="st-sev" value="${ev ? ev.severity : 3}" min="1" max="5"></div>
        <div class="form-group"><label>${t('prod_flock')}</label><select id="st-flock">${flockSelect(ev ? ev.flockId : '', true)}</select></div>
      </div>
      <div class="form-group"><label>${t('fin_description')}</label><textarea id="st-desc">${ev ? escapeAttr(ev.description || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="close">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-stress" data-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: ev ? t('edit') : t('stress_title'), body });
  }

  _saveStress(id) {
    clearFieldErrors();
    const body = getModalBody();
    if (!body) return;
    const val = (sel) => { const el = body.querySelector(sel); return el ? el.value : ''; };
    const o = {
      date: val('#st-date'), type: val('#st-type'),
      severity: parseInt(val('#st-sev')) || 3,
      flockId: val('#st-flock'), description: val('#st-desc')
    };
    const v = validateForm({
      'st-date': { value: o.date, rules: { required: true, date: true } },
      'st-type': { value: o.type, rules: { required: true } },
      'st-sev': { value: val('#st-sev'), rules: { required: true, numeric: true, min: 1, max: 5 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }
    const D = Store.get();
    if (id) {
      const i = D.stressEvents.findIndex(e => e.id === id);
      if (i >= 0) D.stressEvents[i] = { ...D.stressEvents[i], ...o };
    } else {
      o.id = genId();
      D.stressEvents.push(o);
    }
    Store.set(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteStress(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.stressEvents = D.stressEvents.filter(e => e.id !== id);
    Store.set(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ══════════════════════════════════════════════════════════════
  //  TAB 5 — PREDICTIONS (outbreak risk, forecast, anomalies, breed benchmark)
  // ══════════════════════════════════════════════════════════════
  _renderPredictions(D) {
    if (!(D.dailyProduction || []).length) return emptyState('\uD83E\uDD16', t('no_data'));
    let h = '';
    const sorted = [...D.dailyProduction].sort((a, b) => a.date.localeCompare(b.date));
    const last30 = sorted.slice(-30);

    // === Outbreak Risk Classifier ===
    const outbreak = this._computeOutbreakRisk(D);
    const obColor = outbreak.classification === 1 ? 'red' : outbreak.probability > 0.4 ? 'yellow' : 'green';
    const obLabel = obColor === 'red' ? t('pred_outbreak_high') : obColor === 'yellow' ? t('pred_outbreak_medium') : t('pred_outbreak_low');
    h += `<div class="card"><h3>\uD83D\uDD34 ${t('pred_outbreak_risk')}</h3>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
        <div class="traffic-light">
          <div class="traffic-dot red${obColor === 'red' ? ' active' : ''}"></div>
          <div class="traffic-dot yellow${obColor === 'yellow' ? ' active' : ''}"></div>
          <div class="traffic-dot green${obColor === 'green' ? ' active' : ''}"></div>
        </div>
        <div>
          <strong style="font-size:1.4em">${(outbreak.probability * 100).toFixed(0)}%</strong><br>
          <span class="badge badge-${obColor === 'red' ? 'danger' : obColor === 'yellow' ? 'warning' : 'success'}">${obLabel}</span>
        </div>
      </div>`;
    if (outbreak.factors.length) {
      h += '<div class="table-wrap"><table><thead><tr><th>' + t('pred_outbreak_factor') + '</th><th>' + t('pred_outbreak_weight') + '</th><th>' + t('pred_outbreak_value') + '</th></tr></thead><tbody>';
      outbreak.factors.forEach(f => {
        h += `<tr><td>${sanitizeHTML(f.name)}</td><td>${(f.weight * 100).toFixed(0)}%</td>
          <td><div class="severity-bar"><div style="width:${Math.min(100, f.value * 100)}%;background:${f.value > 0.6 ? 'var(--danger)' : f.value > 0.3 ? 'var(--warning)' : 'var(--success)'}"></div></div></td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    if (outbreak.recommendations.length) {
      h += '<div style="margin-top:12px"><strong>' + t('rec_title') + ':</strong><ul style="margin:4px 0 0 16px">';
      outbreak.recommendations.forEach(r => { h += `<li>${r.icon || ''} ${sanitizeHTML(r.msg || '')}</li>`; });
      h += '</ul></div>';
    }
    h += '</div>';

    // === Multi-step Forecast ===
    if (last30.length >= 7 && typeof ss !== 'undefined') {
      h += `<div class="card"><h3>\uD83D\uDCC8 ${t('pred_forecast')}</h3>
        <div style="margin-bottom:8px">
          <button class="btn btn-sm${this._forecastDays === 7 ? ' btn-primary' : ' btn-secondary'}" data-action="set-forecast-days" data-days="7">7d</button>
          <button class="btn btn-sm${this._forecastDays === 14 ? ' btn-primary' : ' btn-secondary'}" data-action="set-forecast-days" data-days="14">14d</button>
        </div>
        <div class="chart-container"><canvas id="chart-forecast"></canvas></div>
      </div>`;
    }

    // === Anomaly Detection ===
    if (last30.length >= 7 && typeof ss !== 'undefined') {
      const vals = last30.map(p => p.eggsCollected || 0);
      const mean = ss.mean(vals);
      const std = ss.standardDeviation(vals);
      const anomalies = last30.filter(p => { const z = std > 0 ? Math.abs((p.eggsCollected - mean) / std) : 0; return z > 2; });
      if (anomalies.length) {
        h += `<div class="card"><h3>${t('pred_anomaly')} (|Z|>2)</h3><div class="table-wrap"><table><thead><tr>
          <th>${t('date')}</th><th>${t('prod_eggs')}</th><th>Z-score</th></tr></thead><tbody>`;
        anomalies.forEach(p => {
          const z = std > 0 ? ((p.eggsCollected - mean) / std) : 0;
          h += `<tr><td>${fmtDate(p.date)}</td><td>${p.eggsCollected} <span class="anomaly-icon">\u26A0</span></td>
            <td style="color:var(--danger)">${z.toFixed(2)}</td></tr>`;
        });
        h += '</tbody></table></div></div>';
      }
    }

    // === Breed Benchmark ===
    const activeFlocks = (D.flocks || []).filter(f => f.status !== 'descarte' && f.birthDate);
    if (activeFlocks.length) {
      h += `<div class="card"><h3>${t('pred_breed_curve')}</h3>`;
      activeFlocks.forEach(f => {
        const bkey = f.breed && BREED_CURVES[f.breed] ? f.breed : (f.targetCurve && BREED_CURVES[f.targetCurve] ? f.targetCurve : 'generic');
        const curve = BREED_CURVES[bkey] || BREED_CURVES.generic || [];
        const age = flockAge(f);
        const weekIdx = Math.max(0, age.weeks - 18);
        const expected = weekIdx < curve.length ? curve[weekIdx] : (curve.length ? curve[curve.length - 1] : 0);
        const hens = activeHensByFlock(f.id);
        const l7 = D.dailyProduction.filter(p => p.flockId === f.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
        const avgE = l7.length > 0 ? l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length : 0;
        const actual = hens > 0 ? (avgE / hens * 100) : 0;
        const gap = actual - expected;
        const gapColor = gap >= 0 ? 'var(--success)' : 'var(--danger)';
        const breedLabel = sanitizeHTML(bkey);
        h += `<div class="stat-row">
          <span class="stat-label">${sanitizeHTML(f.name)} (${breedLabel})</span>
          <span class="stat-value">${t('actual') || 'Actual'}: ${fmtNum(actual, 1)}% | ${t('expected') || 'Expected'}: ${expected}% |
          <span style="color:${gapColor}">Gap: ${gap > 0 ? '+' : ''}${fmtNum(gap, 1)}%</span></span>
        </div>`;
      });
      h += '</div>';
    }

    return h;
  }

  _renderForecastChart(D) {
    const sorted = [...D.dailyProduction].sort((a, b) => a.date.localeCompare(b.date));
    const last30 = sorted.slice(-30);
    if (last30.length < 7 || typeof ss === 'undefined' || typeof Chart === 'undefined') return;
    setTimeout(() => {
      const c = this.shadowRoot.getElementById('chart-forecast');
      if (!c) return;
      const fc = this._computeForecast(D, this._forecastDays);
      const allLabels = last30.map(p => p.date.substring(5));
      for (let i = 1; i <= this._forecastDays; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        allLabels.push(d.toISOString().substring(5, 10));
      }
      const actual = last30.map(p => p.eggsCollected || 0);
      const predLine = [...Array(last30.length).fill(null), ...fc.forecast];
      const upperBand = [...Array(last30.length).fill(null), ...fc.upper];
      const lowerBand = [...Array(last30.length).fill(null), ...fc.lower];
      this._charts.forecast = new Chart(c, {
        type: 'line',
        data: {
          labels: allLabels,
          datasets: [
            { label: t('prod_eggs'), data: [...actual, ...Array(this._forecastDays).fill(null)], borderColor: themeColor('--primary'), backgroundColor: themeRgba(0.1), fill: true, tension: 0.3 },
            { label: t('pred_forecast'), data: predLine, borderColor: '#FF8F00', borderDash: [5, 5], tension: 0.3, pointRadius: 4 },
            { label: t('pred_forecast_upper'), data: upperBand, borderColor: 'rgba(255,143,0,.2)', backgroundColor: 'rgba(255,143,0,.08)', fill: '+1', borderDash: [2, 2], pointRadius: 0, tension: 0.3 },
            { label: t('pred_forecast_lower'), data: lowerBand, borderColor: 'rgba(255,143,0,.2)', pointRadius: 0, tension: 0.3 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { filter: item => !item.text.includes('upper') && !item.text.includes('lower') } } }
        }
      });
    }, 100);
  }

  // ─── Outbreak Risk Classifier (sigmoid) ───
  _computeOutbreakRisk(D) {
    const hens = activeHens();
    if (hens === 0) return { probability: 0, classification: 0, factors: [], recommendations: [] };
    const factors = [];

    // 1. Mortality spike (0.25)
    const l7prod = [...D.dailyProduction].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    const l7deaths = l7prod.reduce((s, p) => s + (p.deaths || 0), 0);
    const deathRate = hens > 0 ? (l7deaths / hens * 100) : 0;
    const mortFactor = Math.min(1, deathRate / 10);
    factors.push({ name: tc('Mortalidad') || t('kpi_mortality') || 'Mortality', weight: 0.25, value: mortFactor, detail: fmtNum(deathRate, 2) + '%' });

    // 2. FCR deterioration (0.15)
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const d30s = d30.toISOString().substring(0, 10);
    const f30 = (D.feed.consumption || []).filter(c => c.date >= d30s);
    const e30 = D.dailyProduction.filter(p => p.date >= d30s);
    const tfkg = f30.reduce((s, c) => s + (c.quantityKg || 0), 0);
    const tekg = e30.reduce((s, p) => s + (p.eggsCollected || 0), 0) * 0.06;
    const fcr = tekg > 0 ? tfkg / tekg : 0;
    const fcrFactor = fcr > 0 ? Math.min(1, (fcr - 2) / 2) : 0;
    factors.push({ name: 'FCR', weight: 0.15, value: fcrFactor, detail: fmtNum(fcr, 2) });

    // 3. THI stress (0.15)
    const lastW = (D.weatherCache || []).length > 0 ? D.weatherCache[D.weatherCache.length - 1] : null;
    let thiFactor = 0;
    if (lastW) {
      const thi = calcTHI(lastW.temp, lastW.humidity);
      thiFactor = thi > 28 ? Math.min(1, (thi - 25) / 10) : 0;
      factors.push({ name: 'THI', weight: 0.15, value: thiFactor, detail: fmtNum(thi, 1) });
    } else {
      factors.push({ name: 'THI', weight: 0.15, value: 0, detail: '-' });
    }

    // 4. Production drop (0.20)
    let prodFactor = 0;
    if (l7prod.length >= 7 && typeof ss !== 'undefined') {
      const points = l7prod.map((p, i) => [i, p.eggsCollected || 0]);
      const reg = ss.linearRegression(points);
      prodFactor = reg.m < 0 ? Math.min(1, Math.abs(reg.m) / 10) : 0;
    }
    factors.push({ name: t('pred_drop_risk') || 'Production drop', weight: 0.20, value: prodFactor, detail: '' });

    // 5. Active outbreaks (0.10)
    const activeOut = (D.outbreaks || []).filter(o => o.status === 'active').length;
    const outFactor = Math.min(1, activeOut / 3);
    factors.push({ name: t('out_active') || 'Active outbreaks', weight: 0.10, value: outFactor, detail: activeOut.toString() });

    // 6. Vaccination gaps (0.10)
    const today = todayStr();
    const overdueVac = (D.vaccines || []).filter(v => v.status !== 'applied' && v.scheduledDate < today).length;
    const vacFactor = Math.min(1, overdueVac / 5);
    factors.push({ name: t('vac_overdue') || 'Vaccine gaps', weight: 0.10, value: vacFactor, detail: overdueVac.toString() });

    // 7. Stress events (0.05)
    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
    const d7s = d7.toISOString().substring(0, 10);
    const recentStress = (D.stressEvents || []).filter(e => e.date >= d7s).length;
    const stressFactor = Math.min(1, recentStress / 3);
    factors.push({ name: t('stress_title') || 'Recent stress', weight: 0.05, value: stressFactor, detail: recentStress.toString() });

    // Sigmoid
    const z = factors.reduce((s, f) => s + f.weight * f.value * 6, 0) - 2;
    const probability = 1 / (1 + Math.exp(-z));
    const classification = probability >= 0.5 ? 1 : 0;

    // Recommendations
    const recommendations = [];
    if (mortFactor > 0.5) recommendations.push({ priority: 'high', icon: '\uD83D\uDD2C', msg: t('rec_lab_samples') });
    if (thiFactor > 0.5) recommendations.push({ priority: 'high', icon: '\uD83C\uDF21\uFE0F', msg: t('rec_ventilation') });
    if (fcrFactor > 0.5) recommendations.push({ priority: 'medium', icon: '\uD83C\uDF3E', msg: t('rec_check_diet') });
    if (prodFactor > 0.5) recommendations.push({ priority: 'medium', icon: '\uD83D\uDCC9', msg: t('rec_check_env') });
    if (overdueVac > 0) recommendations.push({ priority: 'medium', icon: '\uD83D\uDC89', msg: (t('alert_vaccine_overdue') || 'Vaccine overdue') + ': ' + overdueVac });

    return { probability, classification, factors, recommendations };
  }

  // ─── Ensemble Forecast (WMA + Linear Regression) ───
  _computeForecast(D, days = 7) {
    if (typeof ss === 'undefined') return { dates: [], actual: [], forecast: [], upper: [], lower: [] };
    const prod = [...D.dailyProduction].sort((a, b) => a.date.localeCompare(b.date));
    if (prod.length < 7) return { dates: [], actual: [], forecast: [], upper: [], lower: [] };
    const last14 = prod.slice(-14);
    const values = last14.map(p => p.eggsCollected || 0);

    // Weighted Moving Average
    const weights = values.map((_, i) => Math.exp(i * 0.2));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const wma = values.reduce((s, v, i) => s + v * weights[i], 0) / wSum;
    const wmaForecast = Array(days).fill(wma);

    // Linear regression
    const points = values.map((v, i) => [i, v]);
    const reg = ss.linearRegression(points);
    const regLine = ss.linearRegressionLine(reg);
    const lrForecast = [];
    for (let i = 0; i < days; i++) lrForecast.push(Math.max(0, regLine(values.length + i)));

    // Ensemble average
    const ensemble = wmaForecast.map((w, i) => (w + lrForecast[i]) / 2);

    // Confidence bands
    const residuals = values.map((v, i) => v - regLine(i));
    const stdDev = typeof ss.standardDeviation === 'function'
      ? ss.standardDeviation(residuals)
      : Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
    const upper = ensemble.map(v => v + stdDev);
    const lower = ensemble.map(v => Math.max(0, v - stdDev));

    // Date labels
    const dates = [];
    const lastDate = new Date(last14[last14.length - 1].date + 'T12:00:00');
    for (let i = 1; i <= days; i++) { const d = new Date(lastDate); d.setDate(d.getDate() + i); dates.push(d.toISOString().substring(0, 10)); }

    return { dates, actual: values, forecast: ensemble, upper, lower, wma: wmaForecast, lr: lrForecast };
  }

  // ──────────────────────── Chart teardown ────────────────────────
  _destroyCharts() {
    Object.keys(this._charts).forEach(k => {
      if (this._charts[k]) { try { this._charts[k].destroy(); } catch (e) { /* noop */ } }
    });
    this._charts = {};
  }

  // ──────────────────────── Scoped Styles ────────────────────────
  _baseStyle() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2, .page-header h3 { margin: 0; color: var(--primary-dark, #0E2240); }
      .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-danger { background: var(--danger, #dc3545); color: #fff; border: none; }
      .btn:hover { opacity: 0.85; }
      .tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid var(--border, #e0e0e0); overflow-x: auto; }
      .tab { padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-light, #888); border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap; }
      .tab.active { color: var(--primary, #1A3C6E); border-bottom-color: var(--primary, #1A3C6E); }
      .tab:hover { color: var(--primary, #1A3C6E); }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
      .kpi-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative; }
      .kpi-card.danger { border-left: 4px solid var(--danger, #dc3545); }
      .kpi-card.warning { border-left: 4px solid var(--warning, #ffc107); }
      .kpi-card.accent { border-left: 4px solid var(--accent, #FF8F00); }
      .kpi-label { font-size: 12px; color: var(--text-light, #888); text-transform: uppercase; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #333); }
      .kpi-sub { font-size: 12px; color: var(--text-light, #888); margin-top: 4px; }
      .kpi-info-btn { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border, #ccc); background: var(--bg, #fff); font-size: 11px; cursor: pointer; color: var(--text-light, #888); }
      .kpi-tooltip { position: absolute; top: 36px; right: 8px; background: var(--text, #333); color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px; z-index: 10; max-width: 250px; }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .chart-container { position: relative; height: 300px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
      .badge-danger { background: #ffcdd2; color: #b71c1c; }
      .badge-warning { background: #fff9c4; color: #f57f17; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      /* Stress timeline */
      .stress-timeline { display: flex; flex-direction: column; gap: 12px; }
      .stress-event { padding: 12px 16px; background: var(--bg-secondary, #fafafa); border-radius: 8px; }
      .stress-event p { font-size: 14px; color: var(--text, #333); }
      /* Traffic light */
      .traffic-light { display: flex; flex-direction: column; gap: 6px; }
      .traffic-dot { width: 24px; height: 24px; border-radius: 50%; opacity: 0.25; }
      .traffic-dot.active { opacity: 1; box-shadow: 0 0 8px currentColor; }
      .traffic-dot.red { background: #F44336; color: #F44336; }
      .traffic-dot.yellow { background: #FFC107; color: #FFC107; }
      .traffic-dot.green { background: #4CAF50; color: #4CAF50; }
      /* Severity bar */
      .severity-bar { width: 100%; height: 8px; background: var(--border, #e0e0e0); border-radius: 4px; overflow: hidden; }
      .severity-bar > div { height: 100%; border-radius: 4px; transition: width .3s; }
      /* Stat row */
      .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border, #eee); flex-wrap: wrap; gap: 4px; }
      .stat-label { font-weight: 600; color: var(--text, #333); }
      .stat-value { font-size: 13px; color: var(--text-light, #666); }
      /* Anomaly */
      .anomaly-icon { color: var(--warning, #FFC107); font-weight: 700; }
      /* MQTT */
      .mqtt-status { padding: 4px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
      .mqtt-status.connected { background: #e8f5e9; color: #2e7d32; }
      .mqtt-status.disconnected { background: #ffebee; color: #c62828; }
      /* Form rows (inside modals, rendered via Bus) */
      .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .form-group { margin-bottom: 12px; }
      .form-group label { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 500; color: var(--text, #333); }
      .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px; border: 1px solid var(--border, #ddd); border-radius: 6px; font-size: 14px; box-sizing: border-box; }
      .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .empty-state { text-align: center; padding: 40px 20px; color: var(--text-light, #888); }
      .empty-state .empty-icon { font-size: 48px; margin-bottom: 8px; }
      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .form-row { grid-template-columns: 1fr; }
        .stat-row { flex-direction: column; align-items: flex-start; }
      }
      /* DataTable extras */
      .dt-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .dt-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .dt-search-input { padding: 6px 12px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); font-size: 13px; min-width: 180px; background: var(--bg, #fff); color: var(--text, #212121); }
      .dt-filter-select, .dt-filter-input, .dt-filter-date, .dt-filter-num { width: 100%; padding: 4px 6px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; box-sizing: border-box; background: var(--bg, #fff); color: var(--text, #212121); }
      .dt-filter-row td { padding: 4px 6px; }
      .dt-card-wrap { position: relative; }
      .dt-table-desktop { display: block; }
      .dt-mobile-cards { display: none; }
      .dt-row-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-bulk-bar { display: flex; align-items: center; justify-content: space-between; background: var(--primary-fill, rgba(74,124,89,.08)); padding: 8px 12px; border-radius: var(--radius, 8px); margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
      .dt-bulk-count { font-weight: 600; font-size: 13px; }
      .dt-bulk-actions { display: flex; gap: 6px; }
      .dt-pagination { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; flex-wrap: wrap; gap: 8px; font-size: 13px; }
      .dt-page-buttons { display: flex; gap: 4px; }
      .dt-page-size { padding: 4px 8px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; background: var(--bg, #fff); }
      .dt-footer-info { font-size: 13px; color: var(--text-light, #757575); padding: 8px 0; }
      .dt-sortable { cursor: pointer; user-select: none; }
      .dt-sorted { color: var(--primary, #4a7c59); }
      .dt-col-picker-wrap { position: relative; }
      .dt-column-picker { position: absolute; right: 0; top: 100%; background: var(--bg, #fff); border: 1px solid var(--border, #e0e0e0); border-radius: 8px; padding: 8px; z-index: 100; min-width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
      .dt-col-option { display: block; padding: 4px 8px; font-size: 13px; cursor: pointer; }
      .dt-card { background: var(--bg, #fff); border-radius: 8px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .dt-card-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-card-title { font-weight: 700; margin-bottom: 6px; }
      .dt-card-field { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
      .dt-card-label { color: var(--text-light, #757575); }
      .dt-card-actions { margin-top: 8px; display: flex; gap: 6px; }
      .dt-card-check { margin-bottom: 6px; }
      .dt-th-check, .dt-td-check { width: 36px; text-align: center; }
      @media (max-width: 768px) {
        .dt-table-desktop { display: none; }
        .dt-mobile-cards { display: block; }
      }
    </style>`;
  }
}

customElements.define('egg-environment', EggEnvironment);
export { EggEnvironment };
export default EggEnvironment;
