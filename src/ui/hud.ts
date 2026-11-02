/* Top bar + depth readout + ticker. Called ~15×/s from the loop. */
import { CFG } from '../config';
import { S } from '../state';
import { t, fmtM, fmtN, fmtBig, nf, esc, countryName } from '../i18n';
import { layerAt, nextBound, prevBound, clamp, comboMult, type LayerInfo } from '../economy';
import { worldSnapshot, onOvertake, isOnline } from '../net';
import { em, flag } from './emoji';
import { ANTI } from '../antipodes';
import { flagOf } from './emoji';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const L = CFG.layers;
export function antipodeOf(cc: string | null) {
  const a = cc ? ANTI[cc] : null; const res = a ? a[2] : '~PAC';
  if (res[0] === '~') { const o = res.slice(1); return { ocean: true, e: '🌊', name: t('oceans.' + o) }; }
  return { ocean: false, e: flagOf(res), name: countryName(res) };
}
export function layerName(la: LayerInfo) { return t('layers.' + la.layer.id) + (la.far ? ' · ' + t('far') : ''); }

export interface HudInput { combo: number; lastTap: number; frenzy: boolean }
const NSEG = 2 * L.length;
let jInit = '';
/* journey bar: 18 equal segments (down, then mirrored up), marker = segment + progress inside it */
function updateJourney(seg: number, frac: number) {
  const key = (S.country || '') + '|' + document.documentElement.lang;
  if (jInit !== key) { jInit = key;
    const cols = L.map(l => l.c[0]); const all = cols.concat(cols.slice().reverse());
    $('#jBar').style.background = `linear-gradient(${all.map((c, i) => `${c} ${(i / NSEG * 100).toFixed(2)}% ${((i + 1) / NSEG * 100).toFixed(2)}%`).join(',')})`;
    $('#jFrom').innerHTML = flag(S.country); const out = antipodeOf(S.country); $('#jTo').innerHTML = em(out.e);
    $('#journey').setAttribute('aria-label', t('journey_title')); }
  $('#jPos').style.top = (clamp((seg + frac) / NSEG, 0, 1) * 100).toFixed(2) + '%';
}
export function nextMilestone() { for (const m of CFG.milestones) if (S.depth < m.d) return m; return null; }
export function updateHud(inp: HudInput) {
  $('#coins').textContent = fmtN(S.coins);
  $('#depth').textContent = fmtM(S.depth);
  const la = layerAt(S.depth); $('#layerName').textContent = layerName(la);
  const nb = nextBound(S.depth), pb = prevBound(S.depth);
  $('#nextInfo').textContent = nb.out ? '' : t('next') + ': ' + (nb.center ? t('center_short') : t('layers.' + L[nb.i].id)) + ' · ' + fmtM(nb.d - S.depth);
  const frac = clamp((S.depth - pb) / Math.max(1e-9, nb.d - pb), 0, 1);
  $('#layerBar').style.width = (frac * 100) + '%';
  updateJourney(la.seg, frac);
  const nm = nextMilestone(); const out = antipodeOf(S.country);
  $('#nextMs').innerHTML = nm ? `${em('📍')} ${esc(t('next_ms', { n: t('ms_names.' + nm.k), d: fmtM(nm.d - S.depth) }))}` : `${em(out.e)} ${esc(t('next_ms', { n: out.name, d: fmtM(CFG.through - S.depth) }))}`;
  const far = S.depth > CFG.earthR;
  const pct = far ? (S.depth - CFG.earthR) / CFG.earthR * 100 : S.depth / CFG.earthR * 100;
  $('#coreInfo').textContent = (pct < 0.01 ? '<0.01' : pct < 10 ? nf(pct, 2) : nf(pct, 1)) + '% ' + t(far ? 'to_out' : 'to_core') + (S.stars ? '  ·  ★' + S.stars : '') + (S.boost ? '  ·  ×' + CFG.world.boostMult + ' 🌍' : '');
  const c = $('#combo');
  if (inp.frenzy) { c.hidden = false; c.textContent = t('frenzy', { x: CFG.nugget.frenzyMult }); }
  else if (inp.combo >= 5 && performance.now() - inp.lastTap < 700) { c.hidden = false; c.textContent = '×' + nf(comboMult(inp.combo), 1); }
  else c.hidden = true;
  $('#goldLabel').textContent = S.crew ? t('gold_on') : t('gold'); $('#btnGold').classList.toggle('on', S.crew);
  const snd = $('#btnSound'); const se = S.sound ? '🔊' : '🔇'; if (snd.dataset.e !== se) { snd.dataset.e = se; snd.innerHTML = em(se); }
  const cb = $('#btnCountry'); if (cb.dataset.cc !== S.country) { cb.dataset.cc = S.country || ''; cb.innerHTML = flag(S.country); }
  updateTicker();
}
/* Ticker: alternates the world hole (season depth) and the country line every 5 s; overtakes (SPEC §2.5 p.6) jump the queue. */
let lastTicker = 0, tickerPhase = 0, tickerSince = 0; const overtakeQ: string[] = [];
onOvertake(o => { overtakeQ.push(`${flag(o.a)} ${esc(t('overtake', { a: countryName(o.a), b: countryName(o.b) }))}`); if (overtakeQ.length > 5) overtakeQ.shift(); });
function updateTicker() {
  const tms = Date.now(); if (tms - lastTicker < 500) return; lastTicker = tms;
  const w = worldSnapshot(); const rank = w.rows.findIndex(r => r.cc === S.country) + 1; const lead = w.rows[0];
  if (tms - tickerSince > 5000) { tickerSince = tms; tickerPhase = overtakeQ.length ? 2 : tickerPhase === 0 ? 1 : 0; }
  let html: string;
  if (tickerPhase === 2) { html = overtakeQ.shift() || ''; tickerSince = tms; tickerPhase = 1; if (!html) tickerPhase = 0; }
  else if (tickerPhase === 1 && w.season) {
    const d = w.season.depth; const left = Math.max(0, CFG.earthR - d);
    html = `${em('🕳️')} ${esc(t('world_hole'))} <b>${esc(fmtM(d))}</b> · ${esc(w.season.doneAt ? t('boost_on') : t('to_core_left', { d: fmtM(left) }))}`;
  } else html = `${em('🌍')} ${esc(t('world_total'))} <b>${esc(fmtBig(w.total))}</b>` + (lead ? ` · ${flag(lead.cc)} #1` : '') + (rank > 1 ? ` · ${flag(S.country)} <b>#${rank}</b>` : '');
  if (w.demo) html += ` · <span>${esc(t('demo_short'))}</span>`;
  const el = $('#ticker'); if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  const bar = $('#wBar'); if (bar) { const frac = w.season ? clamp(w.season.depth / CFG.earthR, 0, 1) : 0; bar.style.width = (frac * 100).toFixed(2) + '%'; bar.parentElement!.classList.toggle('live', isOnline() && !w.demo); }
}
