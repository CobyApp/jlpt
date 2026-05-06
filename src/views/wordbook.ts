import { loadVocab, loadKanjiKo } from '../lib/data';
import { escapeHtml } from '../lib/html';
import { getWordbook, removeFromWordbook, clearWordbook, getSrs, type WordbookEntry } from '../state';
import { openStudyModal } from '../lib/study-modal';
import type { VocabEntry } from '../types';

type SortKey = 'recent' | 'oldest' | 'len' | 'reading';

const SORT_KEY = 'jlpt:wordbook-sort';

function loadSort(): SortKey {
  const v = localStorage.getItem(SORT_KEY);
  return (v === 'oldest' || v === 'len' || v === 'reading') ? v : 'recent';
}

function saveSort(s: SortKey) {
  localStorage.setItem(SORT_KEY, s);
}

const KANJI_RE = /[一-龯々ヶ]/;

function renderHanja(word: string, table: Record<string, [string, string]> | null): string {
  if (!table) return '';
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
  return `<ul class="vp-hanja wb-hanja">${rows.join('')}</ul>`;
}

function applySort(items: Array<WordbookEntry & VocabEntry>, sort: SortKey) {
  const arr = [...items];
  if (sort === 'recent') arr.sort((a, b) => b.ts - a.ts);
  else if (sort === 'oldest') arr.sort((a, b) => a.ts - b.ts);
  else if (sort === 'len') arr.sort((a, b) => b.w.length - a.w.length || b.ts - a.ts);
  else if (sort === 'reading') arr.sort((a, b) => (a.r || '').localeCompare(b.r || ''));
  return arr;
}

export async function renderWordbook(root: HTMLElement) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const [vocab, kanjiKo] = await Promise.all([loadVocab(), loadKanjiKo()]);
  const map = new Map(vocab.map((v) => [v.w, v]));

  // ── HTML helpers ──
  const masteryBadge = (w: string): string => {
    const s = getSrs(w);
    if (s.level < 0) return '';
    if (s.level >= 5) return `<span class="wb-mastery is-mastered" title="마스터">✓ 마스터</span>`;
    return `<span class="wb-mastery" title="학습 레벨">Lv.${s.level}</span>`;
  };

  const cardHTML = (e: WordbookEntry & VocabEntry) => `
    <article class="wb-card" data-w="${escapeHtml(e.w)}">
      <header class="wb-head">
        <span class="wb-w">${escapeHtml(e.w)}</span>
        <button class="wb-rm" data-w="${escapeHtml(e.w)}" type="button" title="단어장에서 제거" aria-label="단어장에서 제거">×</button>
      </header>
      <div class="wb-r">${escapeHtml(e.r || '—')}</div>
      <div class="wb-m">${escapeHtml(e.m_ko || e.m || '(의미 없음)')}</div>
      ${renderHanja(e.w, kanjiKo)}
      ${masteryBadge(e.w) ? `<div class="wb-foot">${masteryBadge(e.w)}</div>` : ''}
    </article>`;

  const bodyHTML = (count: number, listHTML: string) => count === 0
    ? `<div class="wb-empty">
        <h2>아직 저장한 단어가 없어요</h2>
        <p>문제 풀면서 본문에 표시된 단어를 클릭하고, 팝오버 우측 상단 ☆ 버튼으로 단어를 단어장에 담아보세요.</p>
        <a href="#/" class="primary wb-empty-cta">홈으로 돌아가기</a>
      </div>`
    : `<section class="wb-grid">${listHTML}</section>`;

  // ── One-time skeleton ──
  const initialList = (() => {
    const wb = getWordbook();
    const enriched = wb.map((e) => ({ ...e, ...(map.get(e.w) ?? { w: e.w, r: '', m: '', m_ko: '' }) }));
    return applySort(enriched, loadSort());
  })();

  const initialSort = loadSort();

  root.innerHTML = `
    <div class="app-shell">
      <a href="#/" class="back">홈으로</a>
      <header class="wb-bar">
        <div class="wb-bar-title">
          <span class="home-kicker">My Wordbook</span>
          <h1 class="home-title">단어장</h1>
          <p class="wb-bar-meta" id="wb-meta">${initialList.length}개 단어 저장됨</p>
        </div>
        <div class="wb-bar-actions">
          <select id="wb-sort" class="wb-sort" aria-label="정렬">
            <option value="recent" ${initialSort==='recent'?'selected':''}>최근 추가순</option>
            <option value="oldest" ${initialSort==='oldest'?'selected':''}>오래된순</option>
            <option value="len" ${initialSort==='len'?'selected':''}>긴 단어순</option>
            <option value="reading" ${initialSort==='reading'?'selected':''}>가나순</option>
          </select>
          <button id="wb-study" class="study-cta" type="button" ${initialList.length === 0 ? 'disabled' : ''}>
            <span class="study-cta-icon" aria-hidden="true">📚</span>
            <span class="study-cta-label">외우기 시작</span>
            <span class="study-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button id="wb-clear" class="wb-clear" type="button" ${initialList.length === 0 ? 'hidden' : ''}>전체 비우기</button>
        </div>
      </header>
      <div id="wb-body">${bodyHTML(initialList.length, initialList.map(cardHTML).join(''))}</div>
    </div>`;

  const metaEl = root.querySelector<HTMLElement>('#wb-meta')!;
  const bodyEl = root.querySelector<HTMLElement>('#wb-body')!;
  const clearBtn = root.querySelector<HTMLButtonElement>('#wb-clear')!;
  const sortSel = root.querySelector<HTMLSelectElement>('#wb-sort')!;
  const studyBtn = root.querySelector<HTMLButtonElement>('#wb-study')!;

  // ── In-place updaters ──
  const refresh = (animate = true) => {
    const wb = getWordbook();
    const enriched = wb.map((e) => ({ ...e, ...(map.get(e.w) ?? { w: e.w, r: '', m: '', m_ko: '' }) }));
    const sorted = applySort(enriched, loadSort());
    metaEl.textContent = `${sorted.length}개 단어 저장됨`;
    if (sorted.length === 0) clearBtn.setAttribute('hidden', '');
    else clearBtn.removeAttribute('hidden');
    studyBtn.disabled = sorted.length === 0;
    bodyEl.innerHTML = bodyHTML(sorted.length, sorted.map(cardHTML).join(''));
    if (animate) {
      bodyEl.classList.remove('wl-fade-in');
      void bodyEl.offsetWidth;
      bodyEl.classList.add('wl-fade-in');
    }
  };

  // ── Event delegation ──
  bodyEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.wb-rm') as HTMLButtonElement | null;
    if (!btn) return;
    const w = btn.dataset.w;
    if (!w) return;
    const card = btn.closest('.wb-card') as HTMLElement | null;
    removeFromWordbook(w);
    if (!card) { refresh(false); return; }
    // Animate the specific card out, then surgically remove it
    card.classList.add('wb-card-leaving');
    setTimeout(() => {
      card.remove();
      const remaining = bodyEl.querySelectorAll('.wb-card').length;
      metaEl.textContent = `${remaining}개 단어 저장됨`;
      if (remaining === 0) {
        clearBtn.setAttribute('hidden', '');
        // Swap grid for empty state without flashing the whole shell
        bodyEl.innerHTML = bodyHTML(0, '');
      }
    }, 180);
  });

  sortSel.addEventListener('change', () => {
    saveSort(sortSel.value as SortKey);
    refresh();
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('단어장의 모든 단어를 비울까요?')) {
      clearWordbook();
      refresh();
    }
  });

  studyBtn.addEventListener('click', () => {
    const wb = getWordbook();
    const enriched = wb
      .map((e) => map.get(e.w))
      .filter((x): x is VocabEntry => !!x);
    if (!enriched.length) return;
    openStudyModal({
      words: enriched,
      kanjiKo,
      title: '단어장 외우기',
      order: 'weakest',
      onClose: () => refresh(false),
    });
  });
}
