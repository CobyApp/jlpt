import { loadExam } from '../lib/data';
import { sectionLabelKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import type { Question } from '../types';

export async function renderExam(root: HTMLElement, examId: string) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const exam = await loadExam(examId);
  const sections = groupBySection(exam.questions);

  const sectionHtml = sections.map((s, i) => `
    <li class="sec" data-from="${s.from}" data-to="${s.to}" data-category="${escapeHtml(s.category)}">
      <span class="sec-number">問題${i + 1}</span>
      <span class="sec-label">${sectionLabelKo(i + 1, s.category).replace(/^問題\d+\s*/, '')}</span>
      <span class="sec-meta">
        <span>${s.from}–${s.to}</span>
        <span>${s.to - s.from + 1}문제</span>
      </span>
      <span class="sec-actions">
        <button type="button" class="sec-words" data-section="${escapeHtml(s.category)}" data-from="${s.from}" data-to="${s.to}" aria-label="이 영역 단어 미리보기">단어 미리보기</button>
        <span class="sec-cta">시작 →</span>
      </span>
    </li>`).join('');

  root.innerHTML = `
    <div class="app-shell">
      <header class="hero exam-hero">
        <a href="#/" class="back">회차 목록으로</a>
        <p class="hero-kicker">Exam Overview</p>
        <h1>${escapeHtml(exam.title)}</h1>
        <p class="hero-copy">${exam.questions.length}문제 · ${Object.keys(exam.passages).length}지문 · 원하는 섹션만 골라 풀 수 있어요.</p>
        <div class="exam-hero-actions">
          <a class="exam-hero-cta" href="#/exam/${examId}/words">📖 회차 전체 단어 미리 학습</a>
        </div>
      </header>
      <main class="exam-main panel">
        <section>
          <div class="section-heading">
            <p class="eyebrow">Section</p>
            <h2>섹션 선택</h2>
          </div>
          <ul class="sections section-grid">${sectionHtml}</ul>
        </section>
        <section class="range-panel">
          <div class="section-heading">
            <p class="eyebrow">Custom Range</p>
            <h2>직접 범위 지정</h2>
          </div>
          <div class="range-pick">
            <label>From <input type="number" id="from" min="1" max="${exam.questions.length}" value="1" /></label>
            <label>To <input type="number" id="to" min="1" max="${exam.questions.length}" value="${exam.questions.length}" /></label>
            <button id="go">시작하기</button>
            <button id="words-range" type="button" class="ghost">이 범위 단어 미리보기</button>
          </div>
        </section>
      </main>
    </div>`;

  root.querySelectorAll<HTMLLIElement>('.sec').forEach((li) => {
    li.addEventListener('click', (e) => {
      // If the user clicked on the "단어 미리보기" sub-button, route to wordlist instead.
      const target = e.target as HTMLElement;
      const wordsBtn = target.closest('.sec-words') as HTMLButtonElement | null;
      if (wordsBtn) {
        e.stopPropagation();
        const section = wordsBtn.dataset.section;
        navigate({ name: 'wordlist', examId, ...(section ? { section } : {}) });
        return;
      }
      const from = Number(li.dataset.from);
      const to = Number(li.dataset.to);
      navigate({ name: 'question', examId, n: from, from, to });
    });
  });

  root.querySelector<HTMLButtonElement>('#go')!.addEventListener('click', () => {
    const fromEl = root.querySelector<HTMLInputElement>('#from')!;
    const toEl = root.querySelector<HTMLInputElement>('#to')!;
    const max = exam.questions.length;
    const from = Number(fromEl.value);
    const to = Number(toEl.value);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to > max || from > to) return;
    navigate({ name: 'question', examId, n: from, from, to });
  });

  root.querySelector<HTMLButtonElement>('#words-range')!.addEventListener('click', () => {
    const fromEl = root.querySelector<HTMLInputElement>('#from')!;
    const toEl = root.querySelector<HTMLInputElement>('#to')!;
    const max = exam.questions.length;
    const from = Number(fromEl.value);
    const to = Number(toEl.value);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to > max || from > to) return;
    navigate({ name: 'wordlist', examId, from, to });
  });
}

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
