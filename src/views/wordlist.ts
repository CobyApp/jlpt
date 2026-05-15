import { loadExam, loadVocab, loadKanjiKo } from '../lib/data';
import { categoryKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { buildIndex, matchVocab } from '../lib/vocab-match';
import { isInWordbook, toggleWordbook } from '../state';
import { openStudyModal } from '../lib/study-modal';
import { navigate } from '../router';
import type { VocabEntry, Question } from '../types';

interface SectionDef { key: string; from: number; to: number; idx: number }

function groupQuestions(qs: Question[], keyOf: (q: Question) => string): SectionDef[] {
  const out: SectionDef[] = [];
  for (const q of qs) {
    const k = keyOf(q);
    const last = out[out.length - 1];
    if (last && last.key === k) last.to = q.n;
    else out.push({ key: k, from: q.n, to: q.n, idx: out.length });
  }
  return out;
}

const LISTENING_KO_LABEL: Record<string, string> = {
  'task-based-comprehension': '청해 — 과제 이해',
  'comprehension-of-key-points': '청해 — 포인트 이해',
  'comprehension-general-outline': '청해 — 개요 이해',
  'quick-response': '청해 — 즉시 응답',
  'listening-integrated-comprehension': '청해 — 통합 이해',
};

/** Strip ruby furigana + HTML tags so vocab-match sees plain Japanese. */
function stripListeningHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<rt>.*?<\/rt>/gs, '')
    .replace(/<\/?ruby>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
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
  initial: { sections?: string[]; from?: number; to?: number },
) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const [exam, vocab, kanjiKo] = await Promise.all([loadExam(examId), loadVocab(), loadKanjiKo()]);
  const idx = buildIndex(vocab);
  const isCategoryDrill = examId.startsWith('cat:');
  const keyOf = (q: Question): string => isCategoryDrill ? (q.src_label ?? '') : q.category;
  const sections = groupQuestions(exam.questions, keyOf);
  const validKeys = new Set(sections.map((s) => s.key));

  // Listening sections (per mondai). Each listening mondai gets a virtual section
  // keyed as `listen:<order>` so we can filter words by it just like reading sections.
  interface ListenSectionDef { key: string; type: string; label: string; mondai: number; qids: string[] }
  const listenSections: ListenSectionDef[] = [];
  if (exam.listening) {
    for (const sub of exam.listening.subsections) {
      const key = `listen:${sub.order}`;
      listenSections.push({
        key,
        type: sub.type,
        mondai: sub.order,
        label: LISTENING_KO_LABEL[sub.type] ?? `청해 問題${sub.order}`,
        qids: sub.questions.map((q) => q.id),
      });
      validKeys.add(key);
    }
  }

  const labelOf = (s: SectionDef): string => isCategoryDrill
    ? s.key
    : categoryKo(s.key);
  const numberOf = (s: SectionDef): string => isCategoryDrill
    ? `회차 ${s.idx + 1}`
    : `問題${s.idx + 1}`;

  // Per-question vocab matches — reading: keyed by q.n, listening: keyed by q.id (string)
  const perQ = new Map<number, Set<string>>();
  const perLQ = new Map<string, Set<string>>();
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

  // Listening: aggregate words from opts + script (per mondai, script is shared
  // across questions when from Whisper, so dedupe at the mondai level for freq).
  if (exam.listening) {
    for (const sub of exam.listening.subsections) {
      const seenScripts = new Set<string>();
      for (const q of sub.questions) {
        const set = new Set<string>();
        const texts: string[] = [...q.opts];
        const scriptPlain = stripListeningHtml(q.script_html);
        const scriptKey = scriptPlain.slice(0, 60);
        const newScript = !seenScripts.has(scriptKey);
        if (newScript) {
          seenScripts.add(scriptKey);
          if (scriptPlain) texts.push(scriptPlain);
        }
        for (const t of texts) {
          for (const seg of matchVocab(t, idx)) {
            if (!seg.entry) continue;
            const w = seg.entry.w;
            set.add(w);
            if (!entryByW.has(w)) entryByW.set(w, seg.entry);
          }
        }
        perLQ.set(q.id, set);
        for (const w of set) freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
  }

  // ── State ──
  let sortKey: SortKey = 'freq';
  // Multi-select set (empty = "전체")
  const activeSet = new Set<string>();
  if (initial.sections) {
    for (const s of initial.sections) {
      if (validKeys.has(s)) activeSet.add(s);
    }
  }
  let rangeFrom: number | undefined = initial.from;
  let rangeTo: number | undefined = initial.to;

  const inRange = (n: number) => (rangeFrom == null || n >= rangeFrom) && (rangeTo == null || n <= rangeTo);
  const isAll = () => activeSet.size === 0;

  const listenSectionByKey = new Map(listenSections.map((s) => [s.key, s]));

  // Static count for a single section (used in tab badges) — independent of activeSet
  const sectionCountSingle = (key: string): number => {
    const ws = new Set<string>();
    if (key.startsWith('listen:')) {
      const ls = listenSectionByKey.get(key);
      if (ls) {
        for (const qid of ls.qids) {
          for (const w of perLQ.get(qid) ?? []) ws.add(w);
        }
      }
      return ws.size;
    }
    for (const q of exam.questions) {
      if (!inRange(q.n)) continue;
      if (key !== 'all' && keyOf(q) !== key) continue;
      for (const w of perQ.get(q.n) ?? []) ws.add(w);
    }
    if (key === 'all') {
      // 'all' includes listening too
      for (const ls of listenSections) {
        for (const qid of ls.qids) {
          for (const w of perLQ.get(qid) ?? []) ws.add(w);
        }
      }
    }
    return ws.size;
  };

  const isListenActive = (key: string) => activeSet.has(key);

  const computeWords = () => {
    const wordSet = new Set<string>();
    // Reading sections
    for (const q of exam.questions) {
      if (!inRange(q.n)) continue;
      if (!isAll() && !activeSet.has(keyOf(q))) continue;
      const set = perQ.get(q.n);
      if (!set) continue;
      for (const w of set) wordSet.add(w);
    }
    // Listening sections (range filter doesn't apply — listening has separate numbering)
    for (const ls of listenSections) {
      if (!isAll() && !isListenActive(ls.key)) continue;
      for (const qid of ls.qids) {
        const set = perLQ.get(qid);
        if (!set) continue;
        for (const w of set) wordSet.add(w);
      }
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
      ...sections.map((s) => ({
        key: s.key,
        num: numberOf(s),
        label: labelOf(s),
      })),
      ...listenSections.map((ls) => ({
        key: ls.key,
        num: `問題${ls.mondai}`,
        label: ls.label,
      })),
    ];
    return items.map((it) => {
      const active = it.key === 'all' ? isAll() : activeSet.has(it.key);
      return `<button class="tab ${active ? 'is-active' : ''}" type="button" role="tab" data-section="${escapeHtml(it.key)}" aria-pressed="${active}">
        ${it.num ? `<span class="wl-tab-num">${escapeHtml(it.num)}</span>` : ''}
        <span class="wl-tab-label">${escapeHtml(it.label)}</span>
        <span class="wl-tab-count" data-key="${escapeHtml(it.key)}">${sectionCountSingle(it.key)}</span>
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

  const startLabel = (): string =>
    activeSet.size > 0 || rangeFrom != null || rangeTo != null
      ? '이 범위로 시작'
      : '시험 시작';

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
          <button id="wl-study" class="study-cta" type="button">
            <span class="study-cta-icon" aria-hidden="true">📚</span>
            <span class="study-cta-label">외우기</span>
          </button>
          <button id="wl-start" class="primary" type="button">${startLabel()}</button>
        </div>
      </header>

      <nav class="tab-bar wl-tabs" role="tablist" aria-label="영역 필터" id="wl-tabs">
        ${tabsInitialHTML()}
      </nav>

      <div class="wl-controls">
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
  sortSel.value = sortKey;

  // ── In-place updaters ──
  const refreshTabs = () => {
    tabsHost.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
      const key = btn.dataset.section || 'all';
      const active = key === 'all' ? isAll() : activeSet.has(key);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
      const cnt = btn.querySelector<HTMLElement>('.wl-tab-count');
      if (cnt) cnt.textContent = String(sectionCountSingle(key));
    });
  };

  const refreshResults = () => {
    const list = computeWords();
    countEl.textContent = `${list.length}개 단어`;
    resultsHost.innerHTML = resultsHTML(list);
    resultsHost.classList.remove('wl-fade-in');
    void resultsHost.offsetWidth;
    resultsHost.classList.add('wl-fade-in');
  };

  const refreshStartLabel = () => { startBtn.textContent = startLabel(); };

  const update = () => {
    refreshTabs();
    refreshResults();
    refreshStartLabel();
  };

  // ── Events ──
  tabsHost.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.tab') as HTMLButtonElement | null;
    if (!btn) return;
    const key = btn.dataset.section || 'all';
    if (key === 'all') {
      // Clear multi-set
      if (activeSet.size === 0) return;
      activeSet.clear();
    } else {
      if (activeSet.has(key)) activeSet.delete(key);
      else activeSet.add(key);
    }
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

  startBtn.addEventListener('click', () => {
    // Listening-only selection → jump straight to that mondai's listening view.
    const selectedListens = listenSections.filter((ls) => activeSet.has(ls.key));
    const selectedReadings = sections.filter((s) => activeSet.has(s.key));
    if (selectedListens.length > 0 && selectedReadings.length === 0) {
      // Pick the first selected mondai as entry point. The view has chips for the rest.
      const target = selectedListens[0];
      navigate({ name: 'listen', examId, m: target.mondai });
      return;
    }
    let from: number | undefined;
    let to: number | undefined;
    if (selectedReadings.length > 0) {
      from = Math.min(...selectedReadings.map((s) => s.from));
      to = Math.max(...selectedReadings.map((s) => s.to));
    }
    if (rangeFrom != null) from = rangeFrom;
    if (rangeTo != null) to = rangeTo;
    const startN = from ?? 1;
    navigate({ name: 'question', examId, n: startN, from, to });
  });

  // Study current filtered words
  root.querySelector<HTMLButtonElement>('#wl-study')!.addEventListener('click', () => {
    const list = computeWords();
    if (!list.length) return;
    const summary = isAll() ? '전체' : `${activeSet.size}개 영역`;
    openStudyModal({
      words: list,
      kanjiKo,
      title: `${exam.title} · ${summary} 외우기`,
      order: 'weakest',
      onClose: () => refreshResults(),
    });
  });

  update();
}
