/* Bottom panel: tools, helpers, finds, world. Re-rendered only when its signature changes. */
import { CFG } from '../config';
import { S, W, worldNow } from '../state';
import { t, tl, lang, fmtM, fmtN, fmtBig, nf, esc, countryName } from '../i18n';
import { tapPow, idleRate, mult, helperCost, hardAt, metersPerTap, metersPerSec } from '../economy';
import { worldSnapshot, isOnline, type WorldRow } from '../net';
import { popOf } from '../population';
import { friendsMult } from '../economy';
import { em, flag } from './emoji';
import { updateHint } from './toast';
import { bumpTab } from './motion';
import { claimable, isDone, kindOf, secsToMidnight } from '../quests';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export let tab = 'tools';
export type RankMode = 'all' | 'today' | 'capita';
export let rankMode: RankMode = 'all';
export function setRankMode(m: RankMode) { rankMode = m; renderPane(true); }
let paneSig = '';
let shownH = 0; // helper rows rendered so far (new ones slide in)
const coinHTML = '<span class="coin" aria-hidden="true"></span>';

export function selectTab(name: string) {
  tab = name;
  document.querySelectorAll<HTMLElement>('.tab').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
  document.querySelectorAll<HTMLElement>('.pane').forEach(p => { p.hidden = p.id !== 'pane-' + name; });
  if (name === 'finds') { S.newFinds = 0; $('#findsDot').hidden = true; }
  renderPane(true);
}
export function renderPane(force: boolean) {
  const per: Record<string, unknown[]> = { tools: [S.tool], helpers: [S.seenH, S.helpers.join(',')], finds: [Object.keys(S.finds).length], world: [S.country, rankMode, S.friends] };
  const sig = [tab, lang, S.crew, S.stars].concat(per[tab] as string[]).join('|');
  if (force || sig !== paneSig) { paneSig = sig; ({ tools: renderTools, helpers: renderHelpers, finds: renderFinds, world: renderWorld } as Record<string, () => void>)[tab](); }
  refreshAfford();
}
function renderTools() {
  const p = $('#pane-tools'); const cur = CFG.tools[S.tool], nx = CFG.tools[S.tool + 1];
  let h = `<div class="sec-label">${esc(t('current'))}</div>
    <div class="row cur own"><div class="re">${em(cur.e)}</div><div><div class="rn">${esc(t('tools.' + cur.id))}</div><div class="rs">${esc(fmtM(metersPerTap(S)))} ${esc(t('per_tap'))}</div></div><div></div></div>`;
  if (nx) {
    const gain = nx.pow / cur.pow;
    h += `<div class="sec-label">${esc(t('next_tool'))}</div>
      <div class="row"><div class="re">${em(nx.e)}</div><div><div class="rn">${esc(t('tools.' + nx.id))}</div><div class="rs">${esc(fmtM(nx.pow * mult(S) / hardAt(S)))} ${esc(t('per_tap'))} <em>×${esc(nf(gain, 1))}</em></div></div>
      <button class="buy" type="button" data-buy="tool" data-cost="${nx.cost}">${coinHTML}<span>${esc(fmtN(nx.cost))}</span></button></div>`;
  }
  h += `<div class="tool-strip" aria-hidden="true">` + CFG.tools.map((x, i) => `<span class="${i > S.tool + 1 ? 'no' : ''}">${i > S.tool + 1 ? '?' : em(x.e)}</span>`).join('') + `</div>`;
  p.innerHTML = h;
}
function renderHelpers() {
  const p = $('#pane-helpers'); let h = `<div class="sec-label">${esc(t('tab_helpers'))} · ${esc(fmtM(metersPerSec(S)))}${esc(t('per_sec'))}</div>`;
  CFG.helpers.forEach((x, i) => {
    if (i >= S.seenH + 1) return;
    const locked = i >= S.seenH;
    if (locked) { h += `<div class="row locked"><div class="re">${em(x.e)}</div><div><div class="rn">???</div><div class="rs">${esc(t('locked'))}</div></div><div></div></div>`; return; }
    const cost = helperCost(i, S.helpers[i]);
    h += `<div class="row ${S.helpers[i] ? 'own' : ''} ${i >= shownH ? 'reveal' : ''}" style="--i:${i}"><div class="re">${em(x.e)}</div><div><div class="rn">${esc(t('helpers.' + x.id))}<span class="count">${S.helpers[i] ? '×' + S.helpers[i] : ''}</span></div><div class="rs">+${esc(fmtM(x.rate * mult(S) / hardAt(S)))}${esc(t('per_sec'))}</div></div>
      <button class="buy" type="button" data-buy="h" data-i="${i}" data-cost="${cost}">${coinHTML}<span>${esc(fmtN(cost))}</span></button></div>`;
  });
  const capH = (S.crew ? CFG.offlineCapCrew : CFG.offlineCapFree) / 3600; const rate = metersPerSec(S);
  if (rate > 0) h += `<div class="note">${em('😴')} ${esc(t('offline_preview', { h: capH }))} · +${esc(fmtM(rate * capH * 3600))}${S.crew ? '' : ` <button class="link" type="button" data-act="gold" data-src="offline_preview">${esc(t('offline_gold'))}</button>`}</div>`;
  p.innerHTML = h; shownH = Math.max(shownH, S.seenH);
}
function renderFinds() {
  const p = $('#pane-finds'); const wc = W(), L = wc.layers; const total = L.length * 4; const got = L.reduce((n, l) => { for (let r = 0; r < 4; r++) if (S.finds[l.id + ':' + r]) n++; return n; }, 0);
  const w = worldNow();
  let h = `<div class="finds-head"><b>${S.world || S.lap ? em(w.e) + ' ' : ''}${esc(t('finds_title'))}</b><span>${got} / ${total}</span></div><div class="hint-text">${esc(t('finds_hint'))}</div>`;
  L.forEach(l => {
    h += `<div class="fl"><div class="ln">${esc(t('layers.' + l.id))}</div>`;
    const names = tl('finds.' + l.id);
    for (let r = 0; r < 4; r++) { const n = S.finds[l.id + ':' + r]; const col = CFG.rarity[r].color;
      h += n ? `<div class="cell got" style="--rc:${col}" title="${esc(names[r] || '')}">${em(wc.finds[l.id][r])}<i>${n > 1 ? n : ''}</i></div>` : `<div class="cell" style="--rc:${col}">?</div>`; }
    h += `</div>`;
  });
  p.innerHTML = h;
}
/* World tab: season hole, humanity total, my country, ranking with three modes (all time / today / per capita, SPEC §2.5 p.5) */
const rankValue = (r: WorldRow) => rankMode === 'today' ? r.today : rankMode === 'capita' ? r.m / (popOf(r.cc) * 1e6) : r.m;
const rankLabel = (r: WorldRow) => rankMode === 'capita' ? `${nf(rankValue(r), rankValue(r) < 10 ? 2 : 0)} ${t('m')}/${t('person')}` : fmtBig(rankValue(r));
function renderWorld() {
  const p = $('#pane-world'); const w = worldSnapshot();
  const rows = w.rows.slice().sort((a, b) => rankValue(b) - rankValue(a));
  const rank = rows.findIndex(r => r.cc === S.country) + 1;
  const top = rows.slice(0, 10); if (rank > 10) top.push(rows[rank - 1]);
  const max = rows.length ? rankValue(rows[0]) : 1;
  const se = w.season; const now = Date.now();
  let h = '';
  if (se) {
    const frac = Math.min(1, se.depth / CFG.earthR); const left = Math.max(0, CFG.earthR - se.depth);
    const boost = se.doneAt && se.boostUntil > now;
    h += `<div class="big-stat season ${boost ? 'boost' : ''}"><small>${em('🕳️')} ${esc(t('world_hole'))} · ${esc(t('season_n', { n: se.n }))}</small><strong>${esc(fmtM(se.depth))}</strong>
      <div class="wline"><i style="width:${(frac * 100).toFixed(2)}%"></i></div>
      <span>${esc(boost ? t('boost_left', { t: fmtDur((se.boostUntil - now) / 1000) }) : t('to_core_left', { d: fmtM(left) }))}</span></div>`;
  }
  h += `<div class="big-stat"><small>${em('🌍')} ${esc(t('world_total'))}</small><strong id="wTotal">${esc(fmtBig(w.total))}</strong><span id="wThrough">${esc(t('through_x', { n: fmtN(w.total / CFG.through) }))}</span></div>
    <div class="mine"><div class="mf">${flag(S.country)}</div><div class="mt"><b>${esc(t('your_country'))} ${esc(countryName(S.country))} · #${rank || '–'}</b><span>${esc(t('you_add', { m: fmtM(S.lifetime) }))}${S.friends ? ' · ' + em('🤝') + ' ' + esc(t('friends_n', { n: S.friends, p: Math.round((friendsMult(S.friends) - 1) * 100) })) : ''}</span></div><button class="chg" type="button" data-act="country">${esc(t('change'))}</button></div>
    <div class="seg" role="tablist">${(['all', 'today', 'capita'] as RankMode[]).map(m => `<button type="button" role="tab" class="${m === rankMode ? 'on' : ''}" data-rank="${m}">${esc(t('rank_' + m))}</button>`).join('')}</div>
    <div>`;
  top.forEach(r => { const n = rows.indexOf(r) + 1;
    h += `<div class="rk ${r.cc === S.country ? 'me' : ''}"><div class="n">${n}</div><div class="f">${flag(r.cc)}</div><div class="c"><div>${esc(countryName(r.cc))}</div><i><u style="width:${(max > 0 ? rankValue(r) / max * 100 : 0).toFixed(1)}%"></u></i></div><div class="v">${esc(rankLabel(r))}</div></div>`; });
  h += `</div>${w.demo ? `<div class="demo">${esc(t('demo'))}</div>` : `<div class="demo live">${esc(t('live_world'))}${isOnline() ? '' : ' · ' + esc(t('reconnecting'))}</div>`}`;
  p.innerHTML = h;
}
export function fmtDur(sec: number) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? `${h} ${t('h')} ${m} ${t('min')}` : `${m} ${t('min')}`; }
export function questLabel(q: { id: string; target: number }) { return t('quest_' + q.id, { n: q.id === 'meters' ? fmtM(q.target) : String(q.target) }); }
export function renderQuestStrip() {
  const strip = $('#quests'); const list = S.q.list; if (!list.length) { strip.hidden = true; return; } strip.hidden = false;
  const ready = claimable(); const q = ready[0] || list.find(x => !x.claimed) || null;
  const streak = S.daily.streak >= 2 ? ` · 🔥${S.daily.streak}` : '';
  if (!q) { $('#qE').innerHTML = em('🎯'); $('#qT').textContent = t('quests_reset', { t: fmtDur(secsToMidnight()) }) + streak; $('#qBar').style.width = '100%'; $('#qR').textContent = ''; strip.classList.remove('ready'); return; }
  $('#qE').innerHTML = em(kindOf(q.id).e); $('#qT').textContent = questLabel(q) + streak;
  $('#qBar').style.width = (Math.min(1, q.prog / q.target) * 100).toFixed(1) + '%';
  $('#qR').innerHTML = isDone(q) ? em('🎁') : `${list.filter(x => x.claimed).length}/${list.length}`;
  strip.classList.toggle('ready', ready.length > 0);
}
export function refreshAfford() {
  renderQuestStrip();
  document.querySelectorAll<HTMLElement>('.buy[data-cost]').forEach(b => {
    const can = S.coins >= +(b.dataset.cost || 0); b.classList.toggle('can', can);
    b.classList.toggle('pulse', can && S.onboard === 1 && b.dataset.buy === 'tool' && S.tool === 0);
  });
  if (S.seenH < CFG.helpers.length && S.coins >= CFG.helpers[S.seenH].cost * 0.5) { S.seenH++; if (tab !== 'helpers') bumpTab('helpers'); }
  updateHint();
}
