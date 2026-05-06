import { loadExam } from '../lib/data';
import { sectionLabelKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import type { Question } from '../types';

interface Section { key: string; from: number; to: number; idx: number }

function groupQuestions(qs: Question[], keyOf: (q: Question) => string): Section[] {
  const out: Section[] = [];
  for (const q of qs) {
    const k = keyOf(q);
    const last = out[out.length - 1];
    if (last && last.key === k) last.to = q.n;
    else out.push({ key: k, from: q.n, to: q.n, idx: out.length });
  }
  return out;
}

export async function renderExam(root: HTMLElement, examId: string) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const exam = await loadExam(examId);
  const isCategoryDrill = examId.startsWith('cat:');
  // Regular exam: group by category (= section). Cat drill: group by source exam (= 회차).
  const keyOf = (q: Question): string => isCategoryDrill
    ? (q.src_label ?? '')
    : q.category;
  const sections = groupQuestions(exam.questions, keyOf);
  const max = exam.questions.length;
  const groupHeading = isCategoryDrill ? '회차 선택' : '섹션 선택';
  const labelOf = (s: Section): string => isCategoryDrill
    ? s.key
    : sectionLabelKo(s.idx + 1, s.key).replace(/^問題\d+\s*/, '');
  const numberOf = (s: Section): string => isCategoryDrill
    ? `회차 ${s.idx + 1}`
    : `問題${s.idx + 1}`;

  // ── State ──
  const selected = new Set<string>(); // empty = none

  const orderedSelected = (): Section[] =>
    sections.filter((s) => selected.has(s.key));

  const summary = () => {
    const list = orderedSelected();
    const groupNoun = isCategoryDrill ? '회차' : '영역';
    if (list.length === 0) {
      return { label: `${groupNoun}을 선택하세요`, range: `총 ${max}문제`, count: 0, hasSelection: false };
    }
    const totalQs = list.reduce((sum, s) => sum + (s.to - s.from + 1), 0);
    if (list.length === 1) {
      const s = list[0];
      const label = isCategoryDrill ? s.key : `問題${s.idx + 1} ${labelOf(s)}`;
      return { label, range: `${s.from}–${s.to} · ${totalQs}문제`, count: totalQs, hasSelection: true };
    }
    const tags = list.map((s) => isCategoryDrill ? s.key : `問題${s.idx + 1}`).join(', ');
    return {
      label: `${list.length}개 ${groupNoun} 선택`,
      range: `${tags} · ${totalQs}문제`,
      count: totalQs,
      hasSelection: true,
    };
  };

  const sectionHTML = sections.map((s) => `
    <li class="sec" data-key="${escapeHtml(s.key)}" tabindex="0" role="button" aria-pressed="false">
      <span class="sec-number">${escapeHtml(numberOf(s))}</span>
      <span class="sec-label">${escapeHtml(labelOf(s))}</span>
      <span class="sec-meta">
        <span>${s.from}–${s.to}</span>
        <span>${s.to - s.from + 1}문제</span>
      </span>
    </li>`).join('');

  // ── One-time skeleton render ──
  root.innerHTML = `
    <div class="app-shell">
      <header class="hero exam-hero">
        <a href="#/" class="back">${isCategoryDrill ? '홈으로' : '회차 목록으로'}</a>
        <p class="hero-kicker">${isCategoryDrill ? 'Category Drill' : 'Exam Overview'}</p>
        <h1>${escapeHtml(exam.title)}</h1>
        <p class="hero-copy">${exam.questions.length}문제 · ${Object.keys(exam.passages).length}지문 · 풀고 싶은 ${isCategoryDrill ? '회차' : '영역'}를 선택하세요. (복수 선택 가능)</p>
      </header>

      <main class="exam-main panel">
        <section>
          <div class="section-heading">
            <p class="eyebrow">${isCategoryDrill ? 'Mock Tests' : 'Section'}</p>
            <h2>${groupHeading}</h2>
            <div class="section-heading-actions">
              <button id="reset-all" class="ghost-link" type="button" disabled>선택 해제</button>
              <button id="select-all" class="ghost-link" type="button">전체 선택</button>
            </div>
          </div>
          <ul class="sections section-grid" id="sec-list">${sectionHTML}</ul>
        </section>
      </main>

      <aside class="exam-action-bar" role="region" aria-label="시작 액션">
        <div class="action-summary">
          <span class="action-summary-eyebrow">선택</span>
          <strong class="action-summary-label" id="sum-label">영역을 선택하세요</strong>
          <span class="action-summary-range" id="sum-range">총 ${max}문제</span>
        </div>
        <div class="action-buttons">
          <button id="go-words" type="button" class="ghost" disabled>📖 단어 미리보기</button>
          <button id="go-start" type="button" class="primary" disabled>시작하기 →</button>
        </div>
      </aside>
    </div>`;

  // ── Cached refs ──
  const secList = root.querySelector<HTMLElement>('#sec-list')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#reset-all')!;
  const selectAllBtn = root.querySelector<HTMLButtonElement>('#select-all')!;
  const sumLabel = root.querySelector<HTMLElement>('#sum-label')!;
  const sumRange = root.querySelector<HTMLElement>('#sum-range')!;
  const startBtn = root.querySelector<HTMLButtonElement>('#go-start')!;
  const wordsBtn = root.querySelector<HTMLButtonElement>('#go-words')!;

  // ── In-place updaters ──
  const refreshCards = () => {
    secList.querySelectorAll<HTMLLIElement>('.sec').forEach((li) => {
      const isSelected = selected.has(li.dataset.key!);
      li.classList.toggle('is-selected', isSelected);
      li.setAttribute('aria-pressed', String(isSelected));
    });
  };

  const refreshSummary = () => {
    const s = summary();
    sumLabel.textContent = s.label;
    sumRange.textContent = s.range;
    resetBtn.disabled = !s.hasSelection;
    selectAllBtn.disabled = selected.size === sections.length;
    startBtn.disabled = !s.hasSelection;
    wordsBtn.disabled = !s.hasSelection;
  };

  const update = () => {
    refreshCards();
    refreshSummary();
  };

  // ── Event wiring ──
  const togglePick = (li: HTMLLIElement) => {
    const k = li.dataset.key!;
    if (selected.has(k)) selected.delete(k);
    else selected.add(k);
    update();
  };

  secList.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('.sec') as HTMLLIElement | null;
    if (!li) return;
    togglePick(li);
  });
  secList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = (e.target as HTMLElement).closest('.sec') as HTMLLIElement | null;
    if (!li) return;
    e.preventDefault();
    togglePick(li);
  });

  resetBtn.addEventListener('click', () => {
    selected.clear();
    update();
  });

  selectAllBtn.addEventListener('click', () => {
    for (const s of sections) selected.add(s.key);
    update();
  });

  startBtn.addEventListener('click', () => {
    const list = orderedSelected();
    if (list.length === 0) return;
    const from = Math.min(...list.map((s) => s.from));
    const to = Math.max(...list.map((s) => s.to));
    navigate({ name: 'question', examId, n: from, from, to });
  });

  wordsBtn.addEventListener('click', () => {
    const list = orderedSelected();
    if (list.length === 0) return;
    // For cat drill, the "section" key is src_label (a 회차 label).
    // For regular exam, it's a category key.
    const sections = list.map((s) => s.key);
    navigate({ name: 'wordlist', examId, sections });
  });

  // First paint
  update();
}
