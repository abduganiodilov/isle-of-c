import en from './en.js';
import ru from './ru.js';

export const LOCALES = { en, ru };
export const LANGS = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'ru', label: 'Русский', short: 'RU' },
];

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

/** Translate a UI key with {param} interpolation; falls back to English. */
export function t(lang, key, params) {
  let v = lookup(LOCALES[lang] || en, key);
  if (v == null) v = lookup(en, key);
  if (v == null) return key;
  if (typeof v === 'string' && params) {
    return v.replace(/\{(\w+)\}/g, (m, p) => (params[p] != null ? String(params[p]) : m));
  }
  return v;
}

/** Fill positional placeholders {0}, {1} in an array-based message. */
export function fill(text, args = []) {
  return text.replace(/\{(\d+)\}/g, (m, i) => (args[i] != null ? args[i] : m));
}
