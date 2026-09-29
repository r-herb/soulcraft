// Tiny i18n: t('key', {vars}), live language switching without reload.
import en from './en.json';
import ru from './ru.json';
import es from './es.json';
import lv from './lv.json';

const DICTS = { en, ru, es, lv };
export const LANGS = ['en', 'ru', 'es', 'lv'];
// each language's name in itself (for the pickers)
export const LANG_NAMES = { en: 'English', ru: 'Русский', es: 'Español', lv: 'Latviešu' };
let lang = 'en';
const listeners = new Set();

function lookup(dict, key) {
  if (key in dict) return dict[key];
  return undefined;
}

export function t(key, vars) {
  let s = lookup(DICTS[lang], key);
  if (s === undefined) s = lookup(DICTS.en, key);
  if (s === undefined) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
  return s;
}

// Plural forms. Russian: one (1, 21), few (2-4, 22-24), many (5-20, 25...);
// Latvian: one (1, 21, 31 but not 11), many (the rest).
export function plural(n, forms) {
  if (lang === 'lv') return n % 10 === 1 && n % 100 !== 11 ? forms.one : forms.many;
  if (lang !== 'ru') return n === 1 ? forms.one : forms.many;
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms.one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms.few;
  return forms.many;
}

export function detectLang() {
  try {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    for (const n of list) {
      const code = String(n).slice(0, 2).toLowerCase();
      if (DICTS[code]) return code;
    }
    return 'en';
  } catch { return 'en'; }
}

export function getLang() { return lang; }

export function setLang(l) {
  if (!DICTS[l]) l = 'en';
  if (l === lang) return;
  lang = l;
  document.documentElement.lang = l;
  applyI18n(document);
  listeners.forEach((fn) => { try { fn(l); } catch (e) { console.warn(e); } });
}

export function initLang(l) { lang = DICTS[l] ? l : 'en'; document.documentElement.lang = lang; }

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Fill [data-i18n] text and [data-i18n-*] attributes.
export function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => el.setAttribute('title', t(el.dataset.i18nTitle)));
}

export function allKeys(l) { return Object.keys(DICTS[l]); }
