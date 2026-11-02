import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US',
  recordVideo: { dir: out, size: { width: 390, height: 844 } }, geolocation: undefined });
const p = await ctx.newPage();
const t0 = Date.now();
await p.goto('https://thehole.world/?press=1', { waitUntil: 'networkidle' });
// the live world snapshot arrives with the first sync after a few taps: warm up, then wait for the ticker to drop "demo"
for (let i = 0; i < 6; i++) { await p.mouse.click(195, 420); await p.waitForTimeout(150); }
await p.waitForFunction(() => { const t = document.querySelector('#ticker'); return t && t.textContent && !/demo|демо/.test(t.textContent); }, null, { timeout: 90000 }).catch(() => console.log('still demo'));
await p.waitForTimeout(600);
console.log('OFFSET', ((Date.now() - t0) / 1000).toFixed(1), await p.locator('#ticker').textContent());
const shot = n => p.screenshot({ path: `${out}/${n}.png` });
await shot('01-start');
const tapAt = async (n, gap) => { for (let i = 0; i < n; i++) { await p.mouse.click(195, 420); await p.waitForTimeout(gap); } };
await tapAt(30, 90);
await shot('02-digging');
// buy the shovel when affordable
const buy = async () => { const btn = p.locator('[data-act="buy"], .next .buy, button.buy').first(); if (await btn.count()) { try { await btn.click({ timeout: 800, force: true }); } catch {} } };
await buy(); await tapAt(40, 80); await buy(); await tapAt(40, 70); await buy();
await shot('03-tools');
await tapAt(40, 60);
// world tab
const world = p.locator('.tabs button, [role=tab]').nth(3); if (await world.count()) await world.click({ force: true });
await p.waitForTimeout(1500); await shot('04-world');
await tapAt(20, 80);
await p.waitForTimeout(800);
await ctx.close(); await b.close();
