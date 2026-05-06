import { loadExam } from '../lib/data';
import { sectionLabelKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import type { Question } from '../types';

interface Section { category: string; from: number; to: number; idx: number }

function groupBySection(qs: Question[]): Section[] {
  const out: Section[] = [];
  for (const q of qs) {
    const last = out[out.length - 1];
    if (last && last.category === q.category) last.to = q.n;
    else out.push({ category: q.category, from: q.n, to: q.n, idx: out.length });
  }
  return out;
}

export async function renderExam(root: HTMLElement, examId: string) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const exam = await loadExam(examId);
  const sections = groupBySection(exam.questions);
  const max = exam.questions.length;

  // ── State ──
  const selected = new Set<string>(); // empty = none

  const orderedSelected = (): Section[] =>
    sections.filter((s) => selected.has(s.category));

  const summary = () => {
    const list = orderedSelected();
    if (list.length === 0) {
      return { label: '영역을 선택하세요', range: `총 ${max}문제`, count: 0, hasSelection: false };
    }
    const totalQs = list.reduce((sum, s) => sum + (s.to - s.from + 1), 0);
    if (list.length === 1) {
      const s = list[0];
      const i = s.idx + 1;
      const label = `問題${i} ${sectionLabelKo(i, s.category).replace(/^問題\d+\s*/, '')}`;
      return { label, range: `${s.from}–${s.to} · ${totalQs}문제`, count: totalQs, hasSelection: true };
    }
    const labels = list.map((s) => `問題${s.idx + 1}`).join(', ');
    return {
      label: `${list.length}개 영역 선택`,
      range: `${labels} · ${totalQs}문제`,
      count: totalQs,
      hasSelection: true,
    };
  };

  const sectionHTML = sections.map((s) => `
    <li class="sec" data-category="${escapeHtml(s.category)}" tabindex="0" role="button" aria-pressed="false">
      <span class="sec-number">問題${s.idx + 1}</span>
      <span class="sec-label">${sectionLabelKo(s.idx + 1, s.category).replace(/^問題\d+\s*/, '')}</span>
      <span class="sec-meta">
        <span>${s.from}–${s.to}</span>
        <span>${s.to - s.from + 1}문제</span>
      </span>
    </li>`).join('');

  // ── One-time skeleton render ──
  root.innerHTML = `
    <div class="app-shell">
      <header class="hero exam-hero">
        <a href="#/" class="back">회차 목록으로</a>
        <p class="hero-kicker">Exam Overview</p>
        <h1>${escapeHtml(exam.title)}</h1>
        <p class="hero-copy">${exam.questions.length}문제 · ${Object.keys(exam.passages).length}지문 · 풀고 싶은 영역을 선택하세요. (복수 선택 가능)</p>
      </header>

      <main class="exam-main panel">
        <section>
          <div class="section-heading">
            <p class="eyebrow">Section</p>
            <h2>섹션 선택</h2>
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
      const isSelected = selected.has(li.dataset.category!);
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
    const cat = li.dataset.category!;
    if (selected.has(cat)) selected.delete(cat);
    else selected.add(cat);
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
    for (const s of sections) selected.add(s.category);
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
    const sections = list.map((s) => s.category);
    navigate({ name: 'wordlist', examId, sections });
  });

  // First paint
  update();
}
