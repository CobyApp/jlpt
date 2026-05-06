import type { VocabEntry } from '../types';
import { escapeHtml } from './html';
import { loadKanjiKo } from './data';

let current: HTMLDivElement | null = null;
let kanjiKoCache: Record<string, [string, string]> | null = null;

// Kick off load eagerly (idempotent — cached on data.ts side)
loadKanjiKo().then((m) => { kanjiKoCache = m; }).catch(() => {});

const KANJI_RE = /[一-龯々ヶ]/;

function renderHanja(word: string, table: Record<string, [string, string]> | null): string {
  if (!table) return '';
  const rows: string[] = [];
  for (const ch of word) {
    if (!KANJI_RE.test(ch)) continue;
    const v = table[ch];
    if (!v) continue;
    const [on, kun] = v;
    rows.push(
      `<li><span class="vp-h-c">${escapeHtml(ch)}</span>` +
      `<span class="vp-h-on">${escapeHtml(on || '')}</span>` +
      `<span class="vp-h-kun">${escapeHtml(kun || '')}</span></li>`
    );
  }
  if (!rows.length) return '';
  return `<ul class="vp-hanja">${rows.join('')}</ul>`;
}

export function showPopover(near: HTMLElement, entry: VocabEntry) {
  hidePopover();
  const pop = document.createElement('div');
  pop.className = 'vocab-popover';
  pop.innerHTML = `
    <div class="vp-w">${escapeHtml(entry.w)}</div>
    <div class="vp-r">${escapeHtml(entry.r)}</div>
    <div class="vp-m">${escapeHtml(entry.m_ko ?? entry.m)}</div>
    ${renderHanja(entry.w, kanjiKoCache)}
  `;
  document.body.appendChild(pop);
  const r = near.getBoundingClientRect();
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  pop.style.left = `${Math.min(r.left + window.scrollX, window.innerWidth - 280)}px`;
  current = pop;

  // If kanji table wasn't loaded yet at click time, fill it in once it arrives
  if (!kanjiKoCache) {
    loadKanjiKo().then((m) => {
      kanjiKoCache = m;
      if (pop.isConnected) {
        const html = renderHanja(entry.w, m);
        if (html) {
          const existing = pop.querySelector('.vp-hanja');
          if (existing) existing.outerHTML = html;
          else pop.insertAdjacentHTML('beforeend', html);
        }
      }
    }).catch(() => {});
  }

  const offClick = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node) && e.target !== near) hidePopover();
  };
  setTimeout(() => document.addEventListener('click', offClick), 0);
  (pop as any)._off = () => document.removeEventListener('click', offClick);
}

export function hidePopover() {
  if (!current) return;
  (current as any)._off?.();
  current.remove();
  current = null;
}
