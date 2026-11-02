/* Daily quests: generated from the date, progressed by game events, claimed for coins. No DOM here. */
import { CFG } from './config.ts';
import { S, type Quest } from './state';
import { tapPow, idleRate, niceNumber, questReward } from './economy';

export const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
export function secsToMidnight(now = new Date()) { const m = new Date(now); m.setHours(24, 0, 0, 0); return Math.max(0, Math.round((m.getTime() - now.getTime()) / 1000)); }

/* pick N kinds for a day (stable per date), targets scale with stars and current pace */
export function generate(date: string, s = S): Quest[] {
  const kinds = CFG.quests.kinds; let seed = 0; for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const order = kinds.map((k, i) => ({ k, r: ((seed * 9301 + i * 49297) % 233280) / 233280 })).sort((a, b) => a.r - b.r).slice(0, CFG.quests.perDay).map(x => x.k);
  return order.map(k => {
    let target: number;
    if (k.id === 'meters') { const perSec = tapPow(s) * CFG.incomeTapsPerSec + idleRate(s); target = niceNumber(Math.max(50, perSec * 60 * (k.minutes || 10))); }
    else target = niceNumber((k.base || 1) + (k.perStar || 0) * s.stars);
    return { id: k.id, target, prog: 0, claimed: false };
  });
}
export function ensureToday(s = S): boolean {
  const td = dayKey(); if (s.q.date === td && s.q.list.length) return false;
  s.q = { date: td, list: generate(td, s) }; return true;
}
export function progress(id: string, n = 1, s = S): Quest | null {
  for (const q of s.q.list) if (q.id === id && !q.claimed && q.prog < q.target) { const was = q.prog; q.prog = Math.min(q.target, q.prog + n); if (was < q.target && q.prog >= q.target) return q; }
  return null;
}
export const isDone = (q: Quest) => q.prog >= q.target;
export const claimable = (s = S) => s.q.list.filter(q => isDone(q) && !q.claimed);
export function claim(i: number, s = S): number { const q = s.q.list[i]; if (!q || !isDone(q) || q.claimed) return 0; q.claimed = true; const r = questReward(s); s.coins += r; return r; }
export const kindOf = (id: string) => CFG.quests.kinds.find(k => k.id === id)!;
