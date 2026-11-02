import { describe, it, expect } from 'vitest';
import { CFG } from './config';
import { layerAt, bounds, nextBound, prevBound, mult, prestigeMult, tapPow, idleRate, comboMult, incomePerSec, helperCost, canBuyHelper, canBuyTool, dig, offlineMeters, pickRarity, findBonus, dailyChest, freshRun, prestige, type EconState } from './economy';
import * as E from './economy';

const st = (o: Partial<EconState> = {}): EconState => ({ depth: 0, coins: 0, tool: 0, helpers: CFG.helpers.map(() => 0), stars: 0, crew: false, ...o });
const NL = CFG.layers.length;

describe('layerAt', () => {
  it('maps surface depths to layers by top boundary (SPEC §2.2)', () => {
    expect(layerAt(0).layer.id).toBe('soil');
    expect(layerAt(2.99).layer.id).toBe('soil');
    expect(layerAt(3).layer.id).toBe('clay');
    expect(layerAt(40).layer.id).toBe('sed');
    expect(layerAt(1000).layer.id).toBe('granite');
    expect(layerAt(15000).layer.id).toBe('crust');
    expect(layerAt(35000).layer.id).toBe('umantle');
    expect(layerAt(660000).layer.id).toBe('lmantle');
    expect(layerAt(2890000).layer.id).toBe('ocore');
    expect(layerAt(5150000).layer.id).toBe('icore');
    expect(layerAt(CFG.earthR).layer.id).toBe('icore');
  });
  it('uses the layer value on the near side', () => {
    expect(layerAt(0).val).toBe(1);
    expect(layerAt(10).val).toBe(1.6);
    expect(layerAt(2e6).val).toBe(20);
    expect(layerAt(6e6).val).toBe(50);
  });
  it('mirrors layers on the far side and pays 50 × 1.5^k', () => {
    const justPast = layerAt(CFG.earthR + 1);
    expect(justPast.far).toBe(true); expect(justPast.layer.id).toBe('icore'); expect(justPast.val).toBeCloseTo(50 * 1.5);
    const farMantle = layerAt(CFG.through - 100000); // 100 km from exit = upper mantle mirrored
    expect(farMantle.layer.id).toBe('umantle'); expect(farMantle.val).toBeCloseTo(50 * Math.pow(1.5, NL - 5));
    const exit = layerAt(CFG.through - 1);
    expect(exit.layer.id).toBe('soil'); expect(exit.val).toBeCloseTo(50 * Math.pow(1.5, 9));
  });
  it('segments run 0..17 across the whole path and clamps out of range', () => {
    expect(layerAt(-5).seg).toBe(0);
    expect(layerAt(CFG.earthR).seg).toBe(NL - 1);
    expect(layerAt(CFG.earthR + 1).seg).toBe(NL);
    expect(layerAt(CFG.through - 1).seg).toBe(2 * NL - 1);
    expect(layerAt(CFG.through * 5).seg).toBe(2 * NL - 1);
  });
  it('boundaries are strictly increasing, 18 of them, ending at the exit', () => {
    const B = bounds(); expect(B.length).toBe(2 * NL);
    for (let i = 1; i < B.length; i++) expect(B[i].d).toBeGreaterThan(B[i - 1].d);
    expect(B[NL - 1].center).toBe(true); expect(B[B.length - 1].out).toBe(true); expect(B[B.length - 1].d).toBe(CFG.through);
    expect(nextBound(0).d).toBe(3); expect(prevBound(0)).toBe(0); expect(nextBound(500).d).toBe(1000); expect(prevBound(500)).toBe(40);
    expect(nextBound(CFG.through).out).toBe(true);
  });
});

describe('multipliers', () => {
  it('prestige: +50% per star, crew ×2 (SPEC §2.3)', () => {
    expect(prestigeMult(0)).toBe(1); expect(prestigeMult(1)).toBe(1.5); expect(prestigeMult(4)).toBe(3);
    expect(mult(st({ stars: 2, crew: true }))).toBe(4);
  });
  it('tap power = tool.pow × mult; idle = Σ n × rate × mult', () => {
    expect(tapPow(st())).toBeCloseTo(0.1);
    expect(tapPow(st({ tool: 1, stars: 1 }))).toBeCloseTo(0.45);
    const s = st({ helpers: [2, 1, 0, 0, 0, 0, 0, 0], crew: true });
    expect(idleRate(s)).toBeCloseTo((2 * 0.1 + 0.4) * 2);
  });
  it('combo climbs to ×2 at 40 taps and caps there', () => {
    expect(comboMult(0)).toBe(1); expect(comboMult(20)).toBe(1.5); expect(comboMult(40)).toBe(2); expect(comboMult(400)).toBe(2);
  });
  it('incomePerSec assumes 4 taps/s at the current layer value', () => {
    expect(incomePerSec(st({ tool: 1, depth: 10 }))).toBeCloseTo((0.3 * 4) * 1.6);
  });
});

describe('helper prices', () => {
  it('base × 1.15^owned, rounded up', () => {
    expect(helperCost(0, 0)).toBe(12);
    expect(helperCost(0, 1)).toBe(Math.ceil(12 * 1.15));
    expect(helperCost(0, 10)).toBe(Math.ceil(12 * Math.pow(1.15, 10)));
    expect(helperCost(7, 3)).toBe(Math.ceil(65e6 * Math.pow(1.15, 3)));
  });
  it('affordability checks', () => {
    expect(canBuyHelper(st({ coins: 11 }), 0)).toBe(false);
    expect(canBuyHelper(st({ coins: 12 }), 0)).toBe(true);
    expect(canBuyTool(st({ coins: 14 }))).toBe(false);
    expect(canBuyTool(st({ coins: 15 }))).toBe(true);
    expect(canBuyTool(st({ tool: CFG.tools.length - 1, coins: 1e12 }))).toBe(false);
  });
  it('tool and helper tables match SPEC §2.3', () => {
    expect(CFG.tools.map(t => t.pow)).toEqual([0.1, 0.3, 0.8, 2.5, 8, 30, 120, 500, 2500, 12000]);
    expect(CFG.tools.map(t => t.cost)).toEqual([0, 15, 150, 1500, 15e3, 150e3, 1.5e6, 15e6, 150e6, 1.5e9]);
    expect(CFG.helpers.map(h => h.rate)).toEqual([0.1, 0.4, 1.5, 6, 25, 100, 450, 2000]);
    expect(CFG.helpers.map(h => h.cost)).toEqual([12, 110, 1000, 9000, 80e3, 750e3, 7e6, 65e6]);
  });
});

describe('dig', () => {
  it('earns meters × value of the layer where the stroke began', () => {
    const s = st({ depth: 2.9 }); const r = dig(s, 1);
    expect(r.m).toBe(1); expect(r.coins).toBe(1); expect(s.depth).toBeCloseTo(3.9); expect(s.coins).toBe(1);
  });
  it('stops at the exit and ignores non-positive strokes', () => {
    const s = st({ depth: CFG.through - 5 }); const r = dig(s, 100);
    expect(r.m).toBe(5); expect(s.depth).toBe(CFG.through);
    expect(dig(s, 10).m).toBe(0); expect(dig(st(), -1).m).toBe(0);
  });
});

describe('offline income', () => {
  const s = () => st({ helpers: [10, 0, 0, 0, 0, 0, 0, 0] }); // 1 m/s
  it('idleRate × min(away, cap); free cap 2 h, Golden Shovel 24 h', () => {
    expect(offlineMeters(s(), 600)).toBeCloseTo(600);
    expect(offlineMeters(s(), 10 * 3600)).toBeCloseTo(2 * 3600);
    const crew = s(); crew.crew = true; // crew also doubles the rate
    expect(offlineMeters(crew, 30 * 3600)).toBeCloseTo(24 * 3600 * 2);
  });
  it('nothing for short absences, no helpers, or a finished run', () => {
    expect(offlineMeters(s(), 29)).toBe(0);
    expect(offlineMeters(st(), 3600)).toBe(0);
    expect(offlineMeters(st({ helpers: [10, 0, 0, 0, 0, 0, 0, 0], depth: CFG.through }), 3600)).toBe(0);
  });
  it('never completes a breakthrough', () => {
    const near = st({ helpers: [0, 0, 0, 0, 0, 0, 0, 10], depth: CFG.through - 1000 });
    const m = offlineMeters(near, 7200);
    expect(near.depth + m).toBeLessThan(CFG.through);
    expect(m).toBe(999);
  });
});

describe('finds, nuggets, daily chest', () => {
  it('rarity weights 70/22/7/1', () => {
    expect(pickRarity(0)).toBe(0); expect(pickRarity(0.699)).toBe(0); expect(pickRarity(0.71)).toBe(1);
    expect(pickRarity(0.92)).toBe(1); expect(pickRarity(0.93)).toBe(2); expect(pickRarity(0.995)).toBe(3); expect(pickRarity(1)).toBe(3);
  });
  it('find bonus = income × [8,25,90,400] s, floor 5', () => {
    const s = st({ tool: 3, depth: 2000 }); // 2.5×4×4 = 40/s
    expect(findBonus(s, 0)).toBeCloseTo(40 * 8); expect(findBonus(s, 3)).toBeCloseTo(40 * 400);
    expect(findBonus(st(), 0)).toBe(5);
  });
  it('daily chest = max(50, income × 60 × min(streak, 7))', () => {
    expect(dailyChest(st(), 1)).toBe(50);
    const s = st({ tool: 3, depth: 2000 });
    expect(dailyChest(s, 3)).toBeCloseTo(40 * 60 * 3); expect(dailyChest(s, 30)).toBeCloseTo(40 * 60 * 7);
  });
});

describe('prestige', () => {
  it('resets the run, keeps stars (+1), runs (+1) and everything else', () => {
    const s = { ...st({ depth: CFG.through, coins: 1e9, tool: 9, helpers: [5, 5, 5, 5, 5, 5, 5, 5], stars: 1, crew: true }), runs: 1, finds: { 'soil:0': 2 }, lifetime: 2e7, country: 'RU', seg: 17, ms: { m_kola: 1 as const }, seenH: 8 };
    const r = prestige(s);
    expect(r).toBe(s);
    expect(r.stars).toBe(2); expect(r.runs).toBe(2);
    expect(r.depth).toBe(0); expect(r.coins).toBe(0); expect(r.tool).toBe(0); expect(r.helpers).toEqual(CFG.helpers.map(() => 0));
    expect(r.seg).toBe(0); expect(r.ms).toEqual({}); expect(r.seenH).toBe(1);
    expect(r.finds).toEqual({ 'soil:0': 2 }); expect(r.lifetime).toBe(2e7); expect(r.country).toBe('RU'); expect(r.crew).toBe(true);
    expect(mult(r)).toBe(2 * 2);
  });
  it('freshRun has one helper slot per helper in config', () => {
    expect(freshRun().helpers.length).toBe(CFG.helpers.length);
  });
});

describe('soft fatigue', () => {
  const { tickFatigue, isTired, tiredMult } = E;
  it('starts a rest after activeSecPerDay of active tapping, then halves taps', () => {
    const f = { date: null as string | null, active: 0, until: 0 }; let now = 1e6;
    let started = false; for (let i = 0; i < CFG.fatigue.activeSecPerDay * 10 - 1; i++) started = tickFatigue(f, 0.1, 'd1', now, false) || started;
    expect(started).toBe(false);
    expect(tickFatigue(f, 0.2, 'd1', now, false)).toBe(true);
    expect(isTired(f, now)).toBe(true); expect(tiredMult(f, now, false)).toBe(CFG.fatigue.slowMult);
    expect(tiredMult(f, now, true)).toBe(1); // Golden Shovel ignores it
    now += CFG.fatigue.restSec * 1000 + 1; expect(isTired(f, now)).toBe(false); expect(tiredMult(f, now, false)).toBe(1);
  });
  it('is exempt on the first day and resets with the date', () => {
    const f = { date: 'd1', active: 100, until: 0 };
    expect(tickFatigue(f, 1e9, 'd1', 0, true)).toBe(false); expect(f.active).toBe(100);
    tickFatigue(f, 1, 'd2', 0, false); expect(f.date).toBe('d2'); expect(f.active).toBe(1);
  });
});
