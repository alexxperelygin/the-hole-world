/* Live world client (SPEC §3.2). Talks to the Workers API (same origin /api by default, VITE_API_BASE to override) and falls back to the
   v0 demo generator whenever the API is unreachable, so the game always has a ranking to show. Personal economy never goes through here:
   we only report meter deltas for the country ranking, keep the cloud save, and ship analytics batches. */
import { CFG } from './config';
import { ANTI } from './antipodes';
import { S, save, store } from './state';
import { idleRate } from './economy';
import { drain as drainEvents, requeue as requeueEvents, track } from './analytics';
import { tg } from './platform/telegram';

export interface WorldRow { cc: string; m: number; today: number }
export interface WorldSeason { n: number; m: number; k: number; depth: number; doneAt: number; boostUntil: number; top: string[] }
export interface WorldSnapshot { rows: WorldRow[]; total: number; demo: boolean; t: number; season: WorldSeason | null }
interface Compact { t: number; total: number; day: string; rows: Array<[string, number, number]>; season: WorldSeason }
export interface SessionInfo { userId: string; token: string; country: string; countryNextChange: number; refCode: string; friends: number; entitlements: { crew: boolean; until: number }; save: { state: string; updated_at: number } | null }
export interface Overtake { a: string; b: string }

const API = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');
export const apiUrl = (p: string) => API + p;
const DEV_KEY = 'holeworld.dev';
const ACTIVE_MS = 15000, IDLE_MS = 60000, SAVE_MS = 30000, EV_MS = 60000, WORLD_MS = 10000, LIVE_TTL = 120000;
const BACKOFF0 = 30000, BACKOFF_MAX = 5 * 60000;

let token: string | null = null, uid: string | null = null;
let live: WorldSnapshot | null = null, liveAt = 0;
let online = false, nextTry = 0, backoff = BACKOFF0, connecting: Promise<SessionInfo | null> | null = null;
let lastSync = 0, lastSave = 0, lastEv = 0, lastWorldGet = 0, lastSaveJson = '';
const pend = { m: 0, taps: 0, since: Date.now() };
let inflight: Record<string, unknown> | null = null, inflightAt = 0;
const tapGaps: number[] = []; let lastTapAt = 0;
const onOvertakeCbs: Array<(o: Overtake) => void> = [], onSeasonCbs: Array<(s: WorldSeason) => void> = [], onSaveCbs: Array<(s: SessionInfo) => void> = [];

export const isOnline = () => online;
export const userId = () => uid;
export function onOvertake(cb: (o: Overtake) => void) { onOvertakeCbs.push(cb); }
export function onSeasonDone(cb: (s: WorldSeason) => void) { onSeasonCbs.push(cb); }
export function onSession(cb: (s: SessionInfo) => void) { onSaveCbs.push(cb); }

export function deviceId(): string {
  let id = store.get<string>(DEV_KEY);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) { id = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, ''); store.set(DEV_KEY, id); }
  return id;
}
async function post(path: string, body: unknown, keepalive = false): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  try {
    const r = await fetch(apiUrl(path), { method: path === '/api/save' ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive });
    const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json().catch(() => null) : null;
    return { ok: r.ok && !!data, status: r.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}

/* ---------- session ---------- */
export function connect(): Promise<SessionInfo | null> {
  if (connecting) return connecting;
  connecting = (async () => {
    const r = await post('/api/session', { deviceId: deviceId(), tgInitData: tg()?.initData || undefined, ref: S.refBy || undefined, refCode: S.ref || undefined, country: S.country || undefined });
    connecting = null;
    if (!r.ok || !r.data || typeof r.data.token !== 'string') { online = false; nextTry = Date.now() + backoff; backoff = Math.min(BACKOFF_MAX, backoff * 2); return null; }
    const info = r.data as unknown as SessionInfo;
    token = info.token; uid = info.userId; online = true; backoff = BACKOFF0; lastSync = Date.now(); // first sync 15 s after connecting, not at once
    applySession(info);
    for (const cb of onSaveCbs) cb(info);
    return info;
  })();
  return connecting;
}
function applySession(info: SessionInfo) {
  if (info.refCode && info.refCode !== S.ref) S.ref = info.refCode;             // the server's code is the one share links must carry
  if (info.country && ANTI[info.country]) S.country = info.country;              // server-side country is authoritative for the ranking
  S.friends = Math.min(CFG.referral.maxFriends, info.friends || 0);
  if (info.entitlements) S.crew = !!info.entitlements.crew;                      // the server is the source of truth for Gold (SPEC §4.1); the local flag is untrusted
  S.countryNext = info.countryNextChange || 0;
}
/* Player picked a country: the server allows a change once in 7 days and answers with what it recorded. */
export async function changeCountry(cc: string): Promise<{ country: string; nextChange: number } | null> {
  if (!online) { const s = await connect(); if (!s) return null; }
  const r = await post('/api/session', { deviceId: deviceId(), country: cc, refCode: S.ref || undefined });
  if (!r.ok || !r.data) return null;
  const info = r.data as unknown as SessionInfo; token = info.token; applySession(info);
  return { country: info.country, nextChange: info.countryNextChange || 0 };
}

/* ---------- payments (SPEC §4, Phase 3) ---------- */
export interface Access { crew: boolean; until: number; sources: string[] }
async function withToken<T>(fn: (tok: string) => Promise<T | null>): Promise<T | null> {
  if (!token) { await connect(); if (!token) return null; }
  return fn(token);
}
/* GET /api/entitlements: what the server says we own; applies to S.crew */
export function fetchEntitlements(): Promise<Access | null> {
  return withToken(async tok => {
    try {
      const r = await fetch(apiUrl('/api/entitlements'), { headers: { authorization: 'Bearer ' + tok }, cache: 'no-store' }); if (!r.ok) return null;
      const a = await r.json() as Access; if (typeof a.crew !== 'boolean') return null;
      S.crew = a.crew; return a;
    } catch { return null; }
  });
}
/* POST with the session token in the body (payment routes) */
export function postAuthed(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return withToken(async tok => { const r = await post(path, { ...body, token: tok }); return r.ok ? r.data : null; });
}
/* NOWPayments invoice for a 30/90/365-day pass; the worker talks to their API, we only get the hosted invoice URL */
export function createCryptoInvoice(days: number): Promise<{ url: string } | null> {
  return withToken(async tok => { const r = await post('/api/pay/nowpayments/invoice', { token: tok, days }); return r.ok && typeof r.data?.url === 'string' ? { url: r.data.url as string } : null; });
}

/* Telegram Stars (SPEC §4.4): invoice link for Telegram.WebApp.openInvoice; cancel = stop renewal, access stays to the end of the period */
export function createStarsInvoice(): Promise<{ url: string } | null> {
  return withToken(async tok => { const r = await post('/api/pay/stars/invoice', { token: tok }); return r.ok && typeof r.data?.url === 'string' ? { url: r.data.url as string } : null; });
}
export function cancelStars(resume = false): Promise<Access | null> {
  return withToken(async tok => { const r = await post('/api/pay/stars/cancel', { token: tok, resume }); if (!r.ok || typeof r.data?.crew !== 'boolean') return null; const a = r.data as unknown as Access; S.crew = a.crew; return a; });
}

/* ---------- meters & taps → /api/sync ---------- */
export function addDelta(m: number) { if (m > 0) pend.m += m; }
export function noteTap(tms: number) {
  pend.taps++;
  if (lastTapAt) { tapGaps.push(tms - lastTapAt); if (tapGaps.length > 200) tapGaps.shift(); } lastTapAt = tms;
}
function tapJitter(): number | undefined {
  if (tapGaps.length < 50) return undefined;
  const g = tapGaps.filter(x => x < 1000); if (g.length < 50) return undefined;
  const mean = g.reduce((a, b) => a + b, 0) / g.length; const v = g.reduce((a, b) => a + (b - mean) * (b - mean), 0) / g.length;
  return Math.round(Math.sqrt(v) * 100) / 100;
}
export const pending = () => ({ ...pend, inflight: inflight ? { ...inflight } : null, seq: S.seq });
let syncing = false;
export async function sync(keepalive = false): Promise<boolean> {
  if (!token || syncing) return false;
  const now = Date.now();
  if (!inflight) {
    if (pend.m <= 0 && pend.taps <= 0) return false;
    S.seq = (S.seq || 0) + 1;
    inflight = { seq: S.seq, deltaMeters: Math.round(pend.m * 1000) / 1000, taps: pend.taps, elapsedMs: Math.max(0, now - pend.since), tool: S.tool, idleRate: Math.round(idleRate(S) * 1000) / 1000, stars: S.stars, tapJitter: tapJitter() };
    pend.m = 0; pend.taps = 0; pend.since = now; inflightAt = now;
  }
  syncing = true; lastSync = now;
  const r = await post('/api/sync', { token, ...inflight }, keepalive);
  syncing = false;
  if (r.status === 401) { token = null; online = false; nextTry = 0; return false; }        // token expired: new session on the next tick, inflight is kept
  if (r.status === 429) { lastSync = now - ACTIVE_MS + Math.min(10000, Number(r.data?.retryIn) || 3000); return false; }
  if (!r.ok || !r.data) { online = false; nextTry = now + 10000; return false; }        // network: keep inflight, retry soon
  inflight = null;
  const d = r.data as { accepted: number; seq: number; dup?: boolean; friends: number; crew: boolean; world: Compact | null };
  if (typeof d.seq === 'number' && d.seq >= (S.seq || 0)) S.seq = d.seq;
  if (typeof d.friends === 'number') S.friends = Math.min(CFG.referral.maxFriends, d.friends);
  if (d.crew) S.crew = true;
  if (d.world) applySnapshot(d.world);
  return true;
}
/* ---------- world snapshot ---------- */
function applySnapshot(c: Compact) {
  const now = Date.now(); const prev = live;
  const rows: WorldRow[] = c.rows.map(([cc, m, today]) => ({ cc, m, today })).filter(r => ANTI[r.cc]);
  const season = c.season || null;
  live = { rows, total: c.total, demo: false, t: c.t, season }; liveAt = now;
  S.boost = !!season && season.boostUntil > now;
  if (season && season.doneAt && S.seasonSeen !== season.n) { S.seasonSeen = season.n; for (const cb of onSeasonCbs) cb(season); }
  if (prev && !prev.demo) for (const o of overtakes(prev.rows, rows)) for (const cb of onOvertakeCbs) cb(o);
}
/* "🇵🇱 overtakes 🇺🇦": countries that moved above a neighbour they were below in the previous snapshot (top 40 only) */
export function overtakes(prev: WorldRow[], next: WorldRow[], top = 40): Overtake[] {
  const pr = new Map<string, number>(); prev.slice(0, top).forEach((r, i) => pr.set(r.cc, i));
  const out: Overtake[] = [];
  next.slice(0, top).forEach((r, i) => {
    const was = pr.get(r.cc); if (was == null || was <= i) return;
    const below = next[i + 1]; if (!below) return; const bWas = pr.get(below.cc);
    if (bWas != null && bWas < was) out.push({ a: r.cc, b: below.cc });
  });
  return out;
}
export async function refreshWorld(): Promise<boolean> {
  const now = Date.now(); if (now - lastWorldGet < WORLD_MS) return false; lastWorldGet = now;
  try {
    const r = await fetch(apiUrl('/api/world'), { cache: 'no-cache' }); if (!r.ok) return false;
    const c = await r.json() as Compact; if (!c || !Array.isArray(c.rows)) return false;
    applySnapshot(c); return true;
  } catch { return false; }
}

/* ---------- cloud save & events ---------- */
export async function pushSave(force = false, keepalive = false): Promise<boolean> {
  if (!token) return false; const now = Date.now();
  if (!force && now - lastSave < SAVE_MS) return false;
  const json = JSON.stringify(S); if (json === lastSaveJson || json.length > 16 * 1024) return false;
  lastSave = now; const r = await post('/api/save', { token, state: json, updated_at: S.lastSeen || now }, keepalive);
  if (r.ok) lastSaveJson = json; return r.ok;
}
export async function flushEvents(force = false, keepalive = false): Promise<boolean> {
  if (!token) return false; const now = Date.now();
  if (!force && now - lastEv < EV_MS) return false; lastEv = now;
  const ev = drainEvents(); if (!ev.length) return false;
  const r = await post('/api/ev', { token, ev: ev.slice(0, 50) }, keepalive);
  if (!r.ok) requeueEvents(ev); else if (ev.length > 50) requeueEvents(ev.slice(50));
  return r.ok;
}
/* once a second from the game loop */
export function tick(now: number, worldTabOpen = false) {
  if (!token) { if (now >= nextTry && !connecting) connect(); return; }
  const active = pend.taps > 0 || (inflight && (inflight.taps as number) > 0);
  const due = inflight ? 15000 : active ? ACTIVE_MS : IDLE_MS;
  if (now - lastSync >= due && (pend.m > 0 || pend.taps > 0 || inflight)) sync();
  if (worldTabOpen) refreshWorld();
  pushSave(); flushEvents();
}
/* visibilitychange → hidden: ship everything now with keepalive requests */
export function flushAll() { if (!token) return; sync(true); pushSave(true, true); flushEvents(true, true); save(); }

/* ---------- demo fallback (v0 generator) ---------- */
const WEIGHT: Record<string, number> = { CN: 100, IN: 85, US: 62, BR: 40, ID: 34, RU: 30, JP: 22, NG: 20, MX: 22, DE: 16, PH: 18, TR: 17, VN: 16, GB: 14, FR: 13, IR: 12, TH: 12, EG: 11, IT: 11, KR: 11, ES: 10, PL: 8, UA: 8, AR: 9, CO: 9, PK: 12, BD: 10, CA: 9, SA: 6, MY: 6, KZ: 5, UZ: 5, PE: 5, CL: 4, VE: 4, NL: 4, AU: 6, ZA: 6, MA: 5, DZ: 5, BY: 3, AE: 3, IL: 3 };
const WORLD: Record<string, { base: number; rate: number }> = {};
(function seedWorld() {
  let s = 1337; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const cc of Object.keys(ANTI)) { const w = WEIGHT[cc] || 1.2 + r() * 2; WORLD[cc] = { base: w * 9e6 * (0.6 + r() * 0.8), rate: w * 260 * (0.5 + r()) }; }
})();
const worldT0 = Date.now() - 6 * 86400e3;
function demoSnapshot(): WorldSnapshot {
  const tms = Date.now(); const dayStart = tms - (tms % 86400e3);
  const rows = Object.keys(WORLD).map(cc => { const w = WORLD[cc]; const mine = cc === S.country ? S.lifetime : 0; return { cc, m: w.base + w.rate * (tms - worldT0) / 1000 + mine, today: w.rate * (tms - dayStart) / 1000 + mine }; }).sort((a, b) => b.m - a.m);
  const total = rows.reduce((s, r) => s + r.m, 0);
  return { rows, total, demo: true, t: tms, season: { n: 1, m: total * 0.4, k: CFG.world.defaultK, depth: total * 0.4 / CFG.world.defaultK, doneAt: 0, boostUntil: 0, top: [] } };
}
export function worldSnapshot(): WorldSnapshot {
  if (live && Date.now() - liveAt < LIVE_TTL) return live;
  return demoSnapshot();
}
export const countries = () => Object.keys(ANTI);
export function debugNet() { return { online, token: !!token, uid, pend: { ...pend }, inflight, seq: S.seq, liveAt, lastSync, inflightAt }; }
void track;
