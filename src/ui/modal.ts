/* One bottom sheet for everything: milestones, legendary finds, breakthrough, paywall, settings, share, country. */
const modal = document.getElementById('modal') as HTMLElement;
const sheet = document.getElementById('sheet') as HTMLElement;
let lock = false;
type Handler = (act: string, el: HTMLElement) => void;
const handlers: Handler[] = [];

export function openModal(html: string, opts: { lock?: boolean } = {}) {
  sheet.innerHTML = html; modal.hidden = false; lock = !!opts.lock; sheet.scrollTop = 0;
  const f = sheet.querySelector<HTMLElement>('[data-focus]'); if (f) setTimeout(() => f.focus(), 50);
}
export function closeModal(force = false) { if (lock && !force) return; lock = false; modal.hidden = true; sheet.innerHTML = ''; }
export const modalOpen = () => !modal.hidden;
export const sheetEl = () => sheet;
export function onAction(h: Handler) { handlers.push(h); }

modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
sheet.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return;
  const a = b.dataset.act || '';
  if (a === 'close') { closeModal(true); return; }
  for (const h of handlers) h(a, b);
});
