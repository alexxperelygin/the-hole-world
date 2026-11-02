import { describe, it, expect } from 'vitest';
import { CFG } from './config';
import { generate, progress, claim, isDone, claimable, secsToMidnight } from './quests';
import { freshState, type GameState } from './state';

const st = (o: Partial<GameState> = {}): GameState => Object.assign(freshState(), o);

describe('daily quests', () => {
  it('generates perDay quests, stable for a date, different across dates', () => {
    const s = st(); const a = generate('2026-11-2', s), b = generate('2026-11-2', s), c = generate('2026-11-3', s);
    expect(a.length).toBe(CFG.quests.perDay);
    expect(a.map(q => q.id)).toEqual(b.map(q => q.id));
    expect(new Set(a.map(q => q.id)).size).toBe(a.length);
    const differs = ['2026-11-3', '2026-11-4', '2026-11-5', '2026-11-6'].some(d => generate(d, s).map(q => q.id).join() !== a.map(q => q.id).join());
    expect(differs).toBe(true); expect(c.length).toBe(CFG.quests.perDay);
  });
  it('meters target scales with pace and is a round number', () => {
    const slow = generate('2026-11-2', st()).find(q => q.id === 'meters') || generate('2026-11-3', st()).find(q => q.id === 'meters') || generate('2026-11-4', st()).find(q => q.id === 'meters');
    if (!slow) return;
    expect(slow.target).toBeGreaterThanOrEqual(50);
    const fast = st({ tool: 5, helpers: [10, 10, 10, 10, 0, 0, 0, 0] });
    const q = generate('2026-11-2', fast).find(x => x.id === 'meters') || generate('2026-11-3', fast).find(x => x.id === 'meters') || generate('2026-11-4', fast).find(x => x.id === 'meters');
    expect(q!.target).toBeGreaterThan(slow.target);
    expect(String(q!.target)).toMatch(/^[1-9]\d?0*$/);
  });
  it('progress caps at target, reports completion once, claim pays once', () => {
    const s = st(); s.q = { date: 'x', list: [{ id: 'taps', target: 3, prog: 0, claimed: false }] };
    expect(progress('taps', 1, s)).toBeNull(); expect(progress('taps', 5, s)?.id).toBe('taps');
    expect(s.q.list[0].prog).toBe(3); expect(progress('taps', 1, s)).toBeNull();
    expect(isDone(s.q.list[0])).toBe(true); expect(claimable(s).length).toBe(1);
    const r = claim(0, s); expect(r).toBeGreaterThanOrEqual(CFG.quests.minReward); expect(s.coins).toBe(r);
    expect(claim(0, s)).toBe(0); expect(claimable(s).length).toBe(0);
  });
  it('unfinished quests cannot be claimed', () => {
    const s = st(); s.q = { date: 'x', list: [{ id: 'finds', target: 2, prog: 1, claimed: false }] };
    expect(claim(0, s)).toBe(0); expect(s.coins).toBe(0);
  });
  it('secsToMidnight is within a day', () => { const v = secsToMidnight(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(86400); });
});
