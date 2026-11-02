/* Core mechanics, modals and the frame loop. Economy maths lives in economy.ts; this file wires it to input, scene and UI. */
import { CFG } from './config';
import { ANTI } from './antipodes';
import { S, setState, save, store, SAVE_KEY, freshState, loadSaved, makeRefCode, W, worldNow } from './state';
import * as E from './economy';
import { t, tl, lang, loadLang, detectLang, LANGS, LANG_NAMES, fmtM, fmtN, nf, esc, countryName } from './i18n';
import { Snd, buzz } from './audio';
import * as scene from './scene';
import { em, flag, applyEmoji } from './ui/emoji';
import { toast, banner, updateHint } from './ui/toast';
import { openModal, closeModal, modalOpen, onAction, sheetEl } from './ui/modal';
import { renderPane, selectTab, tab, setRankMode, type RankMode } from './ui/panel';
import { flyCoins, bumpTab, nope, pop } from './ui/motion';
import { updateHud, layerName, nextMilestone, goalOf } from './ui/hud';
import { openShare, nativeShare, openSocial, copyShare, downloadCard } from './share';
import { canInstall, promptInstall, onInstallChange } from './pwa';
import * as Q from './quests';
import { track } from './analytics';
import { questLabel, fmtDur } from './ui/panel';
import { incomingRef, isTelegram, tgLang, openUrl, tg } from './platform/telegram';
import * as net from './net';
import { fromSaved } from './state';
import { PASSES, STARS_PRICE, ITEMS, isItem, type ItemId } from './pay-plans';
import { createCheckout, consumePaidReturn, debugFlag, waitForGold, waitForItem, setPending, takePending } from './pay';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const VERSION = __APP_VERSION__;

/* ---------------- core ---------------- */
let combo = 0, lastTap = 0, frenzyUntil = 0, tapStamps: number[] = [];
let breaking = false;

/* spend `effort` (tool/helper output) on the current layer; meters = effort / hardness. The country gets the effort (server units). */
export function addMeters(effort: number, offline = false) {
  if (S.depth >= W().through || effort <= 0) return;
  const before = S.depth;
  const r = E.dig(S, effort);
  S.lifetime += r.m; net.addDelta(r.effort); if (S.depth > S.best) S.best = S.depth;
  if (!offline) questProgress('meters', r.m);
  checkProgress(before);
}

function tap(ev: PointerEvent | null) {
  Snd.init();
  const tnow = performance.now();
  tapStamps = tapStamps.filter(s => tnow - s < 1000); if (tapStamps.length >= CFG.tapsPerSecCap) return; tapStamps.push(tnow);
  combo = (tnow - lastTap < CFG.comboWindow) ? combo + 1 : 1; lastTap = tnow;
  const fr = tnow < frenzyUntil ? CFG.nugget.frenzyMult : 1;
  const m = E.tapPow(S) * E.comboMult(combo) * fr * E.tiredMult(S.fat, Date.now(), S.crew);
  const la = E.layerAt(S.depth, W()); const shown = m / la.hard;
  addMeters(m); S.taps++; net.noteTap(tnow); questProgress('taps'); if (S.taps === 1) track('first_tap'); else if (S.taps === 100) track('tap_100'); if (combo >= CFG.comboMax) questProgress('combo');
  scene.swing(); scene.kick(2.5 + (fr > 1 ? 3 : 0));
  const r = scene.scene.getBoundingClientRect(); const dY = scene.digY();
  scene.burst(scene.cw / 2 + 20, dY, 7 + Math.min(8, combo / 4) | 0, la);
  const px = ev && ev.clientX != null ? ev.clientX - r.left : scene.cw / 2; const py = ev && ev.clientY != null ? ev.clientY - r.top : dY - 60;
  scene.pushFloat({ x: E.clamp(px, 40, scene.cw - 40), y: E.clamp(py, 120, scene.ch - 20) - 18, s: '+' + fmtM(shown), life: 0.8, c: fr > 1 ? '#ffc21a' : '#fff' });
  Snd.dig(la.seg); buzz(6);
  if (S.onboard < 1 && S.taps >= 3) { S.onboard = 1; updateHint(); }
  rollFind(px, py);
}

function rollFind(px: number, py: number) {
  if (S.depth >= W().through || Math.random() > CFG.findChance) return;
  const la = E.layerAt(S.depth, W()); const r = E.pickRarity(Math.random()); const key = la.layer.id + ':' + r;
  const isNew = !S.finds[key]; S.finds[key] = (S.finds[key] || 0) + 1;
  const bonus = E.findBonus(S, r); S.coins += bonus;
  const e = W().finds[la.layer.id][r]; const name = tl('finds.' + la.layer.id)[r] || '';
  scene.pushFloat({ x: E.clamp(px, 40, scene.cw - 40), y: E.clamp(py, 140, scene.ch - 30) - 40, s: e, big: true, life: 1.2 });
  Snd.find(r); buzz(r >= 2 ? 30 : 12); if (r >= 2) scene.kick(7);
  if (isNew) { S.newFinds++; $('#findsDot').hidden = false; if (tab !== 'finds') bumpTab('finds'); checkCollection(la.layer.id); }
  questProgress('finds');
  flyCoins(null, 0);
  if (r === 3) showLegend(e, name, la);
  else toast(e, (isNew ? '★ ' : '') + t('rarity.' + CFG.rarity[r].id), name + '  +' + fmtN(bonus), CFG.rarity[r].color);
}

function checkProgress(before: number) {
  const wc = W(); const la = E.layerAt(S.depth, wc);
  if (la.seg !== S.seg) { S.seg = la.seg; banner(layerName(la)); Snd.boom(); buzz(40); scene.kick(10); pop($('#depth'), 1.12); }
  for (const ms of wc.milestones) if (!S.ms[ms.k] && before < ms.d && S.depth >= ms.d) { S.ms[ms.k] = 1; milestone(ms); }
  if (S.depth >= wc.through) breakthrough();
}

function buyTool(btn?: Element | null) {
  const nx = E.nextTool(S.tool); if (!nx) return;
  if (S.coins < nx.cost) { nope(btn || null); return; }
  S.coins -= nx.cost; S.tool++; Snd.buy(); buzz(20); scene.kick(6); flyCoins(btn || null, 7, false); track('tool_buy', { tier: S.tool });
  toast(nx.e, t('tools.' + nx.id), '×' + nf(nx.pow / CFG.tools[S.tool - 1].pow, 1) + ' ' + t('per_tap'), '#ffc21a');
  if (S.onboard < 2) { S.onboard = 2; updateHint(); const out = goalOf(); setTimeout(() => toast(out.e, t('goal'), t('goal_toast', { dest: out.name }), '#7ad36b'), 1500); }
  renderPane(true);
}
function buyHelper(i: number, btn?: Element | null) {
  const c = E.helperCost(i, S.helpers[i]); if (S.coins < c) { nope(btn || null); return; }
  S.coins -= c; S.helpers[i]++; Snd.buy(); buzz(10); flyCoins(btn || null, 5, false); questProgress('helpers');
  if (i + 1 < CFG.helpers.length && i + 2 > S.seenH) S.seenH = i + 2;
  renderPane(true);
}

/* ---------------- quests & collection ---------------- */
function questProgress(id: string, n = 1) {
  const done = Q.progress(id, n); if (!done) return;
  toast('🎯', t('quest_done'), questLabel(done), '#7ad36b'); Snd.find(1); buzz(15); pop($('#quests'), 1.04);
}
function checkCollection(layerId: string) {
  for (let r = 0; r < 4; r++) if (!S.finds[layerId + ':' + r]) return;
  const bonus = E.collectionReward(S); S.coins += bonus; Snd.find(3); buzz(30);
  toast('🏆', t('collection_done'), t('layers.' + layerId) + '  +' + fmtN(bonus), '#ffc21a');
}
function openQuests() {
  Q.ensureToday();
  const rows = S.q.list.map((q, i) => { const k = Q.kindOf(q.id); const done = Q.isDone(q);
    return `<div class="qrow ${q.claimed ? 'claimed' : done ? 'done' : ''}"><div class="re">${em(k.e)}</div><div><div class="rn">${esc(questLabel(q))}</div><div class="qp"><i style="width:${(Math.min(1, q.prog / q.target) * 100).toFixed(1)}%"></i></div><div class="rs">${esc(q.id === 'meters' ? fmtM(q.prog) : String(Math.floor(q.prog)))} / ${esc(q.id === 'meters' ? fmtM(q.target) : String(q.target))}</div></div>
      ${q.claimed ? `<span class="chg">${esc(t('claimed'))}</span>` : `<button class="buy ${done ? 'can' : ''}" type="button" data-act="claim" data-i="${i}">${em('🎁')}<span>${esc(fmtN(E.questReward(S)))}</span></button>`}</div>`; }).join('');
  openModal(`<h2>${esc(t('quests'))}</h2>
    <div class="set-row"><span>${em('🔥')} ${esc(t('streak', { n: Math.max(1, S.daily.streak) }))}</span><span class="hint-text">${esc(t('quests_reset', { t: fmtDur(Q.secsToMidnight()) }))}</span></div>
    <div class="ms-list">${rows}</div>
    <p class="hint-text">${esc(t('streak_hint'))}</p>
    <button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button>`);
}

/* ---------------- fatigue ---------------- */
const fatigueExempt = () => S.crew || (CFG.fatigue.firstDayFree && S.firstDay === Q.dayKey());
function tickFatigue(dt: number, ts: number) {
  if (ts - lastTap > CFG.fatigue.activeWindowMs) return; // only active tapping counts
  if (E.tickFatigue(S.fat, dt, Q.dayKey(), Date.now(), fatigueExempt())) {
    Snd.tones([392, 330], 0.12, 'sine', 0.1); buzz(20);
    openModal(`<div class="emo">${em('😴')}</div><h2 style="text-align:center">${esc(t('tired_title'))}</h2><p style="text-align:center">${esc(t('tired_body', { t: fmtDur(CFG.fatigue.restSec) }))}</p>
      <div class="btns"><button class="btn primary" type="button" data-act="gold">${esc(t('tired_gold'))}</button><button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button></div>`);
  }
}
function updateTired() {
  const el = $('#tired'); const left = (S.fat.until - Date.now()) / 1000;
  if (left <= 0 || S.crew) { el.hidden = true; return; }
  el.hidden = false; const m = Math.floor(left / 60), s = Math.floor(left % 60);
  el.innerHTML = `${em('😴')} ×${CFG.fatigue.slowMult} · ${m}:${String(s).padStart(2, '0')} · <b>${esc(t('tired_gold'))}</b>`;
}

/* ---------------- golden nugget ---------------- */
let nextNugget = performance.now() + rnd(CFG.nugget.firstMin, CFG.nugget.firstMax) * 1000, nuggetUntil = 0;
const nug = $('#nugget') as HTMLButtonElement;
function spawnNugget() {
  nug.style.left = rnd(10, Math.max(12, scene.cw - 80)) + 'px'; nug.style.top = rnd(scene.ch * 0.25, scene.ch * 0.6) + 'px';
  nug.hidden = false; nuggetUntil = performance.now() + CFG.nugget.life * 1000;
}
nug.addEventListener('pointerdown', e => {
  e.stopPropagation(); Snd.init(); nug.hidden = true; nextNugget = performance.now() + rnd(CFG.nugget.minGap, CFG.nugget.maxGap) * 1000;
  if (Math.random() < 0.5) { frenzyUntil = performance.now() + CFG.nugget.frenzySecs * 1000; toast('⚡', t('nugget'), t('frenzy', { x: CFG.nugget.frenzyMult }), '#ffc21a'); }
  else { const c = E.nuggetBurst(S); S.coins += c; toast('💰', t('nugget'), '+' + fmtN(c), '#ffc21a'); }
  Snd.find(2); buzz(30); scene.kick(8);
});

/* ---------------- modals ---------------- */
function milestone(ms: { d: number; k: string }) {
  const big = S.stars === 0 && CFG.bigMilestones.includes(ms.k);
  if (!big) { toast('📍', fmtM(ms.d), t(ms.k), '#ffffff'); return; }
  Snd.boom(); scene.kick(12);
  track('milestone', { k: ms.k });
  openModal(`<div class="hazard-strip"></div><div class="big">${esc(fmtM(ms.d))}</div><p style="color:var(--text);font-size:16px">${esc(t(ms.k))}</p>
    <div class="btns"><button class="btn primary" type="button" data-act="share" data-note="${esc(t(ms.k))}">${esc(t('share'))}</button><button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button></div>
    ${S.crew ? '' : `<button class="link" type="button" data-act="gold" data-src="milestone">${esc(t('gold_ctx_milestone', { d: fmtM(ms.d * 2) }))}</button>`}`);
}
function showLegend(e: string, name: string, la: E.LayerInfo) {
  Snd.boom();
  openModal(`<div class="emo">${em(e)}</div><div class="big" style="color:var(--r-legend)">${esc(t('rarity.legend'))}</div><h2>${esc(name)}</h2><p>${esc(layerName(la))} · ${esc(fmtM(S.depth))}</p>
    <div class="btns"><button class="btn primary" type="button" data-act="share" data-note="${esc(e + ' ' + name)}">${esc(t('share'))}</button><button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button></div>`);
}
function breakthrough() {
  if (breaking) return; breaking = true; track('breakthrough', { stars: S.stars, world: worldNow().id, lap: S.lap || 0 });
  Snd.boom(); setTimeout(() => Snd.find(3), 300); scene.kick(18); buzz(60);
  const out = goalOf(); const cur = worldNow(); const nx = E.nextWorld(S); const nw = E.worldOf(nx.world);
  const harder = E.worldOf(nx.world).hardMult * E.lapHardMult(nx.lap) / (cur.hardMult * E.lapHardMult(S.lap || 0));
  openModal(`<div class="hazard-strip"></div><h2>${esc(S.world ? t('dug_through_world', { w: t('worlds.' + cur.id) }) : t('breakthrough'))}</h2>
    <p>${esc(t('came_out', { from: '' }))} ${flag(S.country)} ${esc(countryName(S.country))}</p>
    <div class="emo">${em(out.e)}</div><div class="big" style="text-align:center">${esc(out.name)}${out.ocean ? ' ' + esc(t('splash')) : ''}</div>
    <p>${esc(t('reward', { x: CFG.prestigeBase }))}</p>
    <div class="note ctx">${em(nw.e)} <b>${esc(t('next_world'))}: ${esc(t('worlds.' + nw.id))}</b>${nx.lap ? ' · ' + esc(t('lap', { n: nx.lap + 1 })) : ''}<br>${esc(t('world_harder', { x: nf(harder, harder < 10 ? 1 : 0), m: fmtN(E.prestigeMult(S.stars + 1)) }))}</div>
    <div class="btns"><button class="btn primary" type="button" data-act="again" data-focus>${em(nw.e)} ${esc(t('dig_world', { w: t('worlds.' + nw.id) }))} ★${S.stars + 1}</button>
    <button class="btn" type="button" data-act="share" data-note="${esc(out.e + ' ' + out.name)}">${esc(t('share'))}</button>
    ${canInstall() ? `<button class="btn" type="button" data-act="install">${em('📥')} ${esc(t('install'))}</button>` : ''}</div>`, { lock: true });
}
function prestige() {
  E.prestige(S); breaking = false; scene.resetCamera(); scene.worldChanged(); nextNugget = performance.now() + 30000;
  track('prestige', { stars: S.stars, world: worldNow().id, lap: S.lap || 0 });
  save(); closeModal(true); renderPane(true); hud(); banner(worldNow().e + ' ' + t('worlds.' + worldNow().id)); toast('⭐', '×' + CFG.prestigeBase, '×' + fmtN(E.mult(S)), '#ffc21a');
}
function openGold(source = 'button', ctx: Record<string, string> = {}) {
  track('paywall_view', { source });
  const perks: Array<[string, string]> = [['⚡', 'gold_1'], ['😴', 'gold_2'], ['🏆', 'gold_3'], ['🎁', 'gold_5'], ['🧘', 'gold_6'], ['📜', 'gold_4']];
  const why = source === 'offline_cap' ? t('gold_ctx_offline', ctx) : source === 'fatigue' ? t('gold_ctx_fatigue') : source === 'milestone' ? t('gold_ctx_milestone', { d: fmtM(S.depth * 2) }) : '';
  openModal(`<div class="hazard-strip"></div><h2>${esc(t('gold_title'))}</h2><div class="big">${esc(t('gold_head'))}</div>
    ${why ? `<div class="note ctx">${em('💡')} ${esc(why)}</div>` : ''}
    <ul class="perks2">${perks.map(([e, k]) => `<li>${em(e)}<span>${esc(t(k))}</span></li>`).join('')}</ul>
    <div class="price"><strong>${esc(isTelegram() ? t('gold_price_stars', { n: STARS_PRICE }) : t('gold_price'))}</strong><span>${esc(t('gold_cancel'))}</span></div>
    <div class="btns">${isTelegram()
      ? `<button class="btn primary" type="button" data-act="pay" data-m="stars">${em('⭐')} ${esc(t('pay_stars'))}</button>`   /* digital goods inside Telegram: Stars only */
      : `<button class="btn primary" type="button" data-act="pay" data-m="card">${esc(t('pay_card'))}</button><button class="btn" type="button" data-act="pay" data-m="crypto">${esc(t('pay_crypto'))}</button>`}</div>
    <div class="sec-label" style="margin-top:6px">${esc(t('shop_once'))}</div>
    <div class="shop">${shopItem('dynamite')}${shopItem('boost')}</div>
    <div class="note" id="payNote" hidden></div>
    <p class="hint-text">${esc(t('gold_country'))} ${esc(t('under18'))}</p>
    ${TEST_PAY ? `<button class="btn" type="button" data-act="gold-test">${esc(S.crew ? t('test_off') : t('test_try'))}</button>` : ''}
    <button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button>`);
  paySource = source;
}
/* one-off items in the shop: a pack of dynamite, a boost for the whole country. Card on the web, Stars inside Telegram. */
function shopItem(item: ItemId) {
  const it = ITEMS[item]; const own = S.inv[item] || 0;
  const title = item === 'dynamite' ? t('item_dynamite', { n: ITEMS.dynamite.qty }) : t('item_boost', { c: countryName(S.country) });
  const desc = item === 'dynamite' ? t('item_dynamite_desc', { x: ITEMS.dynamite.mult, s: ITEMS.dynamite.secs }) : t('item_boost_desc', { x: ITEMS.boost.mult, h: ITEMS.boost.hours });
  const buy = isTelegram()
    ? `<button class="buy can" type="button" data-act="pay" data-m="stars" data-item="${item}">${em('⭐')}<span>${it.stars}</span></button>`
    : `<button class="buy can" type="button" data-act="pay" data-m="card" data-item="${item}"><span>$${it.usd}</span></button>`;
  return `<div class="row item"><div class="re">${em(it.e)}</div><div><div class="rn">${esc(title)}${own ? `<span class="count">×${own}</span>` : ''}</div><div class="rs">${esc(desc)}</div></div>${buy}</div>`;
}
/* the free test toggle exists only in dev builds and behind ?debug=1; the server resets the flag on the next session anyway */
const TEST_PAY = import.meta.env.DEV || debugFlag();
let paySource = 'button';
function payNote(msg: string) { const n = sheetEl().querySelector<HTMLElement>('#payNote'); if (!n) return; n.textContent = msg; n.hidden = false; n.animate && n.animate([{ transform: 'scale(1.03)' }, { transform: 'scale(1)' }], 250); }
/* card / Apple Pay / Google Pay: Polar hosted checkout, the buyer is our userId (customer_external_id) */
async function payCard(item: ItemId | null = null) {
  let uid = net.userId(); if (!uid) { const s = await net.connect(); uid = s?.userId || null; }
  if (!uid) { payNote(t('pay_offline')); return; }
  payNote(t('pay_return'));
  const url = await createCheckout(uid, paySource, item);
  if (!url) { payNote(t('pay_unavailable')); return; }
  setPending(item, item ? S.inv[item] || 0 : 0);
  openUrl(url);
}
/* crypto: pick a prepaid pass, the worker creates a NOWPayments invoice */
function openPasses() {
  openModal(`<h2>${esc(t('pass_title'))}</h2><p>${esc(t('pass_hint'))}</p>
    <div class="btns">${PASSES.map(p => `<button class="btn ${p.days === 90 ? 'primary' : ''}" type="button" data-act="pass" data-days="${p.days}">${em('🪙')} ${esc(t('pass_days', { d: p.days }))} <strong>$${p.usd}</strong></button>`).join('')}</div>
    <div class="note" id="payNote" hidden></div>
    <button class="btn" type="button" data-act="gold" data-src="${esc(paySource)}" data-focus>${esc(t('back'))}</button>`);
}
async function payCrypto(days: number, btn: HTMLElement) {
  btn.setAttribute('disabled', ''); payNote(t('pay_wait'));
  const inv = await net.createCryptoInvoice(days);
  btn.removeAttribute('disabled');
  if (!inv) { payNote(net.isOnline() ? t('pay_unavailable') : t('pay_offline')); return; }
  track('checkout_start', { method: 'crypto', days });
  openUrl(inv.url); payNote(t('pay_return'));
}
/* Telegram Stars (SPEC §4.4): the worker makes an invoice link, Telegram.WebApp.openInvoice shows the native sheet; on "paid" the bot webhook has (or is about to have) granted Gold */
async function payStars(btn: HTMLElement, item: ItemId | null = null) {
  const w = tg(); if (!w || !w.openInvoice) { payNote(t('pay_unavailable')); return; }
  btn.setAttribute('disabled', ''); payNote(t('pay_wait'));
  const inv = await net.createStarsInvoice(item || undefined);
  btn.removeAttribute('disabled');
  if (!inv) { payNote(net.isOnline() ? t('pay_unavailable') : t('pay_offline')); return; }
  track('checkout_start', { method: 'stars', item: item || 'gold' });
  const before = item ? S.inv[item] || 0 : 0;
  try {
    w.openInvoice(inv.url, status => {
      if (status === 'paid') { closeModal(true); if (item) afterItem(item, before); else afterPayment(); }
      else if (status === 'cancelled') payNote(t('pay_cancelled'));
      else if (status === 'failed') payNote(t('pay_failed'));
    });
  } catch { payNote(t('pay_unavailable')); }
}
/* settings → stop renewal of the Stars subscription (access stays until the paid period ends) */
async function cancelStars(btn: HTMLElement) {
  btn.setAttribute('disabled', '');
  const a = await net.cancelStars();
  if (!a) { btn.removeAttribute('disabled'); toast('⭐', t('gold_title'), t('stars_cancel_fail'), '#b8a493'); return; }
  track('subscription_cancel', { method: 'stars' });
  save(); renderPane(true); hud(); openSettings();
  toast('⭐', t('gold_title'), t('stars_cancel_done', { d: new Date(a.until).toLocaleDateString(lang) }), '#ffc21a');
}
/* an item pack was paid: wait for the webhook to land it in the inventory, then show it */
async function afterItem(item: ItemId, before: number) {
  toast(ITEMS[item].e, t('pay_checking'), '', '#ffc21a');
  const ok = await waitForItem(item, before);
  save(); renderPane(true); updateDyn();
  if (ok) { track('purchase', { item }); toast(ITEMS[item].e, t('item_got', { n: ITEMS[item].qty }), item === 'boost' ? t('boost_hint_use') : t('dyn_hint_use'), '#ffc21a'); }
  else toast('⏳', t('gold_title'), t('pay_pending'), '#b8a493');
}
/* ---------------- dynamite & country boost (Phase 5) ---------------- */
const dynBtn = $('#dyn') as HTMLButtonElement;
function updateDyn() {
  const now = Date.now(); const lit = S.dynUntil > now; const own = S.inv.dynamite || 0;
  if (!lit && !own) { dynBtn.hidden = true; return; }
  dynBtn.hidden = false; dynBtn.classList.toggle('lit', lit);
  dynBtn.innerHTML = lit ? `${em('🧨')} ×${ITEMS.dynamite.mult} · ${Math.ceil((S.dynUntil - now) / 1000)}s` : `${em('🧨')} ×${own}`;
}
async function lightDynamite() {
  if (S.dynUntil > Date.now()) return;
  if (!(S.inv.dynamite > 0)) { openGold('dynamite'); return; }
  dynBtn.setAttribute('disabled', '');
  const r = await net.useDynamite(); dynBtn.removeAttribute('disabled');
  if (!r) { toast('🧨', t('pay_offline'), '', '#b8a493'); return; }
  S.dynUntil = r.until; S.dyn = true; save(); updateDyn(); track('dynamite', {});
  Snd.boom(); buzz(50); scene.kick(14); toast('🧨', t('dyn_lit', { x: ITEMS.dynamite.mult, s: ITEMS.dynamite.secs }), '', '#ff9b3d');
}
function openBoost() {
  if (!(S.inv.boost > 0)) { openGold('boost'); return; }
  openModal(`<div class="emo">${em('🚀')}</div><h2 style="text-align:center">${esc(t('item_boost', { c: countryName(S.country) }))}</h2>
    <p style="text-align:center">${esc(t('item_boost_desc', { x: ITEMS.boost.mult, h: ITEMS.boost.hours }))}</p>
    <label class="set-col"><span>${esc(t('nick_title'))}</span><input class="search" id="nick" type="text" maxlength="16" autocomplete="nickname" value="${esc(S.nick || '')}" placeholder="${esc(t('nick_hint'))}" data-focus></label>
    <div class="note" id="payNote" hidden></div>
    <div class="btns"><button class="btn primary" type="button" data-act="boost-go">${em('🚀')} ${esc(t('boost_go', { c: countryName(S.country) }))}</button><button class="btn" type="button" data-act="close">${esc(t('close'))}</button></div>`);
}
async function fireBoost(btn: HTMLElement) {
  const input = sheetEl().querySelector<HTMLInputElement>('#nick'); const nick = (input?.value || '').trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N}_ .-]{2,16}$/u.test(nick)) { payNote(t('nick_bad')); input?.focus(); return; }
  btn.setAttribute('disabled', ''); payNote(t('pay_wait'));
  const r = await net.boostCountry(nick); btn.removeAttribute('disabled');
  if (!r) { payNote(net.isOnline() ? t('pay_unavailable') : t('pay_offline')); return; }
  S.cboostUntil = r.until; S.cboostBy = nick; S.cboost = true; save(); closeModal(true); renderPane(true); hud();
  Snd.boom(); buzz(60); scene.kick(16); track('boost_fire', {});
  toast('🚀', t('boost_done', { c: countryName(S.country) }), t('boost_active', { n: nick }), '#ffc21a');
}
/* back from the checkout with ?paid=1: ask the server until it says Gold is on (≤ 60 s) */
async function afterPayment() {
  toast('🪙', t('gold_title'), t('pay_checking'), '#ffc21a');
  const ok = await waitForGold();
  save(); renderPane(true); hud();
  if (ok) { track('purchase', { source: 'return' }); toast('🪙', t('gold_title'), t('pay_done'), '#ffc21a'); }
  else toast('⏳', t('gold_title'), t('pay_pending'), '#b8a493');
}
function openSettings() {
  const langs = LANGS.map(l => `<button type="button" data-act="lang" data-v="${l}" class="${lang === l ? 'on' : ''}">${esc(LANG_NAMES[l] || l)}</button>`).join('');
  openModal(`<h2>${esc(t('settings'))}</h2>
    <div class="set-col"><span>${esc(t('language'))}</span><div class="langs">${langs}</div></div>
    <div class="set-row"><span>${esc(t('sound'))}</span><span class="seg"><button type="button" data-act="snd" data-v="1" class="${S.sound ? 'on' : ''}">${esc(t('on'))}</button><button type="button" data-act="snd" data-v="0" class="${!S.sound ? 'on' : ''}">${esc(t('off'))}</button></span></div>
    <div class="set-row"><span>${esc(t('country'))}</span><button class="chg" type="button" data-act="country">${flag(S.country)} ${esc(countryName(S.country))}</button></div>
    ${canInstall() ? `<div class="set-row"><span>${esc(t('install_hint'))}</span><button class="chg" type="button" data-act="install">${esc(t('install'))}</button></div>` : ''}
    ${isTelegram() && S.crew ? `<div class="set-row"><span>${em('⭐')} ${esc(t('gold_title'))}</span><button class="chg" type="button" data-act="stars-manage">${esc(t('stars_manage'))}</button></div>
    <div id="starsBox" hidden class="note"><p style="color:var(--text);margin-bottom:10px">${esc(t('stars_cancel_q'))}</p><div class="btns"><button class="btn" type="button" data-act="stars-cancel-yes" style="color:#ff8a7a">${esc(t('stars_cancel'))}</button><button class="btn" type="button" data-act="stars-cancel-no">${esc(t('back'))}</button></div></div>` : ''}
    <button class="danger" type="button" data-act="reset">${esc(t('reset'))}</button>
    <div id="resetBox" hidden class="note"><p style="color:var(--text);margin-bottom:10px">${esc(t('reset_q'))}</p><div class="btns"><button class="btn" type="button" data-act="reset-yes" style="color:#ff8a7a">${esc(t('erase'))}</button><button class="btn" type="button" data-act="reset-no">${esc(t('cancel'))}</button></div></div>
    <button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button>
    <p class="legal"><button type="button" class="link" data-act="legal" data-href="${esc(CFG.shareUrl)}/terms/">${esc(t('terms'))}</button> · <button type="button" class="link" data-act="legal" data-href="${esc(CFG.shareUrl)}/privacy/">${esc(t('privacy'))}</button> · <button type="button" class="link" data-act="legal" data-href="${esc(CFG.shareUrl)}/refund/">${esc(t('refund'))}</button></p>
    <p style="font-size:11px">${esc(t('version', { v: VERSION }))}</p>`);
}
function openJourney() {
  const out = goalOf(); const nm = nextMilestone(); const wc = W();
  const rows = wc.milestones.map(m => { const done = S.depth >= m.d; const isNext = nm && nm.k === m.k;
    return `<div class="ms-row ${done ? '' : 'todo'} ${isNext ? 'next' : ''}"><span class="mk">${done ? '✓' : '·'}</span><span>${esc(t('ms_names.' + m.k))}</span><span class="dd">${done ? esc(fmtM(m.d)) : esc(fmtM(m.d - S.depth))}</span></div>`; }).join('');
  const exitRow = `<div class="ms-row ${S.depth >= wc.through ? '' : 'todo'} ${!nm ? 'next' : ''}"><span class="mk">${S.depth >= wc.through ? '✓' : '·'}</span><span>${em(out.e)} ${esc(out.name)}</span><span class="dd">${esc(fmtM(Math.max(0, wc.through - S.depth)))}</span></div>`;
  const cur = worldNow();
  openModal(`<h2>${esc(t('journey_title'))}</h2>
    ${S.world || S.lap ? `<div class="set-row"><span>${em(cur.e)} ${esc(t('worlds.' + cur.id))}${S.lap ? ' · ' + esc(t('lap', { n: S.lap + 1 })) : ''}</span><span class="hint-text">★${S.stars} · ×${esc(fmtN(E.mult(S)))}</span></div>` : ''}
    <div class="route"><div>${flag(S.country)}<b>${esc(countryName(S.country))}</b><small>${esc(t('journey_from'))}</small></div><div class="arrow">${esc(fmtM(wc.through))} ↓</div><div>${em(out.e)}<b>${esc(out.name)}</b><small>${esc(t('exit'))}</small></div></div>
    <p>${esc(t('journey_why'))}</p>
    <div class="ms-list">${rows}${exitRow}</div>
    <button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button>`);
}
function openCountry() {
  const list = Object.keys(ANTI).map(cc => ({ cc, n: countryName(cc) })).sort((a, b) => a.n.localeCompare(b.n, lang));
  openModal(`<h2>${esc(t('country'))}</h2><input class="search" id="csearch" type="search" placeholder="${esc(t('search'))}" autocomplete="off" data-focus>
    <div class="clist" id="clist">${list.map(c => `<button type="button" data-act="pick" data-cc="${c.cc}" data-n="${esc(c.n.toLowerCase())}" class="${c.cc === S.country ? 'on' : ''}">${flag(c.cc)}${esc(c.n)}</button>`).join('')}</div>
    <button class="btn" type="button" data-act="close">${esc(t('close'))}</button>`);
  sheetEl().querySelector<HTMLInputElement>('#csearch')!.addEventListener('input', e => { const q = (e.target as HTMLInputElement).value.trim().toLowerCase(); sheetEl().querySelectorAll<HTMLElement>('#clist button').forEach(b => { b.hidden = !!q && !(b.dataset.n || '').includes(q) && !(b.dataset.cc || '').toLowerCase().includes(q); }); });
}

onAction((a, b) => {
  const sheet = sheetEl();
  if (a === 'share') { track('share_open', { source: b.dataset.src || 'modal' }); openShare(b.dataset.note || '', { lock: breaking }); }
  else if (a === 'claim') { const r = Q.claim(+(b.dataset.i || 0)); if (r) { flyCoins(b, 6); Snd.buy(); toast('🎁', t('quests'), '+' + fmtN(r), '#ffc21a'); openQuests(); } else nope(b); }
  else if (a === 'gold') { closeModal(true); openGold(b.dataset.src || 'modal', { h: b.dataset.h || '', m: b.dataset.m || '' }); }
  else if (a === 'quests') openQuests();
  else if (a === 'share-native') nativeShare();
  else if (a.startsWith('share-')) openSocial(a.slice(6));
  else if (a === 'copy') copyShare(b);
  else if (a === 'download') downloadCard();
  else if (a === 'again') prestige();
  else if (a === 'install') promptInstall().then(() => closeModal());
  else if (a === 'legal') openUrl(b.dataset.href || '/');
  else if (a === 'gold-test') { S.crew = !S.crew; save(); closeModal(true); toast('🪙', t('gold_title'), S.crew ? '×' + CFG.crewMult : t('off'), '#ffc21a'); renderPane(true); }
  else if (a === 'pay') {
    const m = b.dataset.m || ''; const item = isItem(b.dataset.item) ? b.dataset.item : null; track('checkout_start', { method: m, item: item || 'gold' });
    if (m === 'card') payCard(item); else if (m === 'crypto') openPasses(); else payStars(b, item);
  }
  else if (a === 'boost') openBoost();
  else if (a === 'boost-go') fireBoost(b);
  else if (a === 'pass') payCrypto(+(b.dataset.days || 30), b);
  else if (a === 'lang') { S.lang = b.dataset.v || 'en'; applyLang(S.lang).then(openSettings); }
  else if (a === 'snd') { S.sound = b.dataset.v === '1'; openSettings(); }
  else if (a === 'country') openCountry();
  else if (a === 'reset') { sheet.querySelector<HTMLElement>('#resetBox')!.hidden = false; }
  else if (a === 'reset-yes') { store.del(SAVE_KEY); setState(freshState()); boot(true); closeModal(true); }
  else if (a === 'reset-no') { sheet.querySelector<HTMLElement>('#resetBox')!.hidden = true; }
  else if (a === 'stars-manage') { sheet.querySelector<HTMLElement>('#starsBox')!.hidden = false; }
  else if (a === 'stars-cancel-no') { sheet.querySelector<HTMLElement>('#starsBox')!.hidden = true; }
  else if (a === 'stars-cancel-yes') cancelStars(b);
  else if (a === 'pick') { pickCountry(b.dataset.cc || S.country || 'US'); closeModal(); }
});

/* ---------------- country / language ---------------- */
const TZ: Record<string, string> = { 'Europe/Moscow': 'RU', 'Asia/Yekaterinburg': 'RU', 'Asia/Novosibirsk': 'RU', 'Asia/Krasnoyarsk': 'RU', 'Asia/Irkutsk': 'RU', 'Asia/Vladivostok': 'RU', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Minsk': 'BY', 'Asia/Almaty': 'KZ', 'Asia/Tashkent': 'UZ', 'Asia/Bangkok': 'TH', 'Asia/Dubai': 'AE', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Baku': 'AZ', 'Asia/Bishkek': 'KG', 'Europe/Istanbul': 'TR', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Warsaw': 'PL', 'Europe/Amsterdam': 'NL', 'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL', 'America/Toronto': 'CA', 'Australia/Sydney': 'AU', 'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Asia/Riyadh': 'SA', 'Asia/Tehran': 'IR', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Jerusalem': 'IL' };
const LANG_CC: Record<string, string> = { ru: 'RU', uk: 'UA', be: 'BY', kk: 'KZ', es: 'ES', pt: 'BR', de: 'DE', fr: 'FR', ja: 'JP', ko: 'KR', zh: 'CN', hi: 'IN', id: 'ID', tr: 'TR', it: 'IT', pl: 'PL', vi: 'VN', th: 'TH', ar: 'SA', fa: 'IR', nl: 'NL', en: 'US' };
export function detectCountry(): string {
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ[tz]) return TZ[tz]; if (tz && tz.startsWith('America/')) return 'US'; } catch { /* ignore */ }
  const langs = navigator.languages || [navigator.language || 'en'];
  for (const l of langs) { const m = /^[a-z]{2,3}-([A-Z]{2})$/.exec(l); if (m && ANTI[m[1]]) return m[1]; }
  const base = (langs[0] || 'en').slice(0, 2).toLowerCase(); return LANG_CC[base] || 'US';
}
async function applyLang(l: string) {
  const got = await loadLang(l);
  document.documentElement.lang = got;
  document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { el.textContent = t(el.dataset.t || ''); });
  updateHint(); renderPane(true); hud();
}

/* ---------------- save / offline / daily ---------------- */
function applyOffline(sec: number) {
  const eff = E.offlineEffort(S, sec); if (eff <= 0) return;
  const c0 = S.coins, d0 = S.depth; addMeters(eff, true); scene.snap(S.depth); const m = S.depth - d0;
  const cap = S.crew ? CFG.offlineCapCrew : CFG.offlineCapFree;
  if (!S.crew && sec > cap * 1.5) { // the moment Gold is worth it: helpers stood idle for hours
    const missed = Math.min(sec, CFG.offlineCapCrew) - cap; const extra = E.metersPerSec(S) * missed;
    track('paywall_view', { source: 'offline_cap' });
    setTimeout(() => openModal(`<div class="emo">${em('😴')}</div><div class="big" style="text-align:center">+${esc(fmtM(m))}</div>
      <p style="text-align:center">${esc(t('offline_capped', { h: Math.round(cap / 3600), a: fmtDur(sec) }))}</p>
      <div class="note ctx">${em('💡')} ${esc(t('gold_ctx_offline', { h: Math.round(missed / 3600), m: fmtM(extra) }))}</div>
      <div class="btns"><button class="btn primary" type="button" data-act="gold" data-src="offline_cap" data-h="${Math.round(missed / 3600)}" data-m="${esc(fmtM(extra))}">${esc(t('gold_title'))}</button><button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button></div>`), 700);
  } else toast('😴', fmtM(m), t('offline', { m: fmtM(m) }) + '  +' + fmtN(S.coins - c0), '#7ad36b');
}
function todayStr(d = new Date()) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function daily() {
  const td = todayStr(); if (S.daily.date === td) return;
  const yd = todayStr(new Date(Date.now() - 86400e3));
  S.daily.streak = S.daily.date === yd ? S.daily.streak + 1 : 1; S.daily.date = td;
  if (S.taps === 0 && S.lifetime === 0) return; // first ever session: no chest yet
  const c = E.dailyChest(S, S.daily.streak); S.coins += c;
  if (S.daily.streak >= CFG.streakShareMin) setTimeout(() => openModal(`<div class="emo">${em('🎁')}</div><div class="big" style="text-align:center">${esc(t('daily', { n: S.daily.streak }))}</div><p style="text-align:center;color:var(--text);font-size:18px">+${esc(fmtN(c))}</p><p>${esc(t('streak_hint'))}</p>
    <div class="btns"><button class="btn primary" type="button" data-act="share" data-note="${esc(t('streak', { n: S.daily.streak }))}">${esc(t('share'))}</button><button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button></div>`), 900);
  else setTimeout(() => toast('🎁', t('daily', { n: S.daily.streak }), '+' + fmtN(c), '#ffc21a'), 900);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); net.flushAll(); }
  else { const away = (Date.now() - S.lastSeen) / 1000; if (away > 30) applyOffline(away); lastFrame = performance.now(); }
});
window.addEventListener('pagehide', save);
setInterval(save, 5000);

/* ---------------- input ---------------- */
scene.scene.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) return; if (modalOpen()) return; e.preventDefault(); tap(e); });
document.addEventListener('keydown', e => { if ((e.code === 'Space' || e.key === ' ') && !modalOpen() && !e.repeat && document.activeElement === document.body) { e.preventDefault(); tap(null); } });
$('#btnGold').addEventListener('click', () => openGold('button'));
$('#btnSettings').addEventListener('click', openSettings);
$('#btnSound').addEventListener('click', () => { S.sound = !S.sound; Snd.init(); hud(); });
$('#btnCountry').addEventListener('click', openCountry);
$('#journey').addEventListener('pointerdown', e => e.stopPropagation());
$('#journey').addEventListener('click', openJourney);
$('#quests').addEventListener('click', openQuests);
$('#tired').addEventListener('pointerdown', e => e.stopPropagation());
dynBtn.addEventListener('pointerdown', e => e.stopPropagation()); dynBtn.addEventListener('click', () => lightDynamite());
$('#tired').addEventListener('click', () => openGold('fatigue'));
document.querySelectorAll<HTMLElement>('.tab').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab || 'tools')));
$('.panes').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
  if (b.dataset.buy === 'tool') buyTool(b);
  else if (b.dataset.buy === 'h') buyHelper(+(b.dataset.i || 0), b);
  else if (b.dataset.act === 'country') openCountry();
  else if (b.dataset.act === 'gold') openGold(b.dataset.src || 'panel');
  else if (b.dataset.act === 'boost') openBoost();
  else if (b.dataset.rank) setRankMode(b.dataset.rank as RankMode);
});
onInstallChange(() => { /* buttons are rendered on demand; nothing to refresh */ });

/* ---------------- loop ---------------- */
const hud = () => updateHud({ combo, lastTap, frenzy: performance.now() < frenzyUntil });
let lastFrame = performance.now(), lastHud = 0, lastAfford = 0, lastWorld = 0, lastDay = 0, lastNet = 0;
function frame(ts: number) {
  const dt = E.clamp((ts - lastFrame) / 1000, 0, 0.1); lastFrame = ts;
  const nowMs = Date.now(); const dyn = S.dynUntil > nowMs, cb = S.cboostUntil > nowMs;
  if (dyn !== !!S.dyn || cb !== !!S.cboost) { S.dyn = dyn; S.cboost = cb; renderPane(true); }
  const ir = E.idleRate(S); if (ir > 0) addMeters(ir * dt);
  if (ts - lastTap > CFG.comboWindow * 1.8) combo = Math.max(0, combo - 60 * dt);
  scene.camera(dt);
  scene.draw(dt, ts);
  if (!nug.hidden && ts > nuggetUntil) { nug.hidden = true; nextNugget = ts + rnd(CFG.nugget.minGap, CFG.nugget.maxGap) * 1000; }
  if (nug.hidden && ts > nextNugget && !modalOpen() && S.taps > 10) spawnNugget();
  tickFatigue(dt, ts);
  if (ts - lastHud > 66) { lastHud = ts; hud(); updateTired(); updateDyn(); }
  if (ts - lastDay > 30000) { lastDay = ts; if (Q.ensureToday()) renderPane(true); }
  if (ts - lastNet > 1000) { lastNet = ts; net.tick(Date.now(), tab === 'world'); }
  if (ts - lastAfford > 250) { lastAfford = ts; renderPane(false); if (tab === 'world' && ts - lastWorld > 3000) { lastWorld = ts; renderPane(true); } }
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
async function boot(reset: boolean) {
  if (!reset) { const saved = loadSaved(); if (saved) setState(saved); }
  // landing page thehole.world/<cc> (site/worker.ts) or ?c=<CC>: a new player digs for that country from the first tap
  const pathCC = /^\/([a-z]{2})\/?$/i.exec(location.pathname)?.[1] || '';   // the SW may serve the plain shell for /<cc>, so read the path too
  const landing = ((window as unknown as { __landingCC?: string }).__landingCC || new URLSearchParams(location.search).get('c') || pathCC).toUpperCase();
  if (S.taps === 0 && S.lifetime === 0 && ANTI[landing]) S.country = landing;
  if (!S.country || !ANTI[S.country]) S.country = detectCountry();
  if (!S.ref) S.ref = makeRefCode();
  if (!S.firstDay) S.firstDay = S.taps > 0 ? '1970-1-1' : Q.dayKey(); // existing saves are not first-day players
  const ref = incomingRef(); let welcome = false;
  if (ref && !S.refBy && ref !== S.ref && S.taps === 0) { S.refBy = ref; welcome = true; }
  scene.snap(S.depth); scene.worldChanged(); S.seg = E.layerAt(S.depth, W()).seg; breaking = false;
  await applyLang(S.lang || detectLang(tgLang() ? [tgLang() as string, ...(navigator.languages || [])] : undefined));
  applyEmoji();
  if (!reset) { const away = (Date.now() - (S.lastSeen || Date.now())) / 1000; applyOffline(away); daily(); }
  Q.ensureToday();
  if (welcome) setTimeout(() => toast('🤝', t('ref_welcome'), '', '#7ad36b'), 600);
  updateHint(); save();
  if (S.depth >= W().through) breakthrough();
  net.connect(); // live world: never blocks the first tap; the demo ranking shows until the session answers
  if (!reset && consumePaidReturn()) { const p = takePending(); if (p) afterItem(p.item, p.before); else afterPayment(); }
  updateDyn();
}
/* ---------------- live world (SPEC §2.5, §3.2) ---------------- */
function pickCountry(cc: string) {
  const prev = S.country; S.country = cc; save(); renderPane(true); hud(); track('country_change', { from: prev || '', to: cc });
  net.changeCountry(cc).then(r => {
    if (!r) return;
    if (r.country !== cc) { S.country = r.country; save(); renderPane(true); hud(); toast('🔒', t('country_locked'), t('country_next', { d: new Date(r.nextChange).toLocaleDateString(lang) }), '#b8a493'); }
  });
}
/* cloud save: adopt the server copy when this device has nothing yet or another device saved later (LWW by updated_at) */
net.onSession(info => {
  if (!info.save) return;
  let obj: Partial<typeof S> | null = null; try { obj = JSON.parse(info.save.state); } catch { return; }
  const cloud = fromSaved(obj); if (!cloud) return;
  const localFresh = S.taps === 0 && S.lifetime === 0 && S.runs === 0;
  if (!localFresh && info.save.updated_at <= S.lastSeen) return;
  const keep = { country: S.country, lang: S.lang, ref: S.ref, friends: S.friends, countryNext: S.countryNext, lastSeen: Date.now() };
  setState(Object.assign(cloud, keep)); scene.snap(S.depth); scene.worldChanged(); S.seg = E.layerAt(S.depth, W()).seg; Q.ensureToday(); renderPane(true); hud(); save();
  toast('☁️', t('cloud_restored'), fmtM(S.depth), '#7ad36b');
});
net.onOvertake(o => {
  if (o.a === S.country) { toast('🏆', t('overtake', { a: countryName(o.a), b: countryName(o.b) }), '', '#ffc21a'); buzz(20); }
  else if (o.b === S.country) toast('⚠️', t('overtake', { a: countryName(o.a), b: countryName(o.b) }), '', '#ff9b3d');
});
net.onSeasonDone(se => {
  const flags = se.top.slice(0, 10).map(cc => flag(cc)).join(' ');
  openModal(`<div class="emo">${em('🌍')}</div><div class="big" style="text-align:center">${esc(t('season_done_title'))}</div>
    <p style="text-align:center;font-size:24px;line-height:1.4">${flags}</p>
    <p>${esc(t('season_done_body', { h: CFG.world.boostHours }))}</p>
    <div class="btns"><button class="btn primary" type="button" data-act="share" data-note="${esc(t('season_done_title'))}">${esc(t('share'))}</button><button class="btn" type="button" data-act="close" data-focus>${esc(t('close'))}</button></div>`);
});
export async function start() {
  await boot(false);
  requestAnimationFrame(t0 => { lastFrame = t0; frame(t0); });
  // debug/test hook (personal economy is client-side by design; the country ranking is validated server-side in Phase 2)
  (window as unknown as { __game: unknown }).__game = { get S() { return S; }, CFG, addMeters, layerAt: E.layerAt, E, Q, net, W,
    jumpTo: (d: number) => { const before = S.depth; S.depth = Math.min(d, W().through); if (S.depth > S.best) S.best = S.depth; checkProgress(before); save(); }, // tests: move the digger to a depth (meters) regardless of hardness
    debugFatigue: () => { S.firstDay = '1970-1-1'; S.fat.active = CFG.fatigue.activeSecPerDay - 0.01; lastTap = performance.now(); } };
}
