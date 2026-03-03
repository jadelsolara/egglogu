/**
 * EGGlogU — Translation System
 * i18n translations for 8 languages.
 * Extracted from egglogu.js lines 40-987.
 *
 * NOTE: The full translation dictionary (~950 lines) remains in egglogu.js during
 * migration Phase A. This module provides the translation lookup function and
 * will be the single source of truth once the full extraction is complete.
 *
 * For now, this module:
 * 1. Reads the T dictionary from egglogu.js (via window.T)
 * 2. Exports the t() function for new modular code
 * 3. Falls back gracefully if T is not yet loaded
 */

// Language state
let currentLang = localStorage.getItem('egglogu_lang') || 'es';

/**
 * Get translation for key.
 * @param {string} key - Translation key
 * @returns {string} Translated string or key itself as fallback
 */
export function t(key) {
  const T = window.T || {};
  return (T[currentLang] && T[currentLang][key]) || (T.es && T.es[key]) || key;
}

/**
 * Get current language code.
 */
export function getLang() {
  return currentLang;
}

/**
 * Set language and persist.
 */
export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('egglogu_lang', lang);
  window.LANG = lang;
}

/**
 * Get all supported languages.
 */
export function getSupportedLangs() {
  return [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'English' },
    { code: 'pt', name: 'Português' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' },
  ];
}

// Backward compatibility
window.t = t;
window.LANG = currentLang;
