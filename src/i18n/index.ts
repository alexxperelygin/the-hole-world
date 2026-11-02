/* Strings live in src/i18n/<lang>.json. English is bundled; other languages load on demand. */
import { CFG } from '../config';
import en from './en.json';

type Dict = Record<string, unknown>;
const loaders = import.meta.glob<{ default: Dict }>('./*.json');
const dicts: Record<string, Dict> = { en };
export let lang = 'en';
export const LANGS: string[] = CFG.langs;

const pick = (o: Dict | undefined, k: string): unknown => k.split('.').reduce<unknown>((a, p) => (a == null ? a : (a as Dict)[p]), o);

export function t(k: string, vars?: Record<string, string | number>): string {
  let s = pick(dicts[lang], k); if (s == null) s = pick(en, k); if (s == null) s = k;
  if (vars && typeof s === 'string') { let str: string = s; for (const v in vars) str = str.split('{' + v + '}').join(String(vars[v])); return str; }
  return typeof s === 'string' ? s : String(s);
}
/* arrays (find names per layer) */
export function tl(k: string): string[] { const v = pick(dicts[lang], k) ?? pick(en, k); return Array.isArray(v) ? v as string[] : []; }

export async function loadLang(l: string): Promise<string> {
  if (!LANGS.includes(l)) l = 'en';
  if (!dicts[l]) { const ld = loaders['./' + l + '.json']; if (ld) { try { dicts[l] = (await ld()).default; } catch { l = 'en'; } } else l = 'en'; }
  lang = l; regionNames = null; return l;
}
/* pick the best supported language for a navigator language list */
export function detectLang(list: readonly string[] = navigator.languages || [navigator.language || 'en']): string {
  for (const raw of list) {
    const l = raw.replace('_', '-'); const base = l.split('-')[0].toLowerCase();
    if (LANGS.includes(l)) return l;
    if (base === 'pt') return 'pt-BR';
    if (base === 'zh') return 'zh-CN';
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}
export const LANG_NAMES: Record<string, string> = { en: 'English', ru: 'Русский', es: 'Español', 'pt-BR': 'Português', id: 'Bahasa Indonesia', tr: 'Türkçe', de: 'Deutsch', fr: 'Français', ja: '日本語', ko: '한국어', 'zh-CN': '中文', hi: 'हिन्दी' };

let regionNames: (Intl.DisplayNames & { _l?: string }) | null = null;
export function countryName(cc: string | null): string {
  if (!cc) return '';
  try { if (!regionNames || regionNames._l !== lang) { regionNames = new Intl.DisplayNames([lang], { type: 'region' }); regionNames._l = lang; } return regionNames.of(cc) || cc; } catch { return cc; }
}

/* number formatting */
export function nf(n: number, d = 0): string { try { return n.toLocaleString(lang, { maximumFractionDigits: d, minimumFractionDigits: d }); } catch { return n.toFixed(d); } }
export function fmtM(m: number): string {
  if (m < 100) return nf(m, 1) + ' ' + t('m');
  if (m < 10000) return nf(Math.floor(m)) + ' ' + t('m');
  const km = m / 1000;
  if (km < 1000) return nf(km, 1) + ' ' + t('km');
  return nf(Math.floor(km)) + ' ' + t('km');
}
/* world-scale meters: exact below 10 000 km, compact (1.20B km) above */
export function fmtBig(m: number): string { return m < 1e7 ? fmtM(m) : fmtN(m / 1000) + ' ' + t('km'); }
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
export function fmtN(n: number): string {
  n = Math.floor(n);
  if (n < 10000) return nf(n);
  let i = 0; while (n >= 1000 && i < SUF.length - 1) { n /= 1000; i++; }
  return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + SUF[i];
}
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
