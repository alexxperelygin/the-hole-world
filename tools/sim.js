// Economy simulator: active player tapping at RATE taps/s, greedy buyer.
// Reads the real balance from src/config.ts (Node ≥ 22.18 strips types natively). Usage: node tools/sim.js <taps/s> <stars>
import { CFG } from '../src/config.ts';
import { layerAt, tapPow, idleRate, helperCost } from '../src/economy.ts';
const RATE = +process.argv[2] || 5, COMBO = 1.8, STARS = +process.argv[3] || 0, FATIGUE = process.argv.includes('fatigue');
let active = 0, restUntil = -1; // soft fatigue (off on the first day; pass `fatigue` to model a later day)
const seg = depth => layerAt(depth); // {i, val}
let t = 0, depth = 0, coins = 0, tool = 0, hc = CFG.helpers.map(() => 0);
const S = { stars: STARS, crew: false, get tool() { return tool; }, get helpers() { return hc; }, get depth() { return depth; }, coins: 0 };
const hRate = () => idleRate(S);
const tapP = () => tapPow(S);
const hCost = i => helperCost(i, hc[i]);
const marks = [3, 40, 1000, 12262, 35000, 150000, 660000, 2890000, 6371000, 12742000]; let mi = 0;
const ev = [];
const dt = 0.2;
while (depth < CFG.through && t < 3600 * 30) {
  let slow = 1; if (FATIGUE) { if (t < restUntil) slow = CFG.fatigue.slowMult; else { active += dt; if (active >= CFG.fatigue.activeSecPerDay) { active = 0; restUntil = t + CFG.fatigue.restSec; ev.push(`${fmt(t)} -- fatigue: rest ${CFG.fatigue.restSec / 60} min`); } } }
  const dm = (tapP() * RATE * COMBO * slow + hRate()) * dt;
  const s = seg(depth);
  depth += dm; coins += dm * s.val;
  // finds
  const exp = RATE * dt * CFG.findChance; const inc = (tapP() * RATE + hRate()) * s.val;
  coins += exp * inc * (0.7 * 8 + 0.22 * 25 + 0.07 * 90 + 0.01 * 400);
  // greedy buy
  for (let k = 0; k < 50; k++) {
    let best = null;
    if (tool + 1 < CFG.tools.length) { const n = CFG.tools[tool + 1]; best = { type: 't', cost: n.cost, eff: (n.pow - CFG.tools[tool].pow) * RATE * COMBO / n.cost }; }
    CFG.helpers.forEach((h, i) => { const c = hCost(i); const e = h.rate / c; if (!best || e > best.eff) best = { type: 'h', i, cost: c, eff: e }; });
    if (best && coins >= best.cost) { coins -= best.cost; if (best.type === 't') { tool++; ev.push(`${fmt(t)} tool→${CFG.tools[tool].id} @${Math.round(depth)}m`); } else hc[best.i]++; } else break;
  }
  while (mi < marks.length && depth >= marks[mi]) { ev.push(`${fmt(t)} ** depth ${marks[mi]} m  (tap ${tapP()}, idle ${Math.round(hRate())}/s)`); mi++; }
  t += dt;
}
function fmt(s) { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = Math.floor(s % 60); return `${h}h${String(m).padStart(2, '0')}m${String(ss).padStart(2, '0')}s`; }
console.log(ev.join('\n')); console.log('helpers', hc.join(','));
