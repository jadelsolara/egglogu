// EGGlogU i18n Module — Translation system with locale support
// Manages language state, T dictionary, locale map, and RTL

import { Bus } from './bus.js';

const LOCALE_MAP = {
  es: 'es-CL', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR',
  de: 'de-DE', it: 'it-IT', ja: 'ja-JP', zh: 'zh-CN',
  ko: 'ko-KR', ar: 'ar-SA', hi: 'hi-IN', ru: 'ru-RU',
  id: 'id-ID', th: 'th-TH', vi: 'vi-VN'
};

const LANG_NAMES = {
  es: 'Español', en: 'English', pt: 'Português', fr: 'Français',
  de: 'Deutsch', it: 'Italiano', ja: '日本語', zh: '中文',
  ru: 'Русский', id: 'Bahasa Indonesia', ar: 'العربية',
  ko: '한국어', th: 'ไทย', vi: 'Tiếng Việt'
};

// The translation dictionary — populated by registerTranslations()
let _T = {};
let _lang = localStorage.getItem('egglogu_lang') || 'es';

/**
 * Register translation dictionaries. Merges into existing.
 * @param {Object} translations - { es: {...}, en: {...}, ... }
 */
export function registerTranslations(translations) {
  for (const [lang, entries] of Object.entries(translations)) {
    if (!_T[lang]) _T[lang] = {};
    Object.assign(_T[lang], entries);
  }
}

/**
 * Translate a key. Falls back to Spanish, then to the key itself.
 */
export function t(k) {
  return (_T[_lang] && _T[_lang][k]) || (_T.es && _T.es[k]) || k;
}

/**
 * Get current language code.
 */
export function getLang() {
  return _lang;
}

/**
 * Get locale string for Intl formatting.
 */
export function locale() {
  return LOCALE_MAP[_lang] || 'en-US';
}

/**
 * Check if current language is RTL.
 */
export function isRTL() {
  return _lang === 'ar';
}

/**
 * Switch language. Updates localStorage, HTML attributes, emits event.
 */
export function switchLang(lang) {
  if (!LOCALE_MAP[lang]) return;
  _lang = lang;
  try { localStorage.setItem('egglogu_lang', lang); } catch (e) { /* quota */ }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  Bus.emit('lang:changed', { lang, locale: locale(), name: LANG_NAMES[lang] || lang });
}

/**
 * Get the full T dictionary (for legacy compat during migration).
 */
export function getTranslations() {
  return _T;
}

/**
 * Set the full T dictionary (for legacy compat — bulk load from monolith).
 */
export function setTranslations(T) {
  _T = T;
}

export { LOCALE_MAP, LANG_NAMES };
