/* Payment catalogue shared by the game client and the worker (SPEC §4). Not balance: prices and durations of what is sold. */
export const GRACE_DAYS = 3;                       // subscription stays on this long after the period end (SPEC §4.2)
export const DAY_MS = 86400e3;
/* NOWPayments prepaid passes (SPEC §4.3): one-off, stackable */
export const PASSES: ReadonlyArray<{ days: 30 | 90 | 365; usd: number }> = [
  { days: 30, usd: 4.99 },
  { days: 90, usd: 12.99 },
  { days: 365, usd: 39.99 },
];
export const passByDays = (d: number) => PASSES.find(p => p.days === d) || null;
/* Polar checkout link for Golden Shovel ($4.99 / month); the client appends customer_external_id=<userId> so the webhook can map the buyer. */
/* Telegram Stars subscription (SPEC §4.4): price in XTR per 30 days, ~$5 equivalent; subscription_period must be exactly 30 days. */
export const STARS_PRICE = 250;
export const STARS_PERIOD_S = 2592000;
export const POLAR_CHECKOUT = 'https://buy.polar.sh/polar_cl_xPtW6Zy007HXdDrdy7EGnjpLQwRR6voU95Z2523exYf';
/* Consumables (Phase 5): one-off purchases by card (Polar one-time products) or Telegram Stars (non-subscription invoice).
   dynamite: a pack of sticks, each ×mult to everything for `secs` seconds. boost: ×mult for every player of the buyer's country for `hours`,
   the buyer's nickname shows in the country's ticker. Crypto passes stay Gold-only. */
export const ITEMS = {
  dynamite: { e: '🧨', usd: 1.99, stars: 100, qty: 5, mult: 10, secs: 60 },
  boost:    { e: '🚀', usd: 2.99, stars: 150, qty: 1, mult: 2, hours: 1 },
} as const;
export type ItemId = keyof typeof ITEMS;
export const isItem = (x: unknown): x is ItemId => x === 'dynamite' || x === 'boost';
export const NICK_RE = /^[\p{L}\p{N}_ .-]{2,16}$/u;
