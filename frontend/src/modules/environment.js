/**
 * EGGlogU — Environment Module
 * Ambient conditions (temperature, humidity, light), IoT, weather.
 * Extracted from egglogu.js lines ~4419-4540.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Optimal Ranges ──────────────────────────────────────

export const OPTIMAL_RANGES = {
  temperature: { min: 18, max: 24, unit: 'C' },
  humidity: { min: 40, max: 70, unit: '%' },
  lightHours: { min: 14, max: 16, unit: 'hrs' },
  ammonia: { max: 25, unit: 'ppm' },
};

// ── Environment Readings ────────────────────────────────

export function addEnvironmentReading(reading) {
  const data = getData();
  const entry = {
    id: genId(),
    date: reading.date || todayStr(),
    temperature: parseFloat(reading.temperature) || null,
    humidity: parseFloat(reading.humidity) || null,
    lightHours: parseFloat(reading.lightHours) || null,
    ammonia: parseFloat(reading.ammonia) || null,
    ventilation: reading.ventilation || '',
    notes: reading.notes || '',
    source: reading.source || 'manual',
    createdAt: new Date().toISOString(),
  };

  data.environment.push(entry);
  saveData();
  bus.emit(Events.ENV_READING_ADDED, entry);
  return entry;
}

export function deleteEnvironmentReading(id) {
  const data = getData();
  data.environment = data.environment.filter((e) => e.id !== id);
  saveData();
}

export function getLatestReading() {
  const data = getData();
  return data.environment.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

export function getEnvironmentHistory(days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  return data.environment
    .filter((e) => e.date >= cutoffStr)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── THI (Temperature-Humidity Index) ────────────────────

export function calculateTHI(tempC, humidityPct) {
  if (tempC == null || humidityPct == null) return null;
  // THI = 0.8 * T + (RH/100) * (T - 14.4) + 46.4
  const thi = 0.8 * tempC + (humidityPct / 100) * (tempC - 14.4) + 46.4;
  return Math.round(thi * 10) / 10;
}

export function getTHIStatus(thi) {
  if (thi == null) return 'unknown';
  if (thi < 72) return 'normal';
  if (thi < 78) return 'alert';
  if (thi < 82) return 'danger';
  return 'emergency';
}

// ── Reading Status ──────────────────────────────────────

export function getReadingStatus(reading) {
  const status = {};
  const r = OPTIMAL_RANGES;

  if (reading.temperature != null) {
    const t = reading.temperature;
    status.temperature = t >= r.temperature.min && t <= r.temperature.max ? 'ok' : t < r.temperature.min ? 'low' : 'high';
  }

  if (reading.humidity != null) {
    const h = reading.humidity;
    status.humidity = h >= r.humidity.min && h <= r.humidity.max ? 'ok' : h < r.humidity.min ? 'low' : 'high';
  }

  if (reading.lightHours != null) {
    const l = reading.lightHours;
    status.lightHours = l >= r.lightHours.min && l <= r.lightHours.max ? 'ok' : l < r.lightHours.min ? 'low' : 'high';
  }

  if (reading.ammonia != null) {
    status.ammonia = reading.ammonia <= r.ammonia.max ? 'ok' : 'high';
  }

  return status;
}

// ── IoT Bridge ──────────────────────────────────────────

export function saveIoTToEnvironment(iotReading) {
  return addEnvironmentReading({
    ...iotReading,
    source: 'iot',
  });
}

// Backward compatibility
window.addEnvironmentReading = addEnvironmentReading;
window.calculateTHI = calculateTHI;
window.getLatestReading = getLatestReading;
