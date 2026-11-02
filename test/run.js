// E2E smoke test: builds are served by `vite preview`, driven by Playwright on a phone and a desktop viewport.
// Checks: no console/page errors, tapping digs, shop works, deep rendering, breakthrough + share + prestige, no horizontal scroll.
// Run: npm run test:e2e   (or: vite build && node test/run.js)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173, URL = `http://127.0.0.1:${PORT}/`;

async function startPreview() {
  const p = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { try { const r = await fetch(URL); if (r.ok) return p; } catch {} await new Promise(r => setTimeout(r, 200)); }
  p.kill(); throw new Error('vite preview did not start');
}

const server = await startPreview();
const b = await chromium.launch(); const errs = []; let failed = false;
// `vite preview` has no API behind it: /api/* answers 404 and the game falls back to the demo world by design. Only that noise is ignored.
const apiNoise = m => /Failed to load resource/.test(m.text()) && /\/api\//.test(m.location().url || '');
// Fake live-world API for the Phase 2 path: session, sync (echoes a snapshot whose order flips to trigger an overtake), world, save, events.
const snap = (flip, done) => ({ t: Date.now(), total: 5.2e9, day: '2026-11-02', season: { n: 3, m: 2.1e10, k: 5000, depth: done ? 6371000 : 4.2e6, doneAt: done ? Date.now() : 0, boostUntil: done ? Date.now() + 86400e3 : 0, top: done ? ['BR', 'RU', 'IN', 'US', 'PL'] : [] },
  rows: [['BR', 1.4e9, 2e7], ['RU', 1.2e9, 1.5e7], flip ? ['PL', 9.1e8, 9e6] : ['UA', 9e8, 8e6], flip ? ['UA', 9e8, 8e6] : ['PL', 8.9e8, 9e6], ['IN', 7e8, 7e6], ['US', 6e8, 1e6]] });
async function mockApi(p, calls) {
  await p.route('**/api/**', async route => {
    const req = route.request(); const u = new globalThis.URL(req.url()); const body = req.postDataJSON ? (req.postDataJSON() || {}) : {};
    calls.push({ path: u.pathname, method: req.method(), body });
    const json = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/api/session') return json({ userId: 'u-test', token: 'tok.sig', country: 'RU', countryNextChange: 0, refCode: body.refCode || 'srvref', friends: 3, entitlements: { crew: false, until: 0 }, save: null, shards: 16 });
    if (u.pathname === '/api/sync') { const n = calls.filter(c => c.path === '/api/sync').length; return json({ accepted: body.deltaMeters, seq: body.seq, friends: 3, crew: false, world: snap(n >= 2, n >= 3) }); }
    if (u.pathname === '/api/world') { const n = calls.filter(c => c.path === '/api/sync').length; return json(snap(n >= 2, n >= 3)); } // same world state as the last sync, so overtakes are deterministic
    return json({ ok: true, stored: true });
  });
}
try {
  for (const [name, vp, locale, tz] of [['phone', { width: 390, height: 844 }, 'ru-RU', 'Europe/Moscow'], ['desk', { width: 1280, height: 800 }, 'en-US', 'America/New_York']]) {
    const ctx = await b.newContext({ viewport: vp, locale, timezoneId: tz, hasTouch: name === 'phone', deviceScaleFactor: name === 'phone' ? 2 : 1, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    // fake Web Share API so the native path (file + text + url) is exercised headlessly
    await p.addInitScript(() => { window.__shared = null; navigator.canShare = d => !!d; navigator.share = async d => { window.__shared = { files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })), text: d.text, url: d.url }; }; });
    p.on('pageerror', e => errs.push(name + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !apiNoise(m)) errs.push(name + ' console: ' + m.text()); });
    await p.goto(URL + '?r=abc123'); await p.waitForFunction(() => window.__game && window.__game.S); await p.waitForTimeout(600);
    await p.screenshot({ path: `test/${name}-0-start.png` });
    const sc = await p.$('#scene'); const bb = await sc.boundingBox();
    for (let i = 0; i < 60; i++) { await p.mouse.click(bb.x + bb.width / 2 + (i % 5) * 10, bb.y + bb.height * 0.6); await p.waitForTimeout(40); }
    for (let i = 0; i < 120 && await p.evaluate(() => __game.S.coins < __game.CFG.tools[1].cost); i++) { await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height * 0.6); await p.waitForTimeout(40); }
    await p.waitForTimeout(200); await p.screenshot({ path: `test/${name}-1-tapped.png` });
    const st1 = await p.evaluate(() => ({ depth: __game.S.depth, coins: __game.S.coins, tool: __game.S.tool, taps: __game.S.taps, ref: __game.S.ref, refBy: __game.S.refBy }));
    if (!(st1.taps > 0 && st1.depth > 0)) errs.push(name + ': tapping did not dig ' + JSON.stringify(st1));
    await p.waitForTimeout(300); await p.evaluate(() => { const b = document.querySelector('.buy[data-buy="tool"]'); if (b) b.click(); }); await p.waitForTimeout(200);
    await p.click('.tab[data-tab="helpers"]'); await p.waitForTimeout(100);
    const hb = await p.$('.buy[data-buy="h"].can'); if (hb) await hb.click();
    const st2 = await p.evaluate(() => ({ tool: __game.S.tool, helpers: __game.S.helpers.join(','), coins: Math.round(__game.S.coins) }));
    if (st2.tool !== 1) errs.push(name + ': shovel not bought ' + JSON.stringify(st2));
    await p.screenshot({ path: `test/${name}-2-helpers.png` });
    await p.evaluate(() => { const S = __game.S; S.tool = 6; S.helpers = [10, 10, 10, 8, 5, 3, 0, 0]; S.coins = 5e6; });
    await p.evaluate(() => __game.addMeters(13000)); await p.waitForTimeout(400);
    await p.screenshot({ path: `test/${name}-3-kola-modal.png` });
    await p.click('[data-act="close"]').catch(() => {});
    await p.click('.tab[data-tab="finds"]'); await p.evaluate(() => { const S = __game.S; S.finds = { 'soil:0': 3, 'soil:1': 1, 'clay:0': 2, 'sed:2': 1, 'granite:1': 1 }; });
    await p.waitForTimeout(400); await p.screenshot({ path: `test/${name}-4-finds.png` });
    await p.click('.tab[data-tab="world"]'); await p.waitForTimeout(300); await p.screenshot({ path: `test/${name}-5-world.png` });
    const fallback = await p.evaluate(() => ({ demo: __game.net.worldSnapshot().demo, online: __game.net.isOnline(), hasDemoNote: !!document.querySelector('#pane-world .demo:not(.live)') }));
    if (!fallback.demo || fallback.online || !fallback.hasDemoNote) errs.push(name + ': demo fallback without API broken ' + JSON.stringify(fallback));
    // journey sheet: route + milestone checklist
    await p.click('#journey'); await p.waitForTimeout(300);
    const msRows = await p.$$eval('.ms-row', els => els.length); if (msRows < 13) errs.push(name + ': journey rows ' + msRows);
    await p.screenshot({ path: `test/${name}-5b-journey.png` }); await p.click('[data-act="close"]');
    // quests: strip visible, a quest can be completed and claimed
    const qVisible = await p.$eval('#quests', el => !el.hidden); if (!qVisible) errs.push(name + ': quest strip hidden');
    const claimed = await p.evaluate(() => { const S = __game.S; const q = S.q.list[0]; q.prog = q.target; const c0 = S.coins; const r = __game.Q.claim(0); return { r, gained: S.coins - c0 }; });
    if (!(claimed.r > 0 && claimed.gained === claimed.r)) errs.push(name + ': quest claim ' + JSON.stringify(claimed));
    await p.click('#quests', { force: true }); await p.waitForTimeout(300); await p.screenshot({ path: `test/${name}-5c-quests.png` }); await p.click('[data-act="close"]');
    // fatigue: rest sheet appears, chip shows, taps are halved, Gold removes it
    await p.evaluate(() => __game.debugFatigue()); await p.waitForTimeout(400);
    const tired = await p.evaluate(() => ({ sheet: !document.getElementById('modal').hidden, until: __game.S.fat.until > Date.now() }));
    if (!(tired.sheet && tired.until)) errs.push(name + ': fatigue did not trigger ' + JSON.stringify(tired));
    await p.screenshot({ path: `test/${name}-5d-fatigue.png` }); await p.click('[data-act="close"]'); await p.waitForTimeout(100);
    const chip = await p.$eval('#tired', el => !el.hidden); if (!chip) errs.push(name + ': fatigue chip hidden');
    const halves = await p.evaluate(() => { const f = __game.S.fat; return __game.E.tiredMult(f, Date.now(), false) === __game.CFG.fatigue.slowMult && __game.E.tiredMult(f, Date.now(), true) === 1; });
    if (!halves) errs.push(name + ': fatigue multiplier wrong');
    await p.evaluate(() => { __game.S.fat.until = 0; });
    // paywall with context
    await p.click('#tired', { force: true }).catch(() => {}); await p.evaluate(() => document.querySelector('#btnGold').click()); await p.waitForTimeout(200);
    const perks = await p.$$eval('.perks2 li', els => els.length); if (perks !== 6) errs.push(name + ': paywall perks ' + perks);
    await p.click('[data-act="close"]');
    await p.evaluate(() => { __game.S.ms = { m_mantle: 1, m_diamond: 1, m_ocore: 1, m_icore: 1, m_center: 1, m_kola: 1 }; __game.addMeters(5300000 - __game.S.depth); }); await p.waitForTimeout(900);
    await p.screenshot({ path: `test/${name}-6-icore.png` });
    await p.evaluate(() => __game.addMeters(12742000)); await p.waitForTimeout(600);
    await p.screenshot({ path: `test/${name}-7-breakthrough.png` });
    await p.click('[data-act="share"]').catch(e => errs.push('share: ' + e.message)); await p.waitForTimeout(800);
    const shareTxt = await p.$eval('#shareTxt', el => el.textContent).catch(() => '');
    if (!/\?r=[a-z0-9]{6}/.test(shareTxt)) errs.push(name + ': share text has no ref link: ' + shareTxt);
    const socials = await p.$$eval('.soc', els => els.length); if (socials < 4) errs.push(name + ': social buttons missing');
    await p.click('[data-act="share-native"]').catch(e => errs.push('share-native: ' + e.message)); await p.waitForTimeout(600);
    const shared = await p.evaluate(() => window.__shared);
    if (!shared || shared.files.length !== 1 || shared.files[0].type !== 'image/png' || shared.files[0].size < 10000 || !/\?r=/.test(shared.url)) errs.push(name + ': Web Share payload wrong ' + JSON.stringify(shared));
    for (const id of ['x', 'tg', 'wa', 'rd']) { const href = await p.evaluate(async (id) => { let got = ''; const o = window.open; window.open = (u) => { got = u; return null; }; document.querySelector('[data-act="share-' + id + '"]').click(); window.open = o; return got; }, id);
      if (!href || !href.includes(encodeURIComponent('?r='))) errs.push(name + ': social ' + id + ' link missing ref: ' + href); }
    await p.screenshot({ path: `test/${name}-8-share.png` });
    await p.click('[data-act="again"]').catch(e => errs.push('again: ' + e.message)); await p.waitForTimeout(400);
    const st3 = await p.evaluate(() => ({ stars: __game.S.stars, depth: __game.S.depth, country: __game.S.country, lang: document.documentElement.lang }));
    if (st3.stars !== 1 || st3.depth !== 0) errs.push(name + ': prestige failed ' + JSON.stringify(st3));
    await p.click('#btnGold'); await p.waitForTimeout(200); await p.screenshot({ path: `test/${name}-9-gold.png` });
    await p.click('[data-act="close"]').catch(() => {});
    await p.click('#btnSettings'); await p.waitForTimeout(200); await p.screenshot({ path: `test/${name}-10-settings.png` });
    const langBtns = await p.$$eval('.langs button', els => els.length); if (langBtns < 12) errs.push(name + ': expected 12 languages, got ' + langBtns);
    await p.click('.langs button[data-v="ja"]'); await p.waitForTimeout(500);
    const ja = await p.evaluate(() => document.documentElement.lang); if (ja !== 'ja') errs.push(name + ': language switch failed');
    await p.click('[data-act="close"]').catch(() => {});
    await p.screenshot({ path: `test/${name}-11-ja.png` });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
    if (overflow) errs.push(name + ': horizontal overflow');
    const sprite = await p.evaluate(() => !document.documentElement.classList.contains('nosprite') && getComputedStyle(document.querySelector('.em')).backgroundImage !== 'none');
    if (!sprite) errs.push(name + ': emoji sprite not applied');
    console.log(name, JSON.stringify({ st1, st2, st3, overflow, socials, langBtns }));
    await ctx.close();
  }
  // Telegram Mini App container (SDK stubbed): tma class, Telegram share first, links open via openTelegramLink
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('tma pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !apiNoise(m)) errs.push('tma console: ' + m.text()); });
    await p.addInitScript(() => { window.__tg = { opened: [], haptics: 0, expanded: false }; window.Telegram = { WebApp: { initData: 'query_id=1&user=%7B%22id%22%3A1%2C%22language_code%22%3A%22de%22%7D', initDataUnsafe: { start_param: 'r_zz9yy8', user: { id: 1, language_code: 'de' } }, platform: 'ios', version: '8.0',
      ready() {}, expand() { window.__tg.expanded = true; }, disableVerticalSwipes() {}, setHeaderColor() {}, setBackgroundColor() {},
      HapticFeedback: { impactOccurred() { window.__tg.haptics++; } }, openTelegramLink(u) { window.__tg.opened.push(u); }, openLink(u) { window.__tg.opened.push(u); } } }; });
    await p.goto(URL); await p.waitForFunction(() => window.__game && window.__game.S); await p.waitForTimeout(400);
    const st = await p.evaluate(() => ({ tma: document.documentElement.classList.contains('tma'), lang: document.documentElement.lang, refBy: __game.S.refBy, expanded: window.__tg.expanded }));
    if (!st.tma || st.lang !== 'de' || st.refBy !== 'zz9yy8' || !st.expanded) errs.push('tma init wrong ' + JSON.stringify(st));
    const sc = await p.$('#scene'); const bb = await sc.boundingBox();
    for (let i = 0; i < 5; i++) { await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height * 0.6); await p.waitForTimeout(40); }
    const hapt = await p.evaluate(() => window.__tg.haptics); if (hapt < 5) errs.push('tma haptics ' + hapt);
    await p.evaluate(() => __game.addMeters(13000)); await p.waitForTimeout(300); await p.click('[data-act="share"]'); await p.waitForTimeout(600);
    const first = await p.$eval('.soc', el => el.dataset.act); if (first !== 'share-tg') errs.push('tma: Telegram button not first: ' + first);
    const native = await p.$('[data-act="share-native"]'); if (native) errs.push('tma: native share button should be hidden');
    await p.click('[data-act="share-tg"]'); await p.waitForTimeout(200);
    const opened = await p.evaluate(() => window.__tg.opened); if (!opened.some(u => u.startsWith('https://t.me/share/url'))) errs.push('tma: share did not go through openTelegramLink ' + JSON.stringify(opened));
    await p.screenshot({ path: 'test/tma-share.png' });
    await ctx.close();
  }
  // Live world through a mocked API: session → sync payload → ranking modes → overtake ticker → season banner; hidden tab flushes with keepalive
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'UTC', hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage(); const calls = []; await mockApi(p, calls);
    p.on('pageerror', e => errs.push('live pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('live console: ' + m.text()); });
    await p.goto(URL + '?r=zz9yy8'); await p.waitForFunction(() => window.__game && window.__game.S); await p.waitForTimeout(800);
    const ses = calls.find(c => c.path === '/api/session'); if (!ses || ses.body.ref !== 'zz9yy8' || !ses.body.deviceId) errs.push('live: session call wrong ' + JSON.stringify(ses));
    const st0 = await p.evaluate(() => ({ online: __game.net.isOnline(), friends: __game.S.friends, country: __game.S.country }));
    if (!st0.online || st0.friends !== 3 || st0.country !== 'RU') errs.push('live: session not applied ' + JSON.stringify(st0));
    const idleBoost = await p.evaluate(() => __game.E.friendsMult(__game.S.friends)); if (Math.abs(idleBoost - 1.06) > 1e-9) errs.push('live: friends mult ' + idleBoost);
    const sc = await p.$('#scene'); const bb = await sc.boundingBox();
    for (let r = 0; r < 3; r++) { // three syncs: second flips PL above UA, third finishes the season
      for (let i = 0; i < 10; i++) { await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height * 0.6); await p.waitForTimeout(40); }
      await p.evaluate(() => __game.net.sync()); await p.waitForTimeout(300); }
    const syncs = calls.filter(c => c.path === '/api/sync');
    if (syncs.length !== 3 || syncs[0].body.seq !== 1 || syncs[2].body.seq !== 3 || !(syncs[0].body.deltaMeters > 0) || syncs[0].body.taps !== 10 || syncs[0].body.tool !== 0) errs.push('live: sync payload ' + JSON.stringify(syncs.map(c => c.body)));
    const dug = await p.evaluate(() => __game.S.lifetime); if (Math.abs(syncs.reduce((a, c) => a + c.body.deltaMeters, 0) - dug) > 0.01) errs.push('live: synced meters ' + syncs.reduce((a, c) => a + c.body.deltaMeters, 0) + ' != dug ' + dug);
    const season = await p.evaluate(() => ({ modal: !document.getElementById('modal').hidden, boost: __game.S.boost, mult: __game.E.mult(__game.S) }));
    if (!season.modal || !season.boost || season.mult !== 2) errs.push('live: season banner / boost ' + JSON.stringify(season));
    await p.screenshot({ path: 'test/live-season.png' }); await p.click('[data-act="close"]');
    await p.click('.tab[data-tab="world"]'); await p.waitForTimeout(300);
    const pane = await p.$eval('#pane-world', el => el.innerText);
    if (!/Live world/.test(pane) || /Demo numbers/.test(pane) || !/Season 3/.test(pane)) errs.push('live: world pane not live: ' + pane.slice(0, 200));
    await p.click('[data-rank="capita"]');
    const okCapita = await p.waitForFunction(() => document.querySelector('.rk .c div')?.textContent === 'Poland', null, { timeout: 4000 }).then(() => true).catch(() => false); // pane re-renders on the next tick
    if (!okCapita) errs.push('live: per-capita leader should be Poland, got ' + await p.$eval('.rk .c div', el => el.textContent));
    await p.click('[data-rank="today"]'); await p.waitForTimeout(200);
    const firstT = await p.$eval('.rk .c div', el => el.textContent); if (firstT !== 'Brazil') errs.push('live: today leader should be Brazil, got ' + firstT);
    await p.screenshot({ path: 'test/live-world.png' });
    let ticker = ''; for (let i = 0; i < 12 && !/overtakes/.test(ticker); i++) { await p.waitForTimeout(500); ticker = await p.$eval('#ticker', el => el.textContent); }
    if (!/Poland overtakes Ukraine/.test(ticker)) errs.push('live: overtake not in ticker: ' + ticker);
    const before = calls.length; await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(500);
    const flushed = calls.slice(before).map(c => c.path); if (!flushed.includes('/api/save') || !flushed.includes('/api/ev')) errs.push('live: hidden flush ' + JSON.stringify(flushed));
    const ev = calls.find(c => c.path === '/api/ev'); if (!ev || !ev.body.ev.some(e => e.n === 'first_tap')) errs.push('live: events batch missing first_tap');
    const sv = calls.find(c => c.path === '/api/save'); if (!sv || typeof sv.body.state !== 'string' || JSON.parse(sv.body.state).v !== 1) errs.push('live: save payload wrong');
    console.log('live', JSON.stringify({ calls: calls.length, syncs: syncs.length, dug, ticker }));
    await ctx.close();
  }
  // legal pages + manifest reachable
  for (const [u, needle] of [['terms/', 'Terms of Service'], ['privacy/', 'Privacy Policy'], ['refund/', 'Refund Policy'], ['manifest.webmanifest', '"name"'], ['sw.js', 'precache'], ['og.png', null], ['icon-512.png', null]]) {
    const r = await fetch(URL + u); const body = needle ? await r.text() : ''; if (!r.ok || (needle && !body.includes(needle))) errs.push('page/asset broken: ' + u + ' ' + r.status); }
  // OG + manifest wiring in the shell
  const html = await (await fetch(URL)).text();
  for (const needle of ['property="og:image"', 'name="twitter:card"', 'rel="manifest"', 'rel="apple-touch-icon"']) if (!html.includes(needle)) errs.push('index.html missing ' + needle);
} catch (e) { errs.push('fatal: ' + (e.stack || e.message)); }
console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
failed = errs.length > 0;
await b.close(); server.kill();
process.exit(failed ? 1 : 0);
