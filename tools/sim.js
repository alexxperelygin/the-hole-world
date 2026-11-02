// Economy simulator: a player tapping at RATE taps/s while active, greedy buyer. Reads the real balance from src/config.ts.
// Usage: node tools/sim.js <taps/s> <stars> [world] [fatigue] [casual]
//   casual  = 20 min active per day, then helpers only (free offline cap 2 h, so 2 h of idle credit per 24 h); prints wall-clock days
//   fatigue = model the soft fatigue (off on the first day of play)
import { CFG } from '../src/config.ts';
import { layerAt, tapPow, idleRate, helperCost, worldCfg } from '../src/economy.ts';
const RATE = +process.argv[2] || 5, COMBO = 1.8, STARS = +process.argv[3] || 0, WORLD = +process.argv[4] || 0;
const FATIGUE = process.argv.includes('fatigue'), CASUAL = process.argv.includes('casual');
// tuning overrides without editing the config: WORLD_HARD=1,4,12,30,60,150,400 STAR_BASE=2 node tools/sim.js ...
if (process.env.WORLD_HARD) process.env.WORLD_HARD.split(',').forEach((v, i) => { if (CFG.worlds[i]) CFG.worlds[i].hardMult = +v; });
if (process.env.STAR_BASE) CFG.prestigeBase = +process.env.STAR_BASE;
const W = worldCfg(WORLD, 0), NAME = CFG.worlds[WORLD % CFG.worlds.length].id;
let active = 0, restUntil = -1;
let t = 0, depth = 0, coins = 0, tool = 0, hc = CFG.helpers.map(() => 0);
const S = { stars: STARS, crew: false, world: WORLD, get tool() { return tool; }, get helpers() { return hc; }, get depth() { return depth; }, coins: 0 };
const hRate = () => idleRate(S);
const tapP = () => tapPow(S);
const hCost = i => helperCost(i, hc[i]);
const marks = W.layers.slice(1).map(l => l.top).concat(W.milestones.map(m => m.d)).concat([W.earthR, W.through]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b); let mi = 0;
const ev = [];
const dt = 0.5;
const DAY = 86400, ACTIVE_S = 20 * 60, OFFLINE_CAP = CFG.offlineCapFree;
const activeNow = () => !CASUAL || (t % DAY) < ACTIVE_S;                      // casual: first 20 min of every day
const idleCredited = () => !CASUAL || (t % DAY) < ACTIVE_S + OFFLINE_CAP;      // casual: helpers count for 2 h after the session, then the cap bites
const LIMIT = CASUAL ? 3600 * 24 * 400 : 3600 * 300;
while (depth < W.through && t < LIMIT) {
  if (CASUAL && !idleCredited()) { t += DAY - (t % DAY); continue; }          // skip the dead part of the day
  let slow = 1; if (FATIGUE && activeNow()) { if (t < restUntil) slow = CFG.fatigue.slowMult; else { active += dt; if (active >= CFG.fatigue.activeSecPerDay) { active = 0; restUntil = t + CFG.fatigue.restSec; ev.push(`${fmt(t)} -- fatigue: rest ${CFG.fatigue.restSec / 60} min`); } } }
  const la = layerAt(depth, W);
  const effort = ((activeNow() ? tapP() * RATE * COMBO * slow : 0) + hRate()) * dt;
  const dm = Math.min(effort / la.hard, W.through - depth);
  depth += dm; coins += dm * la.val;
  if (activeNow()) { // finds
    const exp = RATE * dt * CFG.findChance; const inc = (tapP() * RATE + hRate()) / la.hard * la.val;
    coins += exp * inc * (0.7 * 8 + 0.22 * 25 + 0.07 * 90 + 0.01 * 400);
  }
  if (activeNow() || (t % 60) < dt) for (let k = 0; k < 50; k++) { // greedy buy (a casual player buys when he looks at the game; idle buys once a minute approximate the next session's spend)
    let best = null;
    if (tool + 1 < CFG.tools.length) { const n = CFG.tools[tool + 1]; best = { type: 't', cost: n.cost, eff: (n.pow - CFG.tools[tool].pow) * RATE * COMBO / n.cost }; }
    CFG.helpers.forEach((h, i) => { const c = hCost(i); const e = h.rate / c; if (!best || e > best.eff) best = { type: 'h', i, cost: c, eff: e }; });
    if (best && coins >= best.cost) { coins -= best.cost; if (best.type === 't') { tool++; ev.push(`${fmt(t)} tool→${CFG.tools[tool].id} @${fm(depth)}`); } else hc[best.i]++; } else break;
  }
  while (mi < marks.length && depth >= marks[mi]) { ev.push(`${fmt(t)} ** ${fm(marks[mi])}  (tap ${tapP()}, idle ${Math.round(hRate())}/s, hard ${la.hard}, ${layerAt(marks[mi] - 0.01, W).layer.id})`); mi++; }
  t += dt;
}
function fmt(s) { const d = Math.floor(s / DAY), h = Math.floor(s % DAY / 3600), m = Math.floor(s % 3600 / 60), ss = Math.floor(s % 60); return (d ? d + 'd ' : '') + `${h}h${String(m).padStart(2, '0')}m${String(ss).padStart(2, '0')}s`; }
function fm(m) { return m >= 1e6 ? (m / 1e6).toFixed(m < 1e7 ? 2 : 0) + ' Mm' : m >= 1000 ? (m / 1000).toFixed(m < 1e4 ? 1 : 0) + ' km' : Math.round(m) + ' m'; }
console.log(`world ${NAME}  stars ${STARS}  ${RATE} taps/s ${CASUAL ? 'casual (20 min/day)' : 'active'}${FATIGUE ? ' fatigue' : ''}`);
console.log(ev.join('\n')); console.log(depth < W.through ? `NOT FINISHED by ${fmt(t)} at ${fm(depth)}` : `finished ${fmt(t)}`, 'helpers', hc.join(','));
