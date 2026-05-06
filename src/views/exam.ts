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

  // ── Selection state (kept inside this render scope) ──
  // null when "전체" (full exam range)
  let selectedSection: string | null = null;
  let customFrom: number = 1;
  let customTo: number = max;

  const sectionByCat = new Map(sections.map((s) => [s.category, s]));

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

  const draw = () => {
    const sel = summary();
    const isFull = !selectedSection && customFrom === 1 && customTo === max;

    const sectionHtml = sections.map((s, i) => {
      const isSelected = selectedSection === s.category;
      return `
        <li class="sec ${isSelected ? 'is-selected' : ''}" data-category="${escapeHtml(s.category)}" tabindex="0" role="button" aria-pressed="${isSelected}">
          <span class="sec-number">問題${i + 1}</span>
          <span class="sec-label">${sectionLabelKo(i + 1, s.category).replace(/^問題\d+\s*/, '')}</span>
          <span class="sec-meta">
            <span>${s.from}–${s.to}</span>
            <span>${s.to - s.from + 1}문제</span>
          </span>
        </li>`;
    }).join('');

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
              <button id="reset-all" class="ghost-link" type="button" ${isFull ? 'disabled' : ''}>전체로 초기화</button>
            </div>
            <ul class="sections section-grid">${sectionHtml}</ul>
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
            <strong class="action-summary-label">${escapeHtml(sel.label)}</strong>
            <span class="action-summary-range">${sel.from}–${sel.to} · ${sel.to - sel.from + 1}문제</span>
          </div>
          <div class="action-buttons">
            <button id="go-words" type="button" class="ghost">📖 단어 미리보기</button>
            <button id="go-start" type="button" class="primary">시작하기 →</button>
          </div>
        </aside>
      </div>`;

    // Section selection
    const onSectionPick = (li: HTMLLIElement) => {
      const cat = li.dataset.category!;
      if (selectedSection === cat) {
        // Toggle off → revert to full
        selectedSection = null;
        customFrom = 1;
        customTo = max;
      } else {
        selectedSection = cat;
        const s = sectionByCat.get(cat)!;
        customFrom = s.from;
        customTo = s.to;
      }
      draw();
    };
    root.querySelectorAll<HTMLLIElement>('.sec').forEach((li) => {
      li.addEventListener('click', () => onSectionPick(li));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSectionPick(li);
        }
      });
    });

    // Reset
    root.querySelector<HTMLButtonElement>('#reset-all')?.addEventListener('click', () => {
      selectedSection = null;
      customFrom = 1;
      customTo = max;
      draw();
    });

    // Custom range apply
    root.querySelector<HTMLButtonElement>('#apply-range')?.addEventListener('click', () => {
      const fromEl = root.querySelector<HTMLInputElement>('#from')!;
      const toEl = root.querySelector<HTMLInputElement>('#to')!;
      const from = Number(fromEl.value);
      const to = Number(toEl.value);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to > max || from > to) return;
      // Editing the range = custom selection (clear section)
      selectedSection = null;
      customFrom = from;
      customTo = to;
      draw();
    });

    // Action bar
    root.querySelector<HTMLButtonElement>('#go-start')?.addEventListener('click', () => {
      const s = summary();
      const isFull = s.from === 1 && s.to === max && !selectedSection;
      navigate({
        name: 'question',
        examId,
        n: s.from,
        ...(isFull ? {} : { from: s.from, to: s.to }),
      });
    });

    root.querySelector<HTMLButtonElement>('#go-words')?.addEventListener('click', () => {
      const s = summary();
      const isFull = s.from === 1 && s.to === max && !selectedSection;
      navigate({
        name: 'wordlist',
        examId,
        ...(selectedSection ? { section: selectedSection } : {}),
        ...(!isFull && !selectedSection ? { from: s.from, to: s.to } : {}),
      });
    });
  };

  draw();
}
