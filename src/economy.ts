/* Pure economy functions. No DOM, no globals: everything takes the config and a plain state object,
   so the simulator, the unit tests and the game share one implementation.
   Units (Phase 5): tools and helpers produce EFFORT per second; a layer's `hard` says how much effort one meter costs.
   Coins are paid per meter (× layer val). The server counts effort (what v1 called meters), so the anti-cheat ceilings are unchanged. */
import { CFG, type Config, type Layer, type World } from './config.ts';

export interface EconState {
  depth: number; coins: number; tool: number; helpers: number[]; stars: number; crew: boolean;
  friends?: number;   // qualified referrals (SPEC §2.5): +2% idle each, max 25
  boost?: boolean;    // world-hole season finished: ×2 for 24 h
  world?: number;     // index into CFG.worlds (0 = Earth)
  lap?: number;       // how many times the world list has been completed
}
export interface LayerInfo { i: number; far: boolean; val: number; hard: number; layer: Layer; seg: number }
export interface Bound { d: number; i: number; far: boolean; center?: boolean; out?: boolean }

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ---------- worlds: a Config whose layers/radius/finds/milestones belong to one world ---------- */
const worldCache = new Map<string, Config>();
export function worldOf(world = 0, cfg: Config = CFG): World { const n = cfg.worlds.length; return cfg.worlds[((world % n) + n) % n]; }
export function lapHardMult(lap = 0, cfg: Config = CFG) { return Math.pow(cfg.lapHardMult, Math.max(0, lap)); }
/* the per-world config; Earth (index 0) reuses the top-level layers/finds/milestones so v1 balance tests keep their meaning */
export function worldCfg(world = 0, lap = 0, cfg: Config = CFG): Config {
  const key = world + ':' + lap + (cfg === CFG ? '' : ':x');
  const hit = cfg === CFG ? worldCache.get(key) : undefined; if (hit) return hit;
  const w = worldOf(world, cfg); const hm = w.hardMult * lapHardMult(lap, cfg);
  const src = world % cfg.worlds.length === 0 ? cfg.layers : w.layers;
  const layers = src.map(l => ({ ...l, hard: (l.hard || 1) * hm }));
  const out: Config = { ...cfg, layers, earthR: w.r, through: w.r * 2, finds: world % cfg.worlds.length === 0 ? cfg.finds : w.finds, milestones: world % cfg.worlds.length === 0 ? cfg.milestones : w.milestones };
  if (cfg === CFG) worldCache.set(key, out);
  return out;
}
export const cfgOf = (s: Pick<EconState, 'world' | 'lap'>, cfg: Config = CFG) => (s.world || s.lap) ? worldCfg(s.world || 0, s.lap || 0, cfg) : cfg;

/* layer at a depth; the far side mirrors the layers and pays more per meter */
export function layerAt(d: number, cfg: Config = CFG): LayerInfo {
  const L = cfg.layers, NL = L.length;
  d = clamp(d, 0, cfg.through);
  const far = d > cfg.earthR; const m = far ? cfg.through - d : d;
  let i = 0; for (let j = 0; j < NL; j++) if (m >= L[j].top) i = j;
  const val = far ? L[NL - 1].val * Math.pow(cfg.farSideValStep, NL - i) : L[i].val;
  return { i, far, val, hard: L[i].hard || 1, layer: L[i], seg: far ? 2 * NL - 1 - i : i };
}

/* boundaries along the whole path, used for the progress bar and drawing */
export function bounds(cfg: Config = CFG): Bound[] {
  const L = cfg.layers, NL = L.length, b: Bound[] = [];
  for (let j = 1; j < NL; j++) b.push({ d: L[j].top, i: j, far: false });
  b.push({ d: cfg.earthR, i: NL - 1, far: true, center: true });
  for (let j = NL - 1; j >= 1; j--) b.push({ d: cfg.through - L[j].top, i: j - 1, far: true });
  b.push({ d: cfg.through, i: -1, far: true, out: true });
  return b;
}
export const BOUNDS = bounds();
const boundsCache = new Map<Config, Bound[]>();
export function boundsOf(cfg: Config): Bound[] { if (cfg === CFG) return BOUNDS; let b = boundsCache.get(cfg); if (!b) { b = bounds(cfg); boundsCache.set(cfg, b); } return b; }
export function nextBound(d: number, B: Bound[] = BOUNDS): Bound { for (const b of B) if (b.d > d + 1e-9) return b; return B[B.length - 1]; }
export function prevBound(d: number, B: Bound[] = BOUNDS): number { let p = 0; for (const b of B) { if (b.d <= d + 1e-9) p = b.d; else break; } return p; }

/* multipliers */
export const prestigeMult = (stars: number, cfg: Config = CFG) => Math.pow(cfg.prestigeBase, Math.max(0, stars));
export const mult = (s: Pick<EconState, 'stars' | 'crew' | 'boost'>, cfg: Config = CFG) => prestigeMult(s.stars, cfg) * (s.crew ? cfg.crewMult : 1) * (s.boost ? cfg.world.boostMult : 1);
export const friendsMult = (friends: number | undefined, cfg: Config = CFG) => 1 + cfg.referral.idlePctPerFriend * Math.min(cfg.referral.maxFriends, Math.max(0, friends || 0));
/* effort per tap / per second (what the server sees as "meters") */
export const tapPow = (s: EconState, cfg: Config = CFG) => cfg.tools[s.tool].pow * mult(s, cfg);
export const idleRate = (s: EconState, cfg: Config = CFG) => s.helpers.reduce((sum, n, i) => sum + n * cfg.helpers[i].rate, 0) * mult(s, cfg) * friendsMult(s.friends, cfg);
export const comboMult = (combo: number, cfg: Config = CFG) => 1 + cfg.comboMult * Math.min(combo, cfg.comboMax) / cfg.comboMax;
/* hardness of the layer the digger stands in; meters = effort / hard */
export const hardAt = (s: Pick<EconState, 'depth' | 'world' | 'lap'>, cfg: Config = CFG) => layerAt(s.depth, cfgOf(s, cfg)).hard;
export const metersPerTap = (s: EconState, cfg: Config = CFG) => tapPow(s, cfg) / hardAt(s, cfg);
export const metersPerSec = (s: EconState, cfg: Config = CFG) => idleRate(s, cfg) / hardAt(s, cfg);
/* coin income estimate (per second) used for find bonuses, nuggets and the daily chest */
export function incomePerSec(s: EconState, cfg: Config = CFG) { const la = layerAt(s.depth, cfgOf(s, cfg)); return (tapPow(s, cfg) * cfg.incomeTapsPerSec + idleRate(s, cfg)) / la.hard * la.val; }

/* prices */
export const helperCost = (i: number, owned: number, cfg: Config = CFG) => Math.ceil(cfg.helpers[i].cost * Math.pow(cfg.costGrowth, owned));
export const nextTool = (tool: number, cfg: Config = CFG) => cfg.tools[tool + 1] || null;
export const canBuyTool = (s: EconState, cfg: Config = CFG) => { const n = nextTool(s.tool, cfg); return !!n && s.coins >= n.cost; };
export const canBuyHelper = (s: EconState, i: number, cfg: Config = CFG) => s.coins >= helperCost(i, s.helpers[i], cfg);

/* digging: spend `effort`, returns meters actually dug, coins earned and the effort consumed (what goes to the country).
   Pays at the value/hardness of the layer where the stroke began (v0 behaviour). */
export function dig(s: EconState, effort: number, cfg: Config = CFG): { m: number; coins: number; effort: number } {
  const wc = cfgOf(s, cfg);
  if (s.depth >= wc.through || effort <= 0) return { m: 0, coins: 0, effort: 0 };
  const la = layerAt(s.depth, wc);
  let m = effort / la.hard;
  if (m > wc.through - s.depth) { m = wc.through - s.depth; effort = m * la.hard; }
  const coins = m * la.val;
  s.depth += m; s.coins += coins;
  return { m, coins, effort };
}

/* offline: idle effort for `awaySec` seconds, capped; returns EFFORT (feed it to dig). Never completes a breakthrough. */
export function offlineEffort(s: EconState, awaySec: number, cfg: Config = CFG): number {
  const wc = cfgOf(s, cfg);
  const cap = s.crew ? cfg.offlineCapCrew : cfg.offlineCapFree;
  const sec = Math.min(awaySec, cap); const rate = idleRate(s, cfg);
  if (sec < cfg.offlineMinSec || rate <= 0 || s.depth >= wc.through) return 0;
  const la = layerAt(s.depth, wc);
  return Math.max(0, Math.min(rate * sec, (wc.through - 1 - s.depth) * la.hard));
}
/* v1 name kept for the tests and the panel: meters the helpers would dig while away */
export const offlineMeters = (s: EconState, awaySec: number, cfg: Config = CFG) => offlineEffort(s, awaySec, cfg) / hardAt(s, cfg);

/* finds */
export function pickRarity(roll: number, cfg: Config = CFG): number {
  const tot = cfg.rarity.reduce((a, r) => a + r.w, 0); let x = roll * tot;
  for (let i = 0; i < cfg.rarity.length; i++) { x -= cfg.rarity[i].w; if (x <= 0) return i; }
  return cfg.rarity.length - 1;
}
export const findBonus = (s: EconState, rarity: number, cfg: Config = CFG) => Math.max(5, incomePerSec(s, cfg) * cfg.rarity[rarity].secs);
export const nuggetBurst = (s: EconState, cfg: Config = CFG) => Math.max(50, incomePerSec(s, cfg) * cfg.nugget.burstSecs);
export const dailyChest = (s: EconState, streak: number, cfg: Config = CFG) => Math.max(cfg.dailyMinCoins, incomePerSec(s, cfg) * 60 * Math.min(cfg.dailyStreakCap, streak));

/* prestige: what resets and what stays. The digger moves on to the next world; after the last one the list wraps and the lap counter grows. */
export function freshRun(cfg: Config = CFG) { return { depth: 0, coins: 0, tool: 0, helpers: cfg.helpers.map(() => 0), seg: 0, ms: {} as Record<string, 1>, seenH: 1 }; }
export function nextWorld(s: Pick<EconState, 'world' | 'lap'>, cfg: Config = CFG): { world: number; lap: number } {
  const w = (s.world || 0) + 1; const n = cfg.worlds.length;
  return w >= n ? { world: 0, lap: (s.lap || 0) + 1 } : { world: w, lap: s.lap || 0 };
}
export function prestige<T extends EconState & { stars: number; runs: number }>(s: T, cfg: Config = CFG): T {
  return Object.assign(s, freshRun(cfg), nextWorld(s, cfg), { stars: s.stars + 1, runs: s.runs + 1 });
}

export const questReward = (s: EconState, cfg: Config = CFG) => Math.max(cfg.quests.minReward, Math.round(incomePerSec(s, cfg) * cfg.quests.rewardSecs));
export const collectionReward = (s: EconState, cfg: Config = CFG) => Math.max(50, Math.round(incomePerSec(s, cfg) * cfg.collectionRewardSecs));
/* round a target to 1-2 significant digits so quests read like "500" not "487" */
export function niceNumber(n: number): number { if (n < 10) return Math.max(1, Math.round(n)); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }

/* fatigue */
export interface Fatigue { date: string | null; active: number; until: number }
export const isTired = (f: Fatigue, nowMs: number) => f.until > nowMs;
export const tiredMult = (f: Fatigue, nowMs: number, crew: boolean, cfg: Config = CFG) => (!crew && isTired(f, nowMs)) ? cfg.fatigue.slowMult : 1;
/* advance active time; returns true when a rest period just started */
export function tickFatigue(f: Fatigue, dt: number, today: string, nowMs: number, exempt: boolean, cfg: Config = CFG): boolean {
  if (f.date !== today) { f.date = today; f.active = 0; }
  if (exempt || isTired(f, nowMs)) return false;
  f.active += dt;
  if (f.active >= cfg.fatigue.activeSecPerDay) { f.active = 0; f.until = nowMs + cfg.fatigue.restSec * 1000; return true; }
  return false;
}
