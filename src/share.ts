/* Share card (1080×1350 PNG), Web Share API with the file, social fallbacks, referral link. */
import { CFG } from './config';
import { S } from './state';
import { t, lang, fmtM, countryName, esc } from './i18n';
import { clamp } from './economy';
import { drawEmoji, flagOf, em } from './ui/emoji';
import { openModal } from './ui/modal';
import { track } from './analytics';
import { isTelegram, openUrl, tg } from './platform/telegram';

const L = CFG.layers;

export function shareUrl(): string {
  if (isTelegram() && CFG.tgApp) return CFG.tgApp + (S.ref ? '?startapp=r_' + encodeURIComponent(S.ref) : '');
  return CFG.shareUrl + '/' + (S.ref ? '?r=' + encodeURIComponent(S.ref) : '');
}
export function shareText(): string { return t('share_text', { d: fmtM(S.best), f: flagOf(S.country), c: countryName(S.country) }); }
export const shareFull = () => shareText() + ' ' + shareUrl();

export function drawCard(note: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d')!;
  g.fillStyle = '#8fd0f5'; g.fillRect(0, 0, 1080, 480);
  const bands: Array<[number, number]> = [[480, 0], [530, 1], [600, 2], [680, 3], [760, 4], [850, 5], [960, 6], [1070, 7], [1160, 8]];
  bands.forEach(([y, i], k) => { const ny = k + 1 < bands.length ? bands[k + 1][0] : 1350; g.fillStyle = L[i].c[0]; g.fillRect(0, y, 1080, ny - y);
    g.fillStyle = L[i].c[2]; for (let n = 0; n < 40; n++) g.fillRect((n * 197 + i * 53) % 1080, y + (n * 37) % Math.max(8, ny - y - 8), 14, 8); });
  g.fillStyle = '#4fae3d'; g.fillRect(0, 470, 1080, 18);
  const frac = clamp(Math.log10(1 + S.best) / Math.log10(1 + CFG.through), 0.06, 1);
  const sh = 488 + frac * 720; g.fillStyle = 'rgba(15,9,6,.9)'; g.fillRect(480, 488, 120, sh - 488);
  drawEmoji(g, '👷', 540, sh + 6, 104);
  g.fillStyle = '#1b120d'; g.fillRect(60, 60, 960, 370);
  g.fillStyle = '#ffc21a'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.font = '900 120px Unbounded, "Arial Black", sans-serif'; g.fillText(fmtM(S.best), 100, 95, 880);
  g.fillStyle = '#f7efe6'; g.font = '700 46px Onest, system-ui, sans-serif';
  const pre = t('card_for') + ' '; g.fillText(pre, 100, 240, 880); const pw = g.measureText(pre).width;
  drawEmoji(g, flagOf(S.country), 100 + pw, 236, 56, 'left', 'top'); g.fillText(countryName(S.country), 100 + pw + 68, 240, 880 - pw - 68);
  g.fillStyle = '#b8a493'; g.font = '500 34px Onest, system-ui, sans-serif'; wrap(g, note || t('tagline'), 100, 310, 880, 42, 2);
  g.fillStyle = '#ffc21a'; g.fillRect(0, 1230, 1080, 120);
  for (let x = -120; x < 1080; x += 60) { g.fillStyle = '#1b120d'; g.beginPath(); g.moveTo(x, 1230); g.lineTo(x + 30, 1230); g.lineTo(x + 60, 1260); g.lineTo(x + 30, 1260); g.fill(); }
  g.fillStyle = '#1b120d'; g.font = '900 48px Unbounded, "Arial Black", sans-serif'; g.textBaseline = 'middle'; g.fillText('THE HOLE WORLD', 60, 1305);
  g.textAlign = 'right'; g.font = '700 30px Onest, system-ui, sans-serif'; g.fillText(t('deeper_q'), 1020, 1305);
  return c;
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number, max: number) {
  const words = String(text).split(' '); let line = '', n = 0;
  for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (g.measureText(tst).width > w && line) { g.fillText(line, x, y + n * lh); line = wd; if (++n >= max) return; } else line = tst; }
  if (n < max) g.fillText(line, x, y + n * lh);
}

let lastCard: HTMLCanvasElement | null = null;
const cardBlob = () => new Promise<Blob | null>(res => { if (!lastCard) return res(null); try { lastCard.toBlob(b => res(b), 'image/png'); } catch { res(null); } });

export function canNativeShare(): boolean { return typeof navigator.share === 'function' && !isTelegram(); }
export async function nativeShare(): Promise<boolean> {
  if (!canNativeShare()) return false;
  const text = shareText(), url = shareUrl();
  try {
    const blob = await cardBlob();
    if (blob && navigator.canShare) {
      const file = new File([blob], 'the-hole-world.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, url }); track('share_done', { channel: 'native' }); return true; }
    }
    await navigator.share({ text, url }); track('share_done', { channel: 'native' }); return true;
  } catch { return false; }
}
export const SOCIALS: Array<{ id: string; label: string; url: (text: string, url: string) => string }> = [
  { id: 'x', label: 'X', url: (tx, u) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(tx)}&url=${encodeURIComponent(u)}` },
  { id: 'tg', label: 'Telegram', url: (tx, u) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(tx)}` },
  { id: 'wa', label: 'WhatsApp', url: (tx, u) => `https://wa.me/?text=${encodeURIComponent(tx + ' ' + u)}` },
  { id: 'rd', label: 'Reddit', url: (tx, u) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(tx)}` },
  { id: 'fb', label: 'Facebook', url: (_tx, u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
];
export function openSocial(id: string) {
  track('share_done', { channel: id });
  const s = SOCIALS.find(x => x.id === id); if (!s) return;
  const w = tg();
  if (id === 'tg' && w && w.switchInlineQuery && CFG.tgApp) { try { w.switchInlineQuery(shareText(), ['users', 'groups', 'channels']); return; } catch { /* fall through */ } }
  openUrl(s.url(shareText(), shareUrl()));
}
export function downloadCard() {
  if (!lastCard) return;
  try { const a = document.createElement('a'); a.href = lastCard.toDataURL('image/png'); a.download = 'the-hole-world-' + Math.round(S.best) + 'm.png'; a.click(); } catch { /* ignore */ }
}
export async function copyShare(btn: HTMLElement, linkOnly = false) {
  const txt = linkOnly ? shareUrl() : shareFull();
  const done = () => { const o = btn.innerHTML; btn.textContent = t('copied'); setTimeout(() => { btn.innerHTML = o; }, 1400); };
  try { await navigator.clipboard.writeText(txt); done(); } catch { selectShare(); }
}
function selectShare() { const el = document.querySelector('#shareTxt'); if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); if (!s) return; s.removeAllRanges(); s.addRange(r); }

/* opts.lock keeps the sheet locked during a breakthrough (the player must press "dig again") */
export function openShare(note: string, opts: { lock?: boolean; nextStar?: number } = {}) {
  const go = () => {
    let img = ''; try { lastCard = drawCard(note); img = lastCard.toDataURL('image/png'); } catch { lastCard = null; img = ''; }
    const list = isTelegram() ? [...SOCIALS].sort((a, b) => (a.id === 'tg' ? -1 : b.id === 'tg' ? 1 : 0)) : SOCIALS;
    const soc = list.map(s => `<button class="soc soc-${s.id}" type="button" data-act="share-${s.id}" aria-label="${s.label}"><span>${s.label}</span></button>`).join('');
    openModal(`<h2>${esc(t('share'))}</h2>${img ? `<img class="share-img" alt="" src="${img}">` : ''}
      <div class="note" id="shareTxt" style="color:var(--text);user-select:text;-webkit-user-select:text">${esc(shareFull())}</div>
      <div class="btns">
      ${canNativeShare() ? `<button class="btn primary" type="button" data-act="share-native">${em('📤')} ${esc(t('share'))}</button>` : ''}
      <div class="socials">${soc}</div>
      <div class="btns row2"><button class="btn" type="button" data-act="copy">${em('🔗')} ${esc(t('copy_link'))}</button><button class="btn" type="button" data-act="download">${em('📥')} ${esc(t('download'))}</button></div>
      ${opts.lock ? `<button class="btn" type="button" data-act="again">${esc(t('dig_again'))} ★${opts.nextStar ?? S.stars + 1}</button>` : `<button class="btn" type="button" data-act="close">${esc(t('close'))}</button>`}</div>
      <p class="hint-text">${esc(t('share_hint'))}</p>`, { lock: !!opts.lock });
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go); else go();
}
export { lang };
