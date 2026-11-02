/* Client side of payments (SPEC §4, Phase 3). Card / Apple Pay / Google Pay go to the Polar checkout link with our userId as
   customer_external_id (no e-mail prefilled: Polar asks for it), crypto goes to a NOWPayments invoice made by the worker.
   After the return with ?paid=1 we poll /api/entitlements for up to a minute; the server alone decides whether Gold is on. */
import { POLAR_CHECKOUT } from './pay-plans';
import * as net from './net';
import { store } from './state';
import { ITEMS, isItem, type ItemId } from './pay-plans';

const PENDING_KEY = 'holeworld.pending';
/* remember what a redirect to the checkout was for, so the return knows whether to wait for Gold or for a pack of items */
export function setPending(item: ItemId | null, before = 0) { if (item) store.set(PENDING_KEY, { item, before, t: Date.now() }); else store.del(PENDING_KEY); }
export function takePending(): { item: ItemId; before: number } | null { const p = store.get<{ item: string; before: number; t: number }>(PENDING_KEY); store.del(PENDING_KEY); return p && isItem(p.item) && Date.now() - p.t < 3600e3 ? { item: p.item, before: p.before | 0 } : null; }

export const POLL_MS = 3000, POLL_MAX_MS = 60000;
/* static checkout link (fallback only: Polar links ignore customer_external_id, the grant then parks under the buyer's e-mail) */
export function checkoutUrl(userId: string, source: string): string {
  const u = new URL(POLAR_CHECKOUT); u.searchParams.set('customer_external_id', userId); u.searchParams.set('reference_id', source.slice(0, 32)); return u.toString();
}
/* preferred: a checkout session made by the worker with our userId bound as the Polar customer's external id */
export async function createCheckout(userId: string, source: string, item: ItemId | null = null): Promise<string> {
  try {
    const r = await net.postAuthed('/api/pay/polar/checkout', item ? { source, item } : { source });
    if (r && typeof r.url === 'string' && /^https:\/\/(.*\.)?polar\.sh\//.test(r.url)) return r.url;
  } catch { /* fall through */ }
  return item ? '' : checkoutUrl(userId, source);   // items have no static link: without the API there is nothing to buy
}
/* after an item checkout: poll the inventory until the pack arrives (webhooks take a few seconds) */
export async function waitForItem(item: ItemId, before: number): Promise<boolean> {
  const t0 = Date.now();
  for (;;) {
    const inv = await net.fetchInventory();
    if (inv && inv.items[item] > before) return true;
    const left = POLL_MAX_MS - (Date.now() - t0); if (left <= 0) return false;
    await new Promise(r => setTimeout(r, Math.min(POLL_MS, left)));
  }
}
export const itemQty = (item: ItemId) => ITEMS[item].qty;
/* ?paid=1 on the URL (Polar success_url / NOWPayments success_url) → true once, and the parameter is removed from the address bar */
export function consumePaidReturn(): boolean {
  try {
    const u = new URL(location.href); if (u.searchParams.get('paid') !== '1') return false;
    u.searchParams.delete('paid'); u.searchParams.delete('checkout_id'); u.searchParams.delete('src');
    history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    return true;
  } catch { return false; }
}
export const debugFlag = () => { try { return new URLSearchParams(location.search).get('debug') === '1'; } catch { return false; } };
/* poll until the server grants Gold or the budget runs out */
export async function waitForGold(onTick?: (left: number) => void): Promise<boolean> {
  const t0 = Date.now();
  for (;;) {
    const a = await net.fetchEntitlements();
    if (a && a.crew) return true;
    const left = POLL_MAX_MS - (Date.now() - t0); if (left <= 0) return false;
    onTick && onTick(left);
    await new Promise(r => setTimeout(r, Math.min(POLL_MS, left)));
  }
}
