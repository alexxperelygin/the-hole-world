import { CFG } from './config';
import { freshRun, cfgOf, worldOf, type EconState } from './economy';

export const SAVE_KEY = 'holeworld.v1';

export interface Quest { id: string; target: number; prog: number; claimed: boolean }
export interface GameState extends EconState {
  v: 1;
  lifetime: number; taps: number; best: number; runs: number;
  finds: Record<string, number>;
  country: string | null; lang: string | null; sound: boolean;
  lastSeen: number; daily: { date: string | null; streak: number };
  newFinds: number; onboard: number;
  seg: number; ms: Record<string, 1>; seenH: number;
  q: { date: string | null; list: Quest[] };   // today's quests
  fat: { date: string | null; active: number; until: number }; // fatigue: active seconds today, rest-until timestamp
  firstDay: string | null;   // calendar day of the first session (fatigue-free)
  ref: string | null;        // this player's referral code (goes into share links)
  refBy: string | null;      // code of the player who invited us (qualified server-side after 100 taps)
  seq: number;               // last /api/sync sequence number (idempotency, SPEC §3.2)
  friends: number;           // qualified referrals, +2% idle each (server-side count, SPEC §2.5)
  boost: boolean;            // world-hole season finished: ×2 for everyone for 24 h (set from the world snapshot)
  seasonSeen: number;        // last season whose "humanity dug through" banner was shown
  countryNext: number;       // when the server allows the next country change (0 = any time)
  installed?: boolean;
  world: number;             // which world the digger is in (index into CFG.worlds, 0 = Earth)
  lap: number;               // completed laps of the world list
}

export function freshState(): GameState {
  return Object.assign({
    v: 1 as const, stars: 0, lifetime: 0, taps: 0, best: 0, runs: 0, finds: {}, country: null, lang: null, sound: true, crew: false,
    lastSeen: Date.now(), daily: { date: null, streak: 0 }, newFinds: 0, onboard: 0, q: { date: null, list: [] }, fat: { date: null, active: 0, until: 0 }, firstDay: null, ref: null, refBy: null, seq: 0, friends: 0, boost: false, seasonSeen: 0, countryNext: 0, world: 0, lap: 0,
  }, freshRun(CFG));
}

/* storage (never trusted to exist) */
export const store = {
  get<T = unknown>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export let S: GameState = freshState();
/* the balance config of the world the player is digging right now (layers, radius, finds, milestones) */
export const W = () => cfgOf(S);
export const worldNow = () => worldOf(S.world || 0);
export function setState(s: GameState) { S = s; }
export function save() { S.lastSeen = Date.now(); store.set(SAVE_KEY, S); }
export function loadSaved(): GameState | null { return fromSaved(store.get<Partial<GameState>>(SAVE_KEY)); }
/* merge a saved object (local or cloud) over a fresh state; null when it is not a v1 save */
export function fromSaved(saved: Partial<GameState> | null): GameState | null {
  if (!saved || saved.v !== 1) return null;
  const s = Object.assign(freshState(), saved);
  if (!Array.isArray(s.helpers) || s.helpers.length !== CFG.helpers.length) s.helpers = CFG.helpers.map((_, i) => (saved.helpers && saved.helpers[i]) || 0);
  return s;
}
export function makeRefCode(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let out = '';
  const rnd = new Uint8Array(6); try { crypto.getRandomValues(rnd); } catch { for (let i = 0; i < 6; i++) rnd[i] = Math.random() * 256; }
  for (let i = 0; i < 6; i++) out += a[rnd[i] % a.length];
  return out;
}
