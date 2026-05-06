import { escapeHtml } from './html';
import { getSrs, recordSrs, type SrsAction } from '../state';
import type { VocabEntry } from '../types';

export type StudyOrder = 'random' | 'weakest' | 'unseen';

export interface StudyOptions {
  words: VocabEntry[];
  kanjiKo: Record<string, [string, string]>;
  title?: string;
  /** Default 'weakest'. */
  order?: StudyOrder;
  /** Called once when the modal closes (after any actions). */
  onClose?: () => void;
}

const KANJI_RE = /[一-龯々ヶ]/;

function renderHanja(word: string, table: Record<string, [string, string]>): string {
  const rows: string[] = [];
  for (const ch of word) {
    if (!KANJI_RE.test(ch)) continue;
    const v = table[ch];
    if (!v) continue;
    rows.push(
      `<li><span class="vp-h-c">${escapeHtml(ch)}</span>` +
      `<span class="vp-h-on">${escapeHtml(v[0] || '')}</span>` +
      `<span class="vp-h-kun">${escapeHtml(v[1] || '')}</span></li>`
    );
  }
  if (!rows.length) return '';
  return `<ul class="vp-hanja sm-hanja">${rows.join('')}</ul>`;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function orderWords(words: VocabEntry[], order: StudyOrder): VocabEntry[] {
  if (order === 'random') return shuffle(words);
  if (order === 'unseen') {
    const unseen: VocabEntry[] = [];
    const rest: VocabEntry[] = [];
    for (const w of words) {
      const s = getSrs(w.w);
      if (s.level < 0) unseen.push(w);
      else rest.push(w);
    }
    return [...shuffle(unseen), ...shuffle(rest)];
  }
  // 'weakest' — lowest level first, then by least-recent review
  const annotated = words.map((w) => ({ w, s: getSrs(w.w) }));
  annotated.sort((a, b) => {
    const la = a.s.level < 0 ? -1 : a.s.level;
    const lb = b.s.level < 0 ? -1 : b.s.level;
    if (la !== lb) return la - lb;
    return a.s.lastTs - b.s.lastTs;
  });
  return annotated.map((x) => x.w);
}

let activeModal: HTMLElement | null = null;

export function openStudyModal(opts: StudyOptions): void {
  if (activeModal) closeStudyModal();
  if (!opts.words.length) return;

  const order: StudyOrder = opts.order ?? 'weakest';
  let queue = orderWords(opts.words, order);
  let i = 0;
  let revealed = false;
  let stats = { easy: 0, again: 0, skip: 0 };

  const root = document.createElement('div');
  root.className = 'study-modal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '플래시카드 학습');
  document.body.appendChild(root);
  activeModal = root;
  document.body.classList.add('no-scroll');

  const handleKey = (e: KeyboardEvent) => {
    if (!activeModal) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeStudyModal();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!revealed) reveal();
      else next('easy');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next('skip');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      // No "previous" — treat as again (mark current then move on)
      if (!revealed) reveal();
      else next('again');
    } else if (e.key === '1') {
      e.preventDefault();
      reveal();
      next('again');
    } else if (e.key === '2') {
      e.preventDefault();
      reveal();
      next('skip');
    } else if (e.key === '3') {
      e.preventDefault();
      reveal();
      next('easy');
    }
  };
  document.addEventListener('keydown', handleKey);

  const close = () => {
    document.removeEventListener('keydown', handleKey);
    document.body.classList.remove('no-scroll');
    root.remove();
    if (activeModal === root) activeModal = null;
    try { opts.onClose?.(); } catch (e) { console.warn('[study] onClose threw', e); }
  };
  (root as any)._close = close;

  const cardHTML = (w: VocabEntry, isRevealed: boolean): string => {
    const meaning = w.m_ko || w.m || '(의미 없음)';
    const hanja = isRevealed ? renderHanja(w.w, opts.kanjiKo) : '';
    return `
      <article class="sm-card">
        <div class="sm-w">${escapeHtml(w.w)}</div>
        <div class="sm-r">${escapeHtml(w.r || '—')}</div>
        <div class="sm-meaning ${isRevealed ? 'is-shown' : ''}">
          ${isRevealed ? `
            <div class="sm-divider"></div>
            <div class="sm-m">${escapeHtml(meaning)}</div>
            ${hanja}
          ` : `<button class="sm-reveal" type="button">의미 보기 (Space)</button>`}
        </div>
      </article>`;
  };

  const summaryHTML = () => {
    const total = stats.easy + stats.again + stats.skip;
    const accuracy = total ? Math.round((stats.easy / total) * 100) : 0;
    return `
      <article class="sm-summary">
        <h2>학습 완료 🎉</h2>
        <p class="sm-summary-meta">${total}개 단어 복습</p>
        <div class="sm-summary-stats">
          <div><span>정답</span><strong>${stats.easy}</strong></div>
          <div><span>오답</span><strong>${stats.again}</strong></div>
          <div><span>건너뜀</span><strong>${stats.skip}</strong></div>
          <div><span>정답률</span><strong>${accuracy}%</strong></div>
        </div>
        <div class="sm-summary-actions">
          <button class="sm-restart primary" type="button">다시 학습</button>
          <button class="sm-close ghost" type="button">닫기</button>
        </div>
      </article>`;
  };

  const draw = () => {
    if (i >= queue.length) {
      root.querySelector('.sm-content')!.innerHTML = summaryHTML();
      root.querySelector<HTMLButtonElement>('.sm-close')?.addEventListener('click', close);
      root.querySelector<HTMLButtonElement>('.sm-restart')?.addEventListener('click', () => {
        i = 0;
        revealed = false;
        stats = { easy: 0, again: 0, skip: 0 };
        queue = orderWords(opts.words, order);
        rebuild();
      });
      // hide footer actions
      root.querySelector<HTMLElement>('.sm-footer')!.classList.add('is-hidden');
      // progress full
      const prog = root.querySelector<HTMLElement>('.sm-prog-fill')!;
      prog.style.width = '100%';
      root.querySelector<HTMLElement>('.sm-prog-text')!.textContent = `${queue.length} / ${queue.length}`;
      return;
    }
    const w = queue[i];
    const content = root.querySelector<HTMLElement>('.sm-content')!;
    content.innerHTML = cardHTML(w, revealed);
    content.querySelector<HTMLButtonElement>('.sm-reveal')?.addEventListener('click', reveal);
    // Progress
    const pct = Math.round((i / queue.length) * 100);
    root.querySelector<HTMLElement>('.sm-prog-fill')!.style.width = `${pct}%`;
    root.querySelector<HTMLElement>('.sm-prog-text')!.textContent = `${i + 1} / ${queue.length}`;
    // Footer
    root.querySelector<HTMLElement>('.sm-footer')!.classList.remove('is-hidden');
    root.querySelector<HTMLButtonElement>('#sm-again')!.disabled = false;
    root.querySelector<HTMLButtonElement>('#sm-skip')!.disabled = false;
    root.querySelector<HTMLButtonElement>('#sm-easy')!.disabled = false;
    // Show "current SRS level" hint
    const s = getSrs(w.w);
    const lvl = s.level < 0 ? '신규' : `Lv.${s.level}`;
    root.querySelector<HTMLElement>('.sm-level')!.textContent = lvl;
  };

  const reveal = () => {
    revealed = true;
    draw();
  };

  const next = (action: SrsAction) => {
    if (i >= queue.length) return;
    const w = queue[i];
    recordSrs(w.w, action);
    stats[action] = (stats[action] ?? 0) + 1;
    i += 1;
    revealed = false;
    draw();
  };

  const rebuild = () => {
    root.innerHTML = `
      <div class="sm-backdrop"></div>
      <div class="sm-frame">
        <header class="sm-header">
          <button class="sm-x" type="button" aria-label="닫기">×</button>
          <div class="sm-title">${escapeHtml(opts.title ?? '플래시카드 학습')}</div>
          <span class="sm-level"></span>
        </header>
        <div class="sm-prog">
          <div class="sm-prog-track"><i class="sm-prog-fill"></i></div>
          <span class="sm-prog-text">0 / 0</span>
        </div>
        <main class="sm-content"></main>
        <footer class="sm-footer">
          <button id="sm-again" class="sm-btn sm-again" type="button">
            <span class="sm-btn-label">모르겠어요</span>
            <kbd>1</kbd>
          </button>
          <button id="sm-skip" class="sm-btn sm-skip" type="button">
            <span class="sm-btn-label">건너뛰기</span>
            <kbd>2</kbd>
          </button>
          <button id="sm-easy" class="sm-btn sm-easy" type="button">
            <span class="sm-btn-label">알아요</span>
            <kbd>3</kbd>
          </button>
        </footer>
        <p class="sm-help"><kbd>Space</kbd> 의미 보기 · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> 응답 · <kbd>Esc</kbd> 닫기</p>
      </div>`;

    root.querySelector('.sm-backdrop')!.addEventListener('click', close);
    root.querySelector('.sm-x')!.addEventListener('click', close);
    root.querySelector('#sm-again')!.addEventListener('click', () => { reveal(); next('again'); });
    root.querySelector('#sm-skip')!.addEventListener('click', () => { reveal(); next('skip'); });
    root.querySelector('#sm-easy')!.addEventListener('click', () => { reveal(); next('easy'); });

    draw();
  };

  rebuild();
  // Trigger fade-in
  requestAnimationFrame(() => root.classList.add('is-open'));
}

export function closeStudyModal() {
  if (!activeModal) return;
  (activeModal as any)._close?.();
  activeModal = null;
}
