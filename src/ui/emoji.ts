/* Noto emoji sprite (OFL). One look on every platform; Windows has no flag emoji at all.
   DOM: em('🐶') → <span class="em">🐶</span> positioned on the sprite, text kept for a11y and as fallback.
   Canvas: drawEmoji(). If the sprite fails to load, <html class="nosprite"> shows native emoji instead. */
import spriteUrl from '../assets/emoji.webp';
import sheet from '../assets/emoji-map.json';
import { esc } from '../i18n';

const MAP = sheet.map as unknown as Record<string, [number, number]>;
const COLS = sheet.cols, ROWS = sheet.rows, SZ = sheet.size;
const norm = (e: string) => e.replace(/️/g, '');
const LOOK: Record<string, [number, number]> = {}; for (const k in MAP) LOOK[norm(k)] = MAP[k];

export const sprite = new Image();
export let spriteReady = false;
sprite.decoding = 'async';
sprite.onload = () => { spriteReady = true; };
sprite.onerror = () => { document.documentElement.classList.add('nosprite'); };
sprite.src = spriteUrl;
document.documentElement.style.setProperty('--emoji-sprite', `url("${spriteUrl}")`);
document.documentElement.style.setProperty('--emoji-cols', String(COLS));

export const flagOf = (cc: string | null | undefined) => cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🏳️';

/* inline emoji as HTML */
export function em(e: string, cls = ''): string {
  const p = LOOK[norm(e)];
  if (!p) return `<span class="em raw ${cls}">${esc(e)}</span>`;
  return `<span class="em ${cls}" style="--ex:${p[0]};--ey:${p[1]}">${esc(e)}</span>`;
}
export const flag = (cc: string | null | undefined, cls = '') => em(flagOf(cc), cls);
/* set an element's content to one emoji */
export function setEm(el: Element | null, e: string) { if (el) el.innerHTML = em(e); }
/* replace <span data-e="🐶"> placeholders in static markup */
export function applyEmoji(root: ParentNode = document) { root.querySelectorAll<HTMLElement>('[data-e]').forEach(el => { el.innerHTML = em(el.dataset.e || ''); }); }

/* canvas */
export function drawEmoji(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number, align: 'center' | 'left' = 'center', baseline: 'bottom' | 'middle' | 'top' = 'bottom') {
  const p = LOOK[norm(e)];
  if (p && spriteReady) {
    const dx = align === 'center' ? x - size / 2 : x;
    const dy = baseline === 'bottom' ? y - size : baseline === 'middle' ? y - size / 2 : y;
    g.drawImage(sprite, p[0] * SZ, p[1] * SZ, SZ, SZ, dx, dy, size, size);
  } else {
    g.save(); g.font = `${Math.round(size * 0.86)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = align; g.textBaseline = baseline === 'bottom' ? 'alphabetic' : baseline; g.fillStyle = '#fff';
    g.fillText(e, x, baseline === 'bottom' ? y - size * 0.12 : y); g.restore();
  }
}
export const spriteSize = { cols: COLS, rows: ROWS, size: SZ };
