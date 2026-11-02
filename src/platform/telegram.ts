/* Telegram Mini App glue. Everything here is optional: the same build runs in a plain browser. */
interface TgWebApp {
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void; notificationOccurred?(type: 'error' | 'success' | 'warning'): void };
  expand?(): void; ready?(): void; disableVerticalSwipes?(): void; setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void;
  openTelegramLink?(url: string): void; openLink?(url: string, o?: { try_instant_view?: boolean }): void; openInvoice?(url: string, cb?: (status: string) => void): void;
  switchInlineQuery?(q: string, types?: string[]): void; isVersionAtLeast?(v: string): boolean; platform?: string; version?: string;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number }; contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  onEvent?(name: string, cb: () => void): void;
  initData?: string; initDataUnsafe?: { start_param?: string; user?: { id: number; language_code?: string } };
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

export const tg = (): TgWebApp | null => (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;
export const isTelegram = () => !!(tg() && tg()!.initData);

/* Are we inside a Telegram Mini App container? (hash/query markers that Telegram adds, or the SDK already present) */
export function looksLikeTelegram(): boolean {
  try {
    if (tg()) return true;
    if (/tgWebAppData|tgWebAppPlatform|tgWebAppVersion/.test(location.hash + location.search)) return true;
    if (window.parent !== window && /(^|\.)(telegram\.org|t\.me|web\.telegram\.org)$/.test(new URL(document.referrer || 'http://x').hostname)) return true;
  } catch { /* ignore */ }
  return false;
}
/* Load the official SDK only inside Telegram (keeps the web build free of it), then configure the container. */
export function loadTelegramSdk(timeoutMs = 2500): Promise<boolean> {
  if (tg()) { initTelegram(); return Promise.resolve(true); }
  if (!looksLikeTelegram()) return Promise.resolve(false);
  return new Promise(res => {
    const s = document.createElement('script'); s.src = 'https://telegram.org/js/telegram-web-app.js?58'; s.async = true;
    const done = (ok: boolean) => { clearTimeout(tm); if (ok) initTelegram(); res(ok); };
    const tm = setTimeout(() => done(false), timeoutMs);
    s.onload = () => done(!!tg()); s.onerror = () => done(false); document.head.appendChild(s);
  });
}
export function initTelegram() {
  const w = tg(); if (!w) return;
  try { w.ready && w.ready(); w.expand && w.expand(); w.disableVerticalSwipes && w.disableVerticalSwipes(); w.setHeaderColor && w.setHeaderColor('#1b120d'); w.setBackgroundColor && w.setBackgroundColor('#1b120d'); } catch { /* ignore */ }
  document.documentElement.classList.add('tma');
  applySafeArea(); try { w.onEvent && w.onEvent('safeAreaChanged', applySafeArea); w.onEvent && w.onEvent('contentSafeAreaChanged', applySafeArea); } catch { /* ignore */ }
}
/* Bot API 8.0+: on iOS/Android the web view extends under Telegram's own header (close / "…" buttons). Without this
   offset the top-right HUD buttons (GOLD, settings) sit under that header and taps never reach them. */
export function applySafeArea() {
  const w = tg(); if (!w) return;
  const sa = w.safeAreaInset, ca = w.contentSafeAreaInset;
  const top = (sa ? sa.top : 0) + (ca ? ca.top : 0);
  const st = document.documentElement.style;
  if (sa || ca) { st.setProperty("--tma-top", top + "px"); }
}
/* open a URL the Telegram way (t.me links stay inside the app) */
export function openUrl(url: string) {
  const w = tg();
  try { if (w && /^https:\/\/t\.me\//.test(url) && w.openTelegramLink) { w.openTelegramLink(url); return; } if (w && w.openLink) { w.openLink(url); return; } } catch { /* ignore */ }
  const win = window.open(url, '_blank', 'noopener,noreferrer'); if (win) win.opener = null;
}
export const tgLang = () => tg()?.initDataUnsafe?.user?.language_code || null;
export function haptic(ms: number) {
  try {
    const w = tg();
    if (w && w.HapticFeedback) w.HapticFeedback.impactOccurred(ms > 20 ? 'heavy' : 'light');
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch { /* ignore */ }
}
/* ?r=CODE on the web, startapp=r_CODE inside Telegram */
export function incomingRef(): string | null {
  try {
    const q = new URLSearchParams(location.search).get('r'); if (q && /^[a-z0-9]{4,12}$/i.test(q)) return q.toLowerCase();
    const sp = tg()?.initDataUnsafe?.start_param; if (sp && /^r_([a-z0-9]{4,12})$/i.test(sp)) return sp.slice(2).toLowerCase();
  } catch { /* ignore */ }
  return null;
}
