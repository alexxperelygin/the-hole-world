/* Small motion helpers: coins flying into the counter, tab bumps, counter pops. All skipped under prefers-reduced-motion. */
import { REDUCED } from '../scene';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

/* coins fly from `from` to the HUD coin, then the counter pops */
export function flyCoins(from: Element | null, n = 6, toHud = true) {
  const hud = $('.hud .coin'); if (!from || !hud || REDUCED) { pop($('.coins')); return; }
  const a = (toHud ? from : hud).getBoundingClientRect(), b = (toHud ? hud : from).getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span'); el.className = 'coin fly'; document.body.appendChild(el);
    const dx = (Math.random() - 0.5) * 60, dy = (Math.random() - 0.5) * 40, dur = 520 + Math.random() * 220;
    const anim = el.animate([
      { transform: `translate(${x0 - 9}px, ${y0 - 9}px) scale(1)`, opacity: 1 },
      { transform: `translate(${(x0 + x1) / 2 + dx - 9}px, ${(y0 + y1) / 2 + dy - 40 - 9}px) scale(1.15)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1 - 9}px, ${y1 - 9}px) scale(.6)`, opacity: 0.9 },
    ], { duration: dur, delay: i * 40, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
    anim.onfinish = () => { el.remove(); if (i === n - 1) pop($('.coins')); };
  }
}
/* quick scale pop on any element */
export function pop(el: Element | null, scale = 1.18) {
  if (!el || REDUCED) return;
  (el as HTMLElement).animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.4 }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
}
/* bounce a tab icon to draw the eye (new find, new helper unlocked) */
export function bumpTab(name: string) {
  const el = document.querySelector<HTMLElement>(`.tab[data-tab="${name}"] .ti`); if (!el || REDUCED) return;
  el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-7px) scale(1.2)', offset: 0.35 }, { transform: 'translateY(0)' }], { duration: 480, easing: 'cubic-bezier(.3,1.6,.5,1)', iterations: 2 });
}
/* shake horizontally: "not enough coins" */
export function nope(el: Element | null) {
  if (!el || REDUCED) return;
  (el as HTMLElement).animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 280 });
}
