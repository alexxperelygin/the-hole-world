// Generates the static art the build needs, from config + Noto emoji (emoji-datasource-google):
//   src/assets/emoji.webp + emoji-map.json  — sprite with only the emoji the game uses (tools, helpers, finds, flags, UI)
//   public/icon-*.png, apple-touch-icon.png, favicon.svg, og.png — PWA icons and the default OG card
// Run: node tools/assets.mjs   (needs Playwright's Chromium; outputs are committed)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CFG } from '../src/config.ts';
import { ANTI } from '../src/antipodes.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dsDir = path.join(root, 'node_modules/emoji-datasource-google');
const data = JSON.parse(fs.readFileSync(path.join(dsDir, 'emoji.json'), 'utf8'));
const SHEET = 64, PAD = 1, CELL = SHEET + 2 * PAD;
const norm = s => [...s].map(c => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).filter(h => h !== 'FE0F').join('-');
const byCode = new Map(); for (const e of data) { byCode.set(norm(String.fromCodePoint(...e.unified.split('-').map(h => parseInt(h, 16)))), e); }

const flag = cc => String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
export const UI_EMOJI = ['👆', '👇', '👷', '🌊', '🏳️', '⚡', '💰', '📍', '😴', '🎁', '🪙', '🔊', '🔇', '🌍', '🏺', '🐶', '⛏️', '🧭', '📥', '🔗', '⭐', '🏆', '📤', '🤝', '💡', '🧘', '📜', '🔥', '🎯'];
const want = [...new Set([
  ...CFG.tools.map(t => t.e), ...CFG.helpers.map(h => h.e), ...Object.values(CFG.finds).flat(),
  ...Object.keys(ANTI).map(flag), ...UI_EMOJI,
])];
const missing = want.filter(e => !byCode.has(norm(e)));
if (missing.length) console.warn('not in Noto sheet:', missing.join(' '));
const list = want.filter(e => byCode.has(norm(e)));
const COLS = 16, OUT = 64, rows = Math.ceil(list.length / COLS);
const map = {}; list.forEach((e, i) => { map[e] = [i % COLS, Math.floor(i / COLS)]; });

const browser = await chromium.launch(); const page = await browser.newPage();
await page.goto('file://' + path.join(root, 'index.html').replace('index.html', 'package.json')); // any local origin for file access
const sheetUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(dsDir, 'img/google/sheets/64.png')).toString('base64');
const sprite = await page.evaluate(async ({ sheetUrl, cells, COLS, rows, CELL, PAD, SHEET, OUT }) => {
  const img = new Image(); img.src = sheetUrl; await img.decode();
  const c = document.createElement('canvas'); c.width = COLS * OUT; c.height = rows * OUT; const g = c.getContext('2d');
  cells.forEach(([sx, sy], i) => g.drawImage(img, sx * CELL + PAD, sy * CELL + PAD, SHEET, SHEET, (i % COLS) * OUT, Math.floor(i / COLS) * OUT, OUT, OUT));
  return c.toDataURL('image/webp', 0.82);
}, { sheetUrl, cells: list.map(e => { const d = byCode.get(norm(e)); return [d.sheet_x, d.sheet_y]; }), COLS, rows, CELL, PAD, SHEET, OUT });
fs.writeFileSync(path.join(root, 'src/assets/emoji.webp'), Buffer.from(sprite.split(',')[1], 'base64'));
fs.writeFileSync(path.join(root, 'src/assets/emoji-map.json'), JSON.stringify({ cols: COLS, rows, size: OUT, map }));
console.log('emoji sprite:', list.length, 'glyphs,', COLS + 'x' + rows, (fs.statSync(path.join(root, 'src/assets/emoji.webp')).size / 1024).toFixed(1) + ' KB');

// Icons + OG: Earth cross-section with a shaft, drawn from the layer palette in config.
const layers = CFG.layers.map(l => l.c[0]);
const drawEarth = `(g, cx, cy, R, shaft) => {
  const cols = ${JSON.stringify(layers)}; const n = cols.length;
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(cx, cy, R * (1 - i / n), 0, 7); g.fill(); }
  g.fillStyle = '#4fae3d'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.lineWidth = R * 0.06; g.strokeStyle = '#4fae3d'; g.stroke();
  if (shaft) { g.fillStyle = 'rgba(12,8,6,.92)'; g.fillRect(cx - R * 0.09, cy - R * 1.02, R * 0.18, R * 1.02); g.fillStyle = '#ffc21a'; g.fillRect(cx - R * 0.09, cy - R * 0.12, R * 0.18, R * 0.12); }
}`;
const png = async (w, h, body) => {
  const url = await page.evaluate(`(() => { const w = ${w}, h = ${h}; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const earth = ${drawEarth}; ${body}; return c.toDataURL('image/png'); })()`);
  return Buffer.from(url.split(',')[1], 'base64');
};
const iconBody = (pad) => `g.fillStyle = '#1b120d'; g.fillRect(0, 0, w, h); const R = w * ${0.5 - pad}; earth(g, w / 2, h / 2 + R * 0.05, R, true);`;
fs.writeFileSync(path.join(root, 'public/icon-192.png'), await png(192, 192, iconBody(0.08)));
fs.writeFileSync(path.join(root, 'public/icon-512.png'), await png(512, 512, iconBody(0.08)));
fs.writeFileSync(path.join(root, 'public/icon-512-maskable.png'), await png(512, 512, iconBody(0.2)));
fs.writeFileSync(path.join(root, 'public/apple-touch-icon.png'), await png(180, 180, iconBody(0.1)));
fs.writeFileSync(path.join(root, 'public/og.png'), await png(1200, 630, `
  g.fillStyle = '#1b120d'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8fd0f5'; g.fillRect(0, 0, w, 150); g.fillStyle = '#4fae3d'; g.fillRect(0, 150, w, 14);
  const cols = ${JSON.stringify(CFG.layers.map(l => l.c))}; let y = 164; const hs = [30, 36, 44, 52, 60, 70, 80, 90, 100];
  cols.forEach((c, i) => { g.fillStyle = c[0]; g.fillRect(0, y, w, hs[i]); g.fillStyle = c[2]; for (let n = 0; n < 60; n++) g.fillRect((n * 197 + i * 53) % w, y + (n * 37) % Math.max(6, hs[i] - 8), 12, 6); y += hs[i]; });
  g.fillStyle = 'rgba(15,9,6,.92)'; g.fillRect(w / 2 - 60, 160, 120, 470);
  g.fillStyle = 'rgba(27,18,13,.88)'; g.fillRect(70, 60, 1060, 300);
  g.fillStyle = '#ffc21a'; g.font = '900 96px "Arial Black", Impact, sans-serif'; g.textBaseline = 'top'; g.fillText('THE HOLE WORLD', 110, 95);
  g.fillStyle = '#f7efe6'; g.font = '700 44px Arial, sans-serif'; g.fillText('The whole world digs one hole', 110, 215);
  g.fillStyle = '#b8a493'; g.font = '500 30px Arial, sans-serif'; g.fillText('Tap to dig through the Earth. Every meter counts for your country.', 110, 285);
  g.fillStyle = '#ffc21a'; g.fillRect(0, h - 40, w, 40); for (let x = -80; x < w; x += 60) { g.fillStyle = '#1b120d'; g.beginPath(); g.moveTo(x, h - 40); g.lineTo(x + 30, h - 40); g.lineTo(x + 60, h); g.lineTo(x + 30, h); g.fill(); }
`));
fs.writeFileSync(path.join(root, 'public/tma-cover.png'), await png(640, 360, `
  g.fillStyle = '#1b120d'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8fd0f5'; g.fillRect(0, 0, w, 90); g.fillStyle = '#4fae3d'; g.fillRect(0, 90, w, 10);
  const cols = ${JSON.stringify(CFG.layers.map(l => l.c))}; let y = 100; const hs = [18, 22, 26, 30, 34, 38, 42, 46, 50];
  cols.forEach((c, i) => { g.fillStyle = c[0]; g.fillRect(0, y, w, hs[i]); g.fillStyle = c[2]; for (let n = 0; n < 40; n++) g.fillRect((n * 197 + i * 53) % w, y + (n * 37) % Math.max(4, hs[i] - 6), 10, 5); y += hs[i]; });
  g.fillStyle = 'rgba(15,9,6,.92)'; g.fillRect(w / 2 - 34, 96, 68, 264);
  g.fillStyle = 'rgba(27,18,13,.9)'; g.fillRect(36, 28, 568, 150);
  g.fillStyle = '#ffc21a'; g.font = '900 54px "Arial Black", Impact, sans-serif'; g.textBaseline = 'top'; g.fillText('THE HOLE WORLD', 56, 46);
  g.fillStyle = '#f7efe6'; g.font = '700 26px Arial, sans-serif'; g.fillText('The whole world digs one hole', 56, 118);
  g.fillStyle = '#ffc21a'; g.fillRect(0, h - 22, w, 22); for (let x = -60; x < w; x += 40) { g.fillStyle = '#1b120d'; g.beginPath(); g.moveTo(x, h - 22); g.lineTo(x + 20, h - 22); g.lineTo(x + 40, h); g.lineTo(x + 20, h); g.fill(); }
`));
fs.writeFileSync(path.join(root, 'public/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1b120d"/>${layers.map((c, i) => `<circle cx="32" cy="34" r="${(26 * (1 - i / layers.length)).toFixed(1)}" fill="${c}"/>`).join('')}<circle cx="32" cy="34" r="26" fill="none" stroke="#4fae3d" stroke-width="2"/><rect x="29.5" y="7" width="5" height="27" fill="#120c09"/><rect x="29.5" y="30" width="5" height="4" fill="#ffc21a"/></svg>`);
await browser.close();
console.log('icons + og written to public/');
