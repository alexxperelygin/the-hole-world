/* Canvas 2D scene: strata, shaft, lamps, helpers, digger, particles, floating numbers. */
import { CFG } from './config';
import { S } from './state';
import { layerAt, BOUNDS, clamp, tapPow, idleRate, type LayerInfo } from './economy';
import { t } from './i18n';
import { drawEmoji } from './ui/emoji';

const L = CFG.layers;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const scene = document.getElementById('scene') as HTMLElement;
const cv = document.getElementById('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
export let cw = 300, ch = 300, dpr = 1;
function resize() { const r = scene.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); cw = Math.max(1, r.width); ch = Math.max(1, r.height); cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
if (window.ResizeObserver) new ResizeObserver(resize).observe(scene); else window.addEventListener('resize', resize);
resize();

function shade(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (a < 0) { r *= 1 + a; g *= 1 + a; b *= 1 + a; } else { r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export const PAL = L.map(l => ({ a: l.c[0], b: l.c[1], s1: l.c[1], s2: l.c[2], wall: shade(l.c[0], -0.25), shaft: shade(l.c[0], -0.72), line: shade(l.c[0], -0.5) }));
const SPECKS = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 420, r: rnd(1.5, 4.5), k: (Math.random() < 0.5 ? 's1' : 's2') as 's1' | 's2', w: Math.random() < 0.12 }));

export const cam = { viewDepth: 0, mpp: 0.025, shake: 0, swing: 0, now: performance.now() };
interface Part { x: number; y: number; vx: number; vy: number; s: number; life: number; c: string }
export interface Float { x: number; y: number; s: string; life: number; c?: string; big?: boolean }
const parts: Part[] = [], floats: Float[] = [];

export const digY = () => Math.round(ch * 0.68);
export function kick(amount: number) { cam.shake = Math.max(cam.shake, amount); }
export function swing() { cam.swing = 1; }
export function snap(depth: number) { cam.viewDepth = depth; }
export function resetCamera() { cam.viewDepth = 0; cam.mpp = 0.025; }
export function pushFloat(f: Float) { floats.push(f); if (floats.length > 30) floats.shift(); }
export function burst(x: number, y: number, n: number, la: LayerInfo) {
  if (REDUCED) n = Math.min(n, 4); const p = PAL[la.i];
  for (let i = 0; i < n; i++) { if (parts.length > 260) parts.shift(); parts.push({ x: x + rnd(-14, 14), y: y - 4, vx: rnd(-260, 260), vy: rnd(-520, -180), s: rnd(3, 7), life: rnd(0.45, 0.9), c: [p.a, p.s1, p.s2, p.line][i % 4] }); }
}
/* camera follows the digger; zoom depends on dig speed */
export function camera(dt: number) {
  const ir = idleRate(S);
  const target = Math.max(0.02, tapPow(S) / 4, ir / 30);
  cam.mpp += (target - cam.mpp) * Math.min(1, dt * 2.5);
  const diff = S.depth - cam.viewDepth; cam.viewDepth = Math.abs(diff) > cam.mpp * ch * 40 ? S.depth : cam.viewDepth + diff * Math.min(1, dt * 12);
}

function skyCol(y: number, below: boolean) { const k = clamp(y / Math.max(1, ch), 0, 1); return below ? `rgb(${120 + k * 60 | 0},${190 + k * 40 | 0},${235 + k * 15 | 0})` : `rgb(${110 + k * 90 | 0},${185 + k * 50 | 0},${240 + k * 12 | 0})`; }

export function draw(dt: number, ts: number) {
  cam.now = ts;
  const W = cw, H = ch; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let ox = 0, oy = 0;
  if (cam.shake > 0.2 && !REDUCED) { ox = rnd(-cam.shake, cam.shake); oy = rnd(-cam.shake, cam.shake); cam.shake *= Math.pow(0.02, dt); } else cam.shake = 0;
  ctx.save(); ctx.translate(ox, oy);
  const dY = digY(), shaftW = Math.min(W * 0.34, 210), sx0 = (W - shaftW) / 2, sx1 = sx0 + shaftW, vd = cam.viewDepth, mpp = cam.mpp;
  const yOf = (d: number) => dY + (d - vd) / mpp;
  const step = 3;
  for (let y = -10; y < H + 10; y += step) {
    const d = vd + (y - dY) * mpp;
    if (d < 0 || d > CFG.through) { ctx.fillStyle = skyCol(y, d > CFG.through); ctx.fillRect(-10, y, W + 20, step); continue; }
    const la = layerAt(d), p = PAL[la.i];
    ctx.fillStyle = (Math.floor(d / mpp / 18) & 1) ? p.a : p.b;
    if (y < dY) { ctx.fillRect(-10, y, sx0 + 10, step); ctx.fillRect(sx1, y, W - sx1 + 10, step); ctx.fillStyle = p.shaft; ctx.fillRect(sx0, y, shaftW, step); }
    else ctx.fillRect(-10, y, W + 20, step);
  }
  const surfY = yOf(0), outY = yOf(CFG.through);
  const shaftTop = Math.max(-10, surfY);
  if (shaftTop < dY) {
    const g = ctx.createLinearGradient(sx0, 0, sx1, 0); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = g; ctx.fillRect(sx0, shaftTop, shaftW, dY - shaftTop);
  }
  const off = ((vd / mpp) % 420 + 420) % 420;
  for (let k = -1; k <= Math.ceil(H / 420) + 1; k++) for (const s of SPECKS) {
    const y = k * 420 + s.y - off; if (y < -6 || y > H + 6) continue;
    const d = vd + (y - dY) * mpp; if (d < 0 || d > CFG.through) continue;
    const x = s.x * W; if (y < dY && x > sx0 - 2 && x < sx1 + 2) continue;
    const p = PAL[layerAt(d).i]; ctx.fillStyle = s.w ? 'rgba(255,255,255,.18)' : p[s.k];
    ctx.fillRect(x, y, s.r * 1.6, s.r);
  }
  for (const gy of [surfY, outY]) if (gy > -12 && gy < H + 12) {
    ctx.fillStyle = '#4fae3d'; ctx.fillRect(-10, gy - 2, (gy === surfY ? sx0 : W) + 10, 7); if (gy === surfY) ctx.fillRect(sx1, gy - 2, W - sx1 + 10, 7);
    ctx.fillStyle = '#6fd257'; for (let x = 0; x < W; x += 9) { if (gy === surfY && x > sx0 - 4 && x < sx1) continue; ctx.fillRect(x, gy - 6, 3, 6); }
  }
  ctx.font = '600 11px Onest, system-ui, sans-serif'; ctx.textBaseline = 'top';
  for (const b of BOUNDS) {
    const y = yOf(b.d); if (y < -20 || y > H + 20 || b.out) continue;
    ctx.strokeStyle = b.center ? 'rgba(255,240,180,.85)' : 'rgba(0,0,0,.42)'; ctx.lineWidth = b.center ? 3 : 2;
    ctx.beginPath(); for (let x = -10; x <= W + 10; x += 12) { const yy = y + (((x * 7 + b.d) % 5) - 2); if (x === -10) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke();
    const label = b.center ? '★ ' + t('center_label').toUpperCase() : t('layers.' + L[b.i].id);
    const lx = W - 62; ctx.fillStyle = 'rgba(0,0,0,.45)'; const tw = ctx.measureText(label).width; ctx.fillRect(lx - tw - 12, y + 5, tw + 12, 17);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillText(label, lx - tw - 6, y + 8);
  }
  if (shaftTop < dY - 20) {
    const rx = sx1 - shaftW * 0.22; ctx.strokeStyle = 'rgba(210,180,140,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx, shaftTop); ctx.lineTo(rx, dY - 34); ctx.stroke();
    const lo = ((vd / mpp) % 150 + 150) % 150;
    for (let y = -lo; y < dY - 40; y += 150) { if (y < shaftTop + 10) continue; const x = sx0 + 10;
      const gg = ctx.createRadialGradient(x, y, 1, x, y, 26); gg.addColorStop(0, 'rgba(255,214,120,.55)'); gg.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = gg; ctx.fillRect(x - 26, y - 26, 52, 52);
      ctx.fillStyle = '#ffe7a6'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  }
  const la = layerAt(vd);
  if (la.i >= 5) { const pulse = 0.5 + 0.5 * Math.sin(ts / 600); const a = (la.i - 4) * 0.06 + pulse * 0.06; const gg = ctx.createRadialGradient(W / 2, dY + 40, 10, W / 2, dY + 40, Math.max(W, H) * 0.7);
    gg.addColorStop(0, la.i >= 8 ? `rgba(255,236,150,${a + 0.1})` : `rgba(255,120,40,${a})`); gg.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(W / 2, dY + 2, shaftW * 0.42, 7, 0, 0, 7); ctx.fill();
  // helpers along the walls
  const owned: number[] = []; for (let i = CFG.helpers.length - 1; i >= 0 && owned.length < 6; i--) if (S.helpers[i] > 0) owned.push(i);
  owned.forEach((hi, k) => { const left = k % 2 === 0, row = Math.floor(k / 2); const x = left ? sx0 + 16 : sx1 - 16; const y = dY - 2 - row * 30 + Math.sin(ts / 180 + k) * 2.2; if (y > shaftTop + 20) drawEmoji(ctx, CFG.helpers[hi].e, x, y, 24); });
  // digger + tool
  if (S.crew) { const gg = ctx.createRadialGradient(W / 2 + 18, dY - 26, 2, W / 2 + 18, dY - 26, 46); gg.addColorStop(0, 'rgba(255,214,60,.7)'); gg.addColorStop(1, 'rgba(255,214,60,0)'); ctx.fillStyle = gg; ctx.fillRect(W / 2 - 40, dY - 80, 120, 100); }
  drawEmoji(ctx, '👷', W / 2 - 12, dY + 2, 44);
  cam.swing *= Math.pow(0.0005, dt);
  ctx.save(); ctx.translate(W / 2 + 20, dY - 18); ctx.rotate(-0.5 + cam.swing * 1.1); drawEmoji(ctx, CFG.tools[S.tool].e, 0, 14, 36); ctx.restore();
  const tg = ctx.createLinearGradient(0, 0, 0, 150); tg.addColorStop(0, 'rgba(12,8,6,.55)'); tg.addColorStop(1, 'rgba(12,8,6,0)'); ctx.fillStyle = tg; ctx.fillRect(-10, -10, W + 20, 160);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += 1100 * dt; p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); }
  ctx.globalAlpha = 1;
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.life -= dt; if (f.life <= 0) { floats.splice(i, 1); continue; }
    f.y -= 46 * dt; ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
    if (f.big) { drawEmoji(ctx, f.s, f.x, f.y, 40, 'center', 'middle'); continue; }
    ctx.font = '800 15px Unbounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,8,.85)'; ctx.strokeText(f.s, f.x, f.y); ctx.fillStyle = f.c || '#fff'; ctx.fillText(f.s, f.x, f.y); }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  ctx.restore();
}
