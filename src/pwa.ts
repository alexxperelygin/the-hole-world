/* Service worker registration (vite-plugin-pwa) and the deferred install prompt.
   The install button is only offered after the first breakthrough (SPEC §3.1). */
import { registerSW } from 'virtual:pwa-register';

interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null;
const listeners: Array<() => void> = [];

export function initPWA() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try { registerSW({ immediate: true }); } catch { /* ignore */ }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach(f => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
}
export const canInstall = () => !!deferred && !matchMedia('(display-mode: standalone)').matches;
export const onInstallChange = (f: () => void) => listeners.push(f);
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred; deferred = null;
  try { await d.prompt(); const r = await d.userChoice; return r.outcome === 'accepted'; } catch { return false; }
}
