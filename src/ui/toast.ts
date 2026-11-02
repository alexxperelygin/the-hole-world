/* Toasts, layer banner and the onboarding hint: small DOM overlays on top of the scene. */
import { CFG } from '../config';
import { S } from '../state';
import { t } from '../i18n';
import { em } from './emoji';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export function toast(e: string, title: string, body: string, color?: string) {
  const box = $('#toasts'); const el = document.createElement('div'); el.className = 'toast'; el.style.setProperty('--tc', color || '#ffc21a');
  el.innerHTML = `<span class="te">${em(e)}</span><div class="tx"><b></b><span class="tb"></span></div>`;
  el.querySelector('b')!.textContent = title; el.querySelector('.tb')!.textContent = body;
  box.prepend(el); while (box.children.length > 3) box.lastChild!.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
}

let bannerTimer = 0;
export function banner(title: string, label = t('new_layer')) {
  const b = $('#banner'); b.innerHTML = `<small></small><strong></strong>`; b.querySelector('small')!.textContent = label; b.querySelector('strong')!.textContent = title;
  b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => { b.hidden = true; }, 1750);
}

export function updateHint() {
  const h = $('#hint');
  if (S.onboard === 0) { h.hidden = false; $('#hintHand').innerHTML = em('👆'); $('#hintText').textContent = t('tap'); }
  else if (S.onboard === 1 && S.tool === 0 && S.coins >= CFG.tools[1].cost) { h.hidden = false; $('#hintHand').innerHTML = em('👇'); $('#hintText').textContent = t('first_buy'); }
  else h.hidden = true;
}
