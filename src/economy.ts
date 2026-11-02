/* Pure economy functions. No DOM, no globals: everything takes the config and a plain state object,
   so the simulator, the unit tests and the game share one implementation. */
import { CFG, type Config, type Layer } from './config.ts';

export interface EconState {
  depth: number; coins: number; tool: number; helpers: number[]; stars: number; crew: boolean;
  friends?: number;   // qualified referrals (SPEC §2.5): +2% idle each, max 25
  boost?: boolean;    // world-hole season finished: ×2 for 24 h
}
export interface LayerInfo { i: number; far: boolean; val: number; layer: Layer; seg: number }
export interface Bound { d: number; i: number; far: boolean; center?: boolean; out?: boolean }

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* layer at a depth; the far side mirrors the layers and pays more per meter */
export function layerAt(d: number, cfg: Config = CFG): LayerInfo {
  const L = cfg.layers, NL = L.length;
  d = clamp(d, 0, cfg.through);
  const far = d > cfg.earthR; const m = far ? cfg.through - d : d;
  let i = 0; for (let j = 0; j < NL; j++) if (m >= L[j].top) i = j;
  const val = far ? L[NL - 1].val * Math.pow(cfg.farSideValStep, NL - i) : L[i].val;
  return { i, far, val, layer: L[i], seg: far ? 2 * NL - 1 - i : i };
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
export function nextBound(d: number, B: Bound[] = BOUNDS): Bound { for (const b of B) if (b.d > d + 1e-9) return b; return B[B.length - 1]; }
export function prevBound(d: number, B: Bound[] = BOUNDS): number { let p = 0; for (const b of B) { if (b.d <= d + 1e-9) p = b.d; else break; } return p; }

/* multipliers */
export const prestigeMult = (stars: number, cfg: Config = CFG) => 1 + stars * cfg.prestigeMultPerStar;
export const mult = (s: Pick<EconState, 'stars' | 'crew' | 'boost'>, cfg: Config = CFG) => prestigeMult(s.stars, cfg) * (s.crew ? cfg.crewMult : 1) * (s.boost ? cfg.world.boostMult : 1);
export const friendsMult = (friends: number | undefined, cfg: Config = CFG) => 1 + cfg.referral.idlePctPerFriend * Math.min(cfg.referral.maxFriends, Math.max(0, friends || 0));
export const tapPow = (s: EconState, cfg: Config = CFG) => cfg.tools[s.tool].pow * mult(s, cfg);
export const idleRate = (s: EconState, cfg: Config = CFG) => s.helpers.reduce((sum, n, i) => sum + n * cfg.helpers[i].rate, 0) * mult(s, cfg) * friendsMult(s.friends, cfg);
export const comboMult = (combo: number, cfg: Config = CFG) => 1 + cfg.comboMult * Math.min(combo, cfg.comboMax) / cfg.comboMax;
/* income estimate used for find bonuses, nuggets and the daily chest */
export const incomePerSec = (s: EconState, cfg: Config = CFG) => (tapPow(s, cfg) * cfg.incomeTapsPerSec + idleRate(s, cfg)) * layerAt(s.depth, cfg).val;

/* prices */
export const helperCost = (i: number, owned: number, cfg: Config = CFG) => Math.ceil(cfg.helpers[i].cost * Math.pow(cfg.costGrowth, owned));
export const nextTool = (tool: number, cfg: Config = CFG) => cfg.tools[tool + 1] || null;
export const canBuyTool = (s: EconState, cfg: Config = CFG) => { const n = nextTool(s.tool, cfg); return !!n && s.coins >= n.cost; };
export const canBuyHelper = (s: EconState, i: number, cfg: Config = CFG) => s.coins >= helperCost(i, s.helpers[i], cfg);

/* digging: returns the meters actually dug and coins earned. Pays at the value of the layer where the stroke began (v0 behaviour). */
export function dig(s: EconState, m: number, cfg: Config = CFG): { m: number; coins: number } {
  if (s.depth >= cfg.through || m <= 0) return { m: 0, coins: 0 };
  const la = layerAt(s.depth, cfg);
  m = Math.min(m, cfg.through - s.depth);
  const coins = m * la.val;
  s.depth += m; s.coins += coins;
  return { m, coins };
}

/* offline: idle meters for `awaySec` seconds, capped; never completes a breakthrough */
export function offlineMeters(s: EconState, awaySec: number, cfg: Config = CFG): number {
  const cap = s.crew ? cfg.offlineCapCrew : cfg.offlineCapFree;
  const sec = Math.min(awaySec, cap); const rate = idleRate(s, cfg);
  if (sec < cfg.offlineMinSec || rate <= 0 || s.depth >= cfg.through) return 0;
  return Math.max(0, Math.min(rate * sec, cfg.through - 1 - s.depth));
}

/* finds */
export function pickRarity(roll: number, cfg: Config = CFG): number {
  const tot = cfg.rarity.reduce((a, r) => a + r.w, 0); let x = roll * tot;
  for (let i = 0; i < cfg.rarity.length; i++) { x -= cfg.rarity[i].w; if (x <= 0) return i; }
  return cfg.rarity.length - 1;
}
export const findBonus = (s: EconState, rarity: number, cfg: Config = CFG) => Math.max(5, incomePerSec(s, cfg) * cfg.rarity[rarity].secs);
export const nuggetBurst = (s: EconState, cfg: Config = CFG) => Math.max(50, incomePerSec(s, cfg) * cfg.nugget.burstSecs);
export const dailyChest = (s: EconState, streak: number, cfg: Config = CFG) => Math.max(cfg.dailyMinCoins, incomePerSec(s, cfg) * 60 * Math.min(cfg.dailyStreakCap, streak));

/* prestige: what resets and what stays */
export function freshRun(cfg: Config = CFG) { return { depth: 0, coins: 0, tool: 0, helpers: cfg.helpers.map(() => 0), seg: 0, ms: {} as Record<string, 1>, seenH: 1 }; }
export function prestige<T extends EconState & { stars: number; runs: number }>(s: T, cfg: Config = CFG): T {
  return Object.assign(s, freshRun(cfg), { stars: s.stars + 1, runs: s.runs + 1 });
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
