```javascript
import { describe, it, expect, vi } from 'vitest';
import { sanitizeInput, validateEggProduction, validateFlockSize, validateDate, fitProductionCurve, classifyOutbreak, switchLang, calculateFeedCost, calculateROI, saveToLocalStorage, loadFromLocalStorage, exportData, importData, toggleDarkMode, toggleCampoMode, toggleVetMode } from './egglogu';

describe('Security Functions', () => {
  it('sanitizeInput should remove script tags', () => {
    const input = '<script>alert("XSS")</script>';
    const sanitized = sanitizeInput(input);
    expect(sanitized).toBe('');
  });

  it('sanitizeInput should remove on* attributes', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const sanitized = sanitizeInput(input);
    expect(sanitized).toBe('<img src="x">');
  });

  it('sanitizeInput should allow safe HTML', () => {
    const input = '<b>Bold Text</b>';
    const sanitized = sanitizeInput(input);
    expect(sanitized).toBe('<b>Bold Text</b>');
  });
});

describe('Data Validation', () => {
  it('validateEggProduction should return true for valid range', () => {
    expect(validateEggProduction(100)).toBe(true);
  });

  it('validateEggProduction should return false for negative value', () => {
    expect(validateEggProduction(-10)).toBe(false);
  });

  it('validateEggProduction should return false for value above max', () => {
    expect(validateEggProduction(10001)).toBe(false);
  });

  it('validateFlockSize should return true for valid range', () => {
    expect(validateFlockSize(100)).toBe(true);
  });

  it('validateFlockSize should return false for negative value', () => {
    expect(validateFlockSize(-10)).toBe(false);
  });

  it('validateFlockSize should return false for value above max', () => {
    expect(validateFlockSize(100001)).toBe(false);
  });

  it('validateDate should return true for valid date', () => {
    expect(validateDate('2023-10-01')).toBe(true);
  });

  it('validateDate should return false for invalid date', () => {
    expect(validateDate('2023-13-01')).toBe(false);
  });

  it('validateDate should return false for future date', () => {
    expect(validateDate('2030-10-01')).toBe(false);
  });
});

describe('ML/Statistics Functions', () => {
  it('fitProductionCurve should return a valid curve', () => {
    const data = [100, 150, 200, 250, 300];
    const curve = fitProductionCurve(data);
    expect(curve).toBeDefined();
  });

  it('classifyOutbreak should return "low" for low severity', () => {
    const data = { deaths: 10, affected: 50 };
    const severity = classifyOutbreak(data);
    expect(severity).toBe('low');
  });

  it('classifyOutbreak should return "high" for high severity', () => {
    const data = { deaths: 100, affected: 500 };
    const severity = classifyOutbreak(data);
    expect(severity).toBe('high');
  });
});

describe('Translation System', () => {
  it('switchLang should change language to English', () => {
    switchLang('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switchLang should change language to Spanish', () => {
    switchLang('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('switchLang should cover all keys', () => {
    const keys = Object.keys(T.es);
    keys.forEach(key => {
      expect(document.querySelector(`[data-t="${key}"]`)).not.toBeNull();
    });
  });
});

describe('Financial Calculations', () => {
  it('calculateFeedCost should return correct cost', () => {
    const cost = calculateFeedCost(100, 5);
    expect(cost).toBe(500);
  });

  it('calculateROI should return correct ROI', () => {
    const roi = calculateROI(1000, 1200);
    expect(roi).toBe(20);
  });

  it('calculateROI should handle zero cost', () => {
    const roi = calculateROI(0, 1200);
    expect(roi).toBe(0);
  });
});

describe('Data Persistence', () => {
  it('saveToLocalStorage should save data', () => {
    saveToLocalStorage('testKey', { test: 'data' });
    expect(localStorage.getItem('testKey')).toBe(JSON.stringify({ test: 'data' }));
  });

  it('loadFromLocalStorage should load data', () => {
    localStorage.setItem('testKey', JSON.stringify({ test: 'data' }));
    const data = loadFromLocalStorage('testKey');
    expect(data).toEqual({ test: 'data' });
  });

  it('exportData should return JSON string', () => {
    const data = { test: 'data' };
    const exported = exportData(data);
    expect(exported).toBe(JSON.stringify(data));
  });

  it('importData should import JSON string', () => {
    const data = JSON.stringify({ test: 'data' });
    importData(data);
    expect(localStorage.getItem('importedData')).toBe(data);
  });
});

describe('UI Mode Switching', () => {
  it('toggleDarkMode should switch to dark mode', () => {
    toggleDarkMode();
    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });

  it('toggleDarkMode should switch back to light mode', () => {
    toggleDarkMode();
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('toggleCampoMode should switch to campo mode', () => {
    toggleCampoMode();
    expect(document.body.classList.contains('campo-mode')).toBe(true);
  });

  it('toggleCampoMode should switch back to normal mode', () => {
    toggleCampoMode();
    expect(document.body.classList.contains('campo-mode')).toBe(false);
  });

  it('toggleVetMode should switch to vet mode', () => {
    toggleVetMode();
    expect(document.body.classList.contains('vet-mode')).toBe(true);
  });

  it('toggleVetMode should switch back to normal mode', () => {
    toggleVetMode();
    expect(document.body.classList.contains('vet-mode')).toBe(false);
  });
});
```