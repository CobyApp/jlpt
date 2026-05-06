import { loadVocab, loadKanjiKo } from '../lib/data';
import { escapeHtml } from '../lib/html';
import { getWordbook, removeFromWordbook, clearWordbook, type WordbookEntry } from '../state';
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
  const sort = loadSort();

  const draw = () => {
    const wb = getWordbook();
    const enriched = wb.map((e) => ({ ...e, ...(map.get(e.w) ?? { w: e.w, r: '', m: '', m_ko: '' }) }));
    const sorted = applySort(enriched, loadSort());

    const cards = sorted.map((e) => `
      <article class="wb-card" data-w="${escapeHtml(e.w)}">
        <header class="wb-head">
          <span class="wb-w">${escapeHtml(e.w)}</span>
          <button class="wb-rm" data-w="${escapeHtml(e.w)}" title="단어장에서 제거" aria-label="단어장에서 제거">×</button>
        </header>
        <div class="wb-r">${escapeHtml(e.r || '—')}</div>
        <div class="wb-m">${escapeHtml(e.m_ko || e.m || '(의미 없음)')}</div>
        ${renderHanja(e.w, kanjiKo)}
      </article>`).join('');

    const sortKey = loadSort();
    root.innerHTML = `
      <div class="app-shell">
        <a href="#/" class="back">홈으로</a>
        <header class="wb-bar">
          <div class="wb-bar-title">
            <span class="home-kicker">My Wordbook</span>
            <h1 class="home-title">단어장</h1>
            <p class="wb-bar-meta">${wb.length}개 단어 저장됨</p>
          </div>
          <div class="wb-bar-actions">
            <select id="wb-sort" class="wb-sort" aria-label="정렬">
              <option value="recent" ${sortKey==='recent'?'selected':''}>최근 추가순</option>
              <option value="oldest" ${sortKey==='oldest'?'selected':''}>오래된순</option>
              <option value="len" ${sortKey==='len'?'selected':''}>긴 단어순</option>
              <option value="reading" ${sortKey==='reading'?'selected':''}>가나순</option>
            </select>
            ${wb.length ? `<button id="wb-clear" class="wb-clear" type="button">전체 비우기</button>` : ''}
          </div>
        </header>
        ${wb.length === 0
          ? `<div class="wb-empty">
              <h2>아직 저장한 단어가 없어요</h2>
              <p>문제 풀면서 본문에 표시된 단어를 클릭하고, 팝오버 우측 상단 ☆ 버튼으로 단어를 단어장에 담아보세요.</p>
              <a href="#/" class="primary wb-empty-cta">홈으로 돌아가기</a>
            </div>`
          : `<section class="wb-grid">${cards}</section>`
        }
      </div>`;

    root.querySelectorAll<HTMLButtonElement>('.wb-rm').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = btn.dataset.w;
        if (!w) return;
        removeFromWordbook(w);
        draw();
      });
    });

    const sel = root.querySelector<HTMLSelectElement>('#wb-sort');
    if (sel) {
      sel.addEventListener('change', () => {
        saveSort(sel.value as SortKey);
        draw();
      });
    }

    const clearBtn = root.querySelector<HTMLButtonElement>('#wb-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('단어장의 모든 단어를 비울까요?')) {
          clearWordbook();
          draw();
        }
      });
    }
  };

  draw();
  void sort; // mark used for the closure
}
