// Parameter search for the balance curves. Reads src/config.ts; usage: node tools/tune.js search | node tools/tune.js '{"r":3,"k":10,...}' [taps/s] [stars]
import { CFG as base } from '../src/config.ts';
function run(P, RATE = 5, COMBO = 1.8, STARS = 0) {
  const CFG = JSON.parse(JSON.stringify(base));
  CFG.farSideValStep = P.fs;
  CFG.tools = CFG.tools.map((x, n) => ({ ...x, pow: +(0.1 * Math.pow(P.r, n)).toPrecision(2), cost: n ? +(P.c1 * Math.pow(P.k, n - 1)).toPrecision(2) : 0 }));
  CFG.helpers = CFG.helpers.map((x, i) => ({ ...x, rate: +(P.h0 * Math.pow(P.r, i)).toPrecision(2), cost: +(P.hc * Math.pow(P.k, i)).toPrecision(2) }));
  const L = CFG.layers;
  const seg = d => { d = Math.min(d, CFG.through); if (d <= CFG.earthR) { let i = 0; for (let j = 0; j < L.length; j++) if (d >= L[j].top) i = j; return L[i].val; } const m = CFG.through - d; let i = 0; for (let j = 0; j < L.length; j++) if (m >= L[j].top) i = j; return L[8].val * Math.pow(CFG.farSideValStep, 9 - i); };
  let t = 0, depth = 0, coins = 0, tool = 0, hc = CFG.helpers.map(() => 0); const mult = 1 + STARS;
  const hR = () => hc.reduce((s, n, i) => s + n * CFG.helpers[i].rate, 0) * mult, tp = () => CFG.tools[tool].pow * mult, hC = i => Math.ceil(CFG.helpers[i].cost * Math.pow(CFG.costGrowth, hc[i]));
  const marks = [1000, 12262, 35000, 660000, 6371000, 12742000], got = []; let mi = 0; const dt = 0.5; const tl = [];
  while (depth < CFG.through && t < 3600 * 40) {
    const v = seg(depth), dm = (tp() * RATE * COMBO + hR()) * dt; depth += dm; coins += dm * v;
    coins += RATE * dt * CFG.findChance * (tp() * RATE + hR()) * v * (0.7 * 8 + 0.22 * 25 + 0.07 * 90 + 0.01 * 400);
    for (let k = 0; k < 60; k++) { let b = null; if (tool + 1 < CFG.tools.length) { const n = CFG.tools[tool + 1]; b = { t: 1, c: n.cost, e: (n.pow - CFG.tools[tool].pow) * RATE * COMBO / n.cost }; }
      CFG.helpers.forEach((h, i) => { const c = hC(i), e = h.rate / c; if (!b || e > b.e) b = { t: 0, i, c, e }; });
      if (b && coins >= b.c) { coins -= b.c; if (b.t) { tool++; tl.push([CFG.tools[tool].id, Math.round(t)]); } else hc[b.i]++; } else break; }
    while (mi < marks.length && depth >= marks[mi]) { got.push(t); mi++; } t += dt;
  }
  while (got.length < marks.length) got.push(3600 * 40);
  return { got, tl, CFG };
}
const T = [300, 900, 1500, 3600, 6600, 9000];
if (process.argv[2] === 'search') {
  let best = null;
  for (const r of [2.6, 2.8, 3, 3.3, 3.6, 4]) for (const k of [8, 10, 12, 14, 17, 20]) for (const c1 of [40, 70, 120, 200]) for (const hc of [40, 70, 120, 200]) for (const h0 of [0.05, 0.08, 0.12]) for (const fs of [1.15, 1.3, 1.5]) {
    const P = { r, k, c1, hc, h0, fs }; const { got } = run(P); const s = got.reduce((a, g, i) => a + Math.log(g / T[i]) ** 2, 0); if (!best || s < best.s) best = { s, P, got };
  }
  console.log(JSON.stringify(best));
} else {
  const P = JSON.parse(process.argv[2]); const { got, tl, CFG } = run(P, +process.argv[3] || 5, 1.8, +process.argv[4] || 0);
  console.log('marks(min):', got.map(g => (g / 60).toFixed(1)).join(' | '));
  console.log('tools:', tl.map(([n, t]) => `${n}@${(t / 60).toFixed(1)}m`).join(' '));
  if (process.argv[5]) console.log(JSON.stringify({ tools: CFG.tools, helpers: CFG.helpers }));
}
