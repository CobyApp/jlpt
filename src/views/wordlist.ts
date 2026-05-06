import { loadExam, loadVocab, loadKanjiKo } from '../lib/data';
import { categoryKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { buildIndex, matchVocab } from '../lib/vocab-match';
import { isInWordbook, toggleWordbook } from '../state';
import { navigate } from '../router';
import type { VocabEntry, Question } from '../types';

interface SectionDef { category: string; from: number; to: number; label: string }

function groupSections(qs: Question[]): SectionDef[] {
  const out: SectionDef[] = [];
  for (const q of qs) {
    const last = out[out.length - 1];
    if (last && last.category === q.category) last.to = q.n;
    else out.push({ category: q.category, from: q.n, to: q.n, label: '' });
  }
  return out.map((s, i) => ({ ...s, label: `問題${i + 1} ${categoryKo(s.category)}` }));
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
  return `<ul class="vp-hanja wb-hanja">${rows.join('')}</ul>`;
}

type SortKey = 'freq' | 'len' | 'reading';

export async function renderWordlist(
  root: HTMLElement,
  examId: string,
  initial: { section?: string; from?: number; to?: number },
) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const [exam, vocab, kanjiKo] = await Promise.all([loadExam(examId), loadVocab(), loadKanjiKo()]);
  const idx = buildIndex(vocab);
  const sections = groupSections(exam.questions);
  const max = exam.questions.length;

  // Per-question vocab matches (computed once)
  const perQ = new Map<number, Set<string>>();
  const entryByW = new Map<string, VocabEntry>();
  const freq = new Map<string, number>();

  for (const q of exam.questions) {
    const set = new Set<string>();
    const texts: string[] = [];
    if (q.passage && exam.passages[q.passage]) texts.push(exam.passages[q.passage].ja);
    if (q.stem) texts.push(q.stem);
    for (const o of q.opts) texts.push(o);
    for (const t of texts) {
      for (const seg of matchVocab(t, idx)) {
        if (!seg.entry) continue;
        const w = seg.entry.w;
        set.add(w);
        if (!entryByW.has(w)) entryByW.set(w, seg.entry);
      }
    }
    perQ.set(q.n, set);
    for (const w of set) freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // ── State ──
  let sortKey: SortKey = 'freq';
  let activeSection: string = initial.section ?? 'all';
  let rangeFrom: number | undefined = initial.from;
  let rangeTo: number | undefined = initial.to;

  const inRange = (n: number) => (rangeFrom == null || n >= rangeFrom) && (rangeTo == null || n <= rangeTo);

  const sectionCount = (key: string): number => {
    const ws = new Set<string>();
    for (const q of exam.questions) {
      if (!inRange(q.n)) continue;
      if (key !== 'all' && q.category !== key) continue;
      for (const w of perQ.get(q.n) ?? []) ws.add(w);
    }
    return ws.size;
  };

  const computeWords = () => {
    const wordSet = new Set<string>();
    for (const q of exam.questions) {
      if (!inRange(q.n)) continue;
      if (activeSection !== 'all' && q.category !== activeSection) continue;
      const set = perQ.get(q.n);
      if (!set) continue;
      for (const w of set) wordSet.add(w);
    }
    const list = Array.from(wordSet).map((w) => entryByW.get(w)!).filter(Boolean);
    if (sortKey === 'freq') list.sort((a, b) => (freq.get(b.w)! - freq.get(a.w)!) || a.w.localeCompare(b.w));
    else if (sortKey === 'len') list.sort((a, b) => b.w.length - a.w.length || a.w.localeCompare(b.w));
    else if (sortKey === 'reading') list.sort((a, b) => (a.r || '').localeCompare(b.r || ''));
    return list;
  };

  // ── HTML helpers ──
  const tabsInitialHTML = (): string => {
    const items: { key: string; num: string; label: string }[] = [
      { key: 'all', num: '', label: '전체' },
      ...sections.map((s, i) => ({
        key: s.category,
        num: `問題${i + 1}`,
        label: categoryKo(s.category),
      })),
    ];
    return items.map((it) => {
      const active = activeSection === it.key;
      return `<button class="tab ${active ? 'is-active' : ''}" type="button" role="tab" data-section="${escapeHtml(it.key)}" aria-selected="${active}">
        ${it.num ? `<span class="wl-tab-num">${escapeHtml(it.num)}</span>` : ''}
        <span class="wl-tab-label">${escapeHtml(it.label)}</span>
        <span class="wl-tab-count" data-key="${escapeHtml(it.key)}">${sectionCount(it.key)}</span>
      </button>`;
    }).join('');
  };

  const resultsHTML = (list: VocabEntry[]): string => {
    if (list.length === 0) {
      return `<div class="wb-empty"><h2>해당 범위에 매칭된 단어가 없어요</h2><p>다른 영역이나 범위를 선택해 보세요.</p></div>`;
    }
    return `<section class="wb-grid">${list.map((e) => {
      const f = freq.get(e.w) ?? 0;
      const saved = isInWordbook(e.w);
      return `
        <article class="wb-card wl-card" data-w="${escapeHtml(e.w)}">
          <header class="wb-head">
            <span class="wb-w">${escapeHtml(e.w)}</span>
            <button class="wl-star ${saved ? 'is-saved' : ''}" data-w="${escapeHtml(e.w)}" type="button" title="${saved ? '단어장에서 제거' : '단어장에 추가'}" aria-pressed="${saved}">${saved ? '★' : '☆'}</button>
          </header>
          <div class="wb-r">${escapeHtml(e.r || '—')}</div>
          <div class="wb-m">${escapeHtml(e.m_ko || e.m || '(의미 없음)')}</div>
          ${renderHanja(e.w, kanjiKo)}
          <footer class="wl-card-foot"><span class="wl-card-freq">${f}개 문제 등장</span></footer>
        </article>`;
    }).join('')}</section>`;
  };

  const startLabel = (): string => {
    const filtered = activeSection !== 'all' || rangeFrom != null || rangeTo != null;
    return filtered ? '이 범위로 시작' : '시험 시작';
  };

  // ── One-time skeleton render ──
  root.innerHTML = `
    <div class="app-shell">
      <a href="#/exam/${examId}" class="back">시험 페이지로</a>
      <header class="wl-bar">
        <div class="wl-bar-title">
          <span class="home-kicker">Vocab Preview</span>
          <h1 class="home-title">단어 미리 학습</h1>
          <p class="wl-bar-meta">${escapeHtml(exam.title)}</p>
        </div>
        <div class="wl-bar-actions">
          <button id="wl-start" class="primary" type="button">${startLabel()}</button>
        </div>
      </header>

      <nav class="tab-bar wl-tabs" role="tablist" aria-label="영역 필터" id="wl-tabs">
        ${tabsInitialHTML()}
      </nav>

      <div class="wl-controls">
        <div class="range-pick wl-range">
          <label>From <input type="number" id="wl-from" min="1" max="${max}" value="${rangeFrom ?? 1}" /></label>
          <label>To <input type="number" id="wl-to" min="1" max="${max}" value="${rangeTo ?? max}" /></label>
          <button id="wl-apply" type="button">범위 적용</button>
          <button id="wl-reset" type="button" class="wl-reset" ${(rangeFrom == null && rangeTo == null) ? 'hidden' : ''}>초기화</button>
        </div>
        <div class="wl-sort-wrap">
          <select id="wl-sort" class="wb-sort" aria-label="정렬">
            <option value="freq">출현 빈도순</option>
            <option value="len">긴 단어순</option>
            <option value="reading">가나순</option>
          </select>
          <span class="wl-count" id="wl-count">0개 단어</span>
        </div>
      </div>

      <div class="wl-results" id="wl-results"></div>
    </div>`;

  const tabsHost = root.querySelector<HTMLElement>('#wl-tabs')!;
  const resultsHost = root.querySelector<HTMLElement>('#wl-results')!;
  const countEl = root.querySelector<HTMLElement>('#wl-count')!;
  const startBtn = root.querySelector<HTMLButtonElement>('#wl-start')!;
  const sortSel = root.querySelector<HTMLSelectElement>('#wl-sort')!;
  const fromEl = root.querySelector<HTMLInputElement>('#wl-from')!;
  const toEl = root.querySelector<HTMLInputElement>('#wl-to')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#wl-reset')!;
  sortSel.value = sortKey;

  // ── In-place updaters ──
  const refreshTabs = () => {
    tabsHost.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
      const key = btn.dataset.section || 'all';
      const active = key === activeSection;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
      const cnt = btn.querySelector<HTMLElement>('.wl-tab-count');
      if (cnt) cnt.textContent = String(sectionCount(key));
    });
  };

  const refreshResults = () => {
    const list = computeWords();
    countEl.textContent = `${list.length}개 단어`;
    resultsHost.innerHTML = resultsHTML(list);
    // Subtle fade on content change
    resultsHost.classList.remove('wl-fade-in');
    void resultsHost.offsetWidth;
    resultsHost.classList.add('wl-fade-in');
  };

  const refreshStartLabel = () => { startBtn.textContent = startLabel(); };

  const refreshResetVisibility = () => {
    if (rangeFrom == null && rangeTo == null) resetBtn.setAttribute('hidden', '');
    else resetBtn.removeAttribute('hidden');
  };

  const update = () => {
    refreshTabs();
    refreshResults();
    refreshStartLabel();
    refreshResetVisibility();
  };

  // ── Event delegation (no re-render on tab click) ──
  tabsHost.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.tab') as HTMLButtonElement | null;
    if (!btn) return;
    const next = btn.dataset.section || 'all';
    if (next === activeSection) return;
    activeSection = next;
    update();
  });

  resultsHost.addEventListener('click', (e) => {
    const star = (e.target as HTMLElement).closest('.wl-star') as HTMLButtonElement | null;
    if (!star) return;
    e.stopPropagation();
    const w = star.dataset.w!;
    const nowSaved = toggleWordbook(w);
    star.classList.toggle('is-saved', nowSaved);
    star.textContent = nowSaved ? '★' : '☆';
    star.title = nowSaved ? '단어장에서 제거' : '단어장에 추가';
    star.setAttribute('aria-pressed', String(nowSaved));
  });

  sortSel.addEventListener('change', () => {
    sortKey = sortSel.value as SortKey;
    refreshResults();
  });

  root.querySelector<HTMLButtonElement>('#wl-apply')!.addEventListener('click', () => {
    const f = Number(fromEl.value);
    const t = Number(toEl.value);
    if (!Number.isFinite(f) || !Number.isFinite(t) || f < 1 || t > max || f > t) return;
    rangeFrom = f === 1 ? undefined : f;
    rangeTo = t === max ? undefined : t;
    if (rangeFrom == null && rangeTo == null) {
      // both at extremes — counted as no range filter
    } else {
      // Always carry both ends
      rangeFrom = f;
      rangeTo = t;
    }
    update();
  });

  resetBtn.addEventListener('click', () => {
    rangeFrom = undefined;
    rangeTo = undefined;
    fromEl.value = '1';
    toEl.value = String(max);
    update();
  });

  startBtn.addEventListener('click', () => {
    let from: number | undefined;
    let to: number | undefined;
    if (activeSection !== 'all') {
      const s = sections.find((ss) => ss.category === activeSection);
      if (s) { from = s.from; to = s.to; }
    }
    if (rangeFrom != null) from = rangeFrom;
    if (rangeTo != null) to = rangeTo;
    const startN = from ?? 1;
    navigate({ name: 'question', examId, n: startN, from, to });
  });

  // First paint
  update();
}
