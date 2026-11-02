/* Event hooks (SPEC §6). Buffered in memory; net.ts posts batches to /api/ev (Phase 2). No third-party trackers, no personal data. */
export interface Ev { n: string; p?: Record<string, string | number | boolean>; t: number }
const buf: Ev[] = [];
export function track(n: string, p?: Ev['p']) {
  buf.push({ n, p, t: Date.now() }); if (buf.length > 200) buf.shift();
  if (import.meta.env.DEV) console.debug('[ev]', n, p || '');
}
export const events = () => buf.slice();
/* net.ts ships batches to POST /api/ev and puts them back if the request fails */
export function drain(): Ev[] { return buf.splice(0, buf.length); }
export function requeue(evs: Ev[]) { buf.unshift(...evs); while (buf.length > 200) buf.pop(); }
