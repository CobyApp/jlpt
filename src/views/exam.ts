import { loadExam } from '../lib/data';
import { sectionLabelKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import type { Question } from '../types';

interface Section { category: string; from: number; to: number }

function groupBySection(qs: Question[]): Section[] {
  const out: Section[] = [];
  for (const q of qs) {
    const last = out[out.length - 1];
    if (last && last.category === q.category) last.to = q.n;
    else out.push({ category: q.category, from: q.n, to: q.n });
  }
  return out;
}

export async function renderExam(root: HTMLElement, examId: string) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const exam = await loadExam(examId);
  const sections = groupBySection(exam.questions);
  const max = exam.questions.length;
  const sectionByCat = new Map(sections.map((s) => [s.category, s]));

  // ── State ──
  let selectedSection: string | null = null;
  let customFrom: number = 1;
  let customTo: number = max;

  const summary = () => {
    if (selectedSection) {
      const s = sectionByCat.get(selectedSection)!;
      const i = sections.indexOf(s) + 1;
      return {
        label: `問題${i} ${sectionLabelKo(i, s.category).replace(/^問題\d+\s*/, '')}`,
        from: s.from,
        to: s.to,
      };
    }
    if (customFrom !== 1 || customTo !== max) {
      return { label: '직접 지정 범위', from: customFrom, to: customTo };
    }
    return { label: '전체', from: 1, to: max };
  };

  const sectionHTML = sections.map((s, i) => `
    <li class="sec" data-category="${escapeHtml(s.category)}" tabindex="0" role="button" aria-pressed="false">
      <span class="sec-number">問題${i + 1}</span>
      <span class="sec-label">${sectionLabelKo(i + 1, s.category).replace(/^問題\d+\s*/, '')}</span>
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
        <p class="hero-copy">${exam.questions.length}문제 · ${Object.keys(exam.passages).length}지문 · 풀고 싶은 영역이나 범위를 골라 시작하세요.</p>
      </header>

      <main class="exam-main panel">
        <section>
          <div class="section-heading">
            <p class="eyebrow">Section</p>
            <h2>섹션 선택</h2>
            <button id="reset-all" class="ghost-link" type="button" disabled>전체로 초기화</button>
          </div>
          <ul class="sections section-grid" id="sec-list">${sectionHTML}</ul>
        </section>

        <section class="range-panel">
          <div class="section-heading">
            <p class="eyebrow">Custom Range</p>
            <h2>직접 범위 지정</h2>
          </div>
          <div class="range-pick">
            <label>From <input type="number" id="from" min="1" max="${max}" value="${customFrom}" /></label>
            <label>To <input type="number" id="to" min="1" max="${max}" value="${customTo}" /></label>
            <button id="apply-range" type="button" class="ghost">범위 적용</button>
          </div>
        </section>
      </main>

      <aside class="exam-action-bar" role="region" aria-label="시작 액션">
        <div class="action-summary">
          <span class="action-summary-eyebrow">선택</span>
          <strong class="action-summary-label" id="sum-label">전체</strong>
          <span class="action-summary-range" id="sum-range">1–${max} · ${max}문제</span>
        </div>
        <div class="action-buttons">
          <button id="go-words" type="button" class="ghost">📖 단어 미리보기</button>
          <button id="go-start" type="button" class="primary">시작하기 →</button>
        </div>
      </aside>
    </div>`;

  // ── Cached refs ──
  const secList = root.querySelector<HTMLElement>('#sec-list')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#reset-all')!;
  const fromEl = root.querySelector<HTMLInputElement>('#from')!;
  const toEl = root.querySelector<HTMLInputElement>('#to')!;
  const applyBtn = root.querySelector<HTMLButtonElement>('#apply-range')!;
  const sumLabel = root.querySelector<HTMLElement>('#sum-label')!;
  const sumRange = root.querySelector<HTMLElement>('#sum-range')!;
  const startBtn = root.querySelector<HTMLButtonElement>('#go-start')!;
  const wordsBtn = root.querySelector<HTMLButtonElement>('#go-words')!;

  // ── In-place updaters ──
  const refreshCards = () => {
    secList.querySelectorAll<HTMLLIElement>('.sec').forEach((li) => {
      const isSelected = li.dataset.category === selectedSection;
      li.classList.toggle('is-selected', isSelected);
      li.setAttribute('aria-pressed', String(isSelected));
    });
  };

  const refreshSummary = () => {
    const s = summary();
    sumLabel.textContent = s.label;
    sumRange.textContent = `${s.from}–${s.to} · ${s.to - s.from + 1}문제`;
  };

  const refreshReset = () => {
    const isFull = !selectedSection && customFrom === 1 && customTo === max;
    resetBtn.disabled = isFull;
  };

  const refreshRangeInputs = () => {
    fromEl.value = String(customFrom);
    toEl.value = String(customTo);
  };

  const update = () => {
    refreshCards();
    refreshSummary();
    refreshReset();
  };

  // ── Event wiring (delegated where useful) ──
  const onPick = (li: HTMLLIElement) => {
    const cat = li.dataset.category!;
    if (selectedSection === cat) {
      // toggle off → revert to full
      selectedSection = null;
      customFrom = 1;
      customTo = max;
    } else {
      selectedSection = cat;
      const s = sectionByCat.get(cat)!;
      customFrom = s.from;
      customTo = s.to;
    }
    refreshRangeInputs();
    update();
  };

  secList.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('.sec') as HTMLLIElement | null;
    if (!li) return;
    onPick(li);
  });
  secList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = (e.target as HTMLElement).closest('.sec') as HTMLLIElement | null;
    if (!li) return;
    e.preventDefault();
    onPick(li);
  });

  resetBtn.addEventListener('click', () => {
    selectedSection = null;
    customFrom = 1;
    customTo = max;
    refreshRangeInputs();
    update();
  });

  applyBtn.addEventListener('click', () => {
    const f = Number(fromEl.value);
    const t = Number(toEl.value);
    if (!Number.isFinite(f) || !Number.isFinite(t) || f < 1 || t > max || f > t) return;
    selectedSection = null;
    customFrom = f;
    customTo = t;
    update();
  });

  startBtn.addEventListener('click', () => {
    const s = summary();
    const isFull = s.from === 1 && s.to === max && !selectedSection;
    navigate({
      name: 'question',
      examId,
      n: s.from,
      ...(isFull ? {} : { from: s.from, to: s.to }),
    });
  });

  wordsBtn.addEventListener('click', () => {
    const s = summary();
    const isFull = s.from === 1 && s.to === max && !selectedSection;
    navigate({
      name: 'wordlist',
      examId,
      ...(selectedSection ? { section: selectedSection } : {}),
      ...(!isFull && !selectedSection ? { from: s.from, to: s.to } : {}),
    });
  });

  // First paint (idempotent — applies initial classes/text)
  update();
}
