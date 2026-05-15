import { loadExam, loadIndex } from '../lib/data';
import { sectionLabelKo, LISTENING_SLUGS, listeningTypeFromSlug, categoryKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import { getListenProgress } from '../state';
import type { Question, Listening, Exam } from '../types';

interface Section { key: string; from: number; to: number; idx: number }

const LISTENING_KO: Record<string, string> = {
  'task-based-comprehension': '과제 이해',
  'comprehension-of-key-points': '포인트 이해',
  'comprehension-general-outline': '개요 이해',
  'quick-response': '즉시 응답',
  'listening-integrated-comprehension': '통합 이해',
};

function renderListeningCards(examId: string, listening: Listening | undefined): string {
  if (!listening || examId.startsWith('cat:')) return '';
  const total = listening.subsections.reduce((s, sub) => s + sub.questions.length, 0);
  const prog = getListenProgress(examId);
  const answeredTotal = listening.subsections
    .flatMap((s) => s.questions)
    .filter((q) => prog[q.id]).length;
  const correctTotal = listening.subsections
    .flatMap((s) => s.questions)
    .filter((q) => prog[q.id]?.correct).length;
  const accuracy = answeredTotal ? Math.round((correctTotal / answeredTotal) * 100) : 0;

  const cards = listening.subsections.map((sub) => {
    const ko = LISTENING_KO[sub.type] ?? sub.english_title;
    const answered = sub.questions.filter((q) => prog[q.id]).length;
    const meta = answered
      ? `${answered}/${sub.questions.length}문제`
      : `${sub.questions.length}문제`;
    return `
      <li class="sec sec-listen" data-key="listen:${sub.order}" data-m="${sub.order}" tabindex="0" role="button" aria-pressed="false">
        <span class="sec-number">問題${sub.order}</span>
        <span class="sec-label">${escapeHtml(ko)}</span>
        <span class="sec-meta">
          <span>🔊 音声</span>
          <span>${meta}</span>
        </span>
      </li>`;
  }).join('');
  const progressLine = answeredTotal
    ? `<span class="listen-progress-meta">${answeredTotal}/${total} 완료 · 정답률 ${accuracy}%</span>`
    : '';
  return `
    <section class="listen-section">
      <div class="section-heading">
        <p class="eyebrow">Listening</p>
        <h2>聴解 · 청해 ${total}문제</h2>
        ${progressLine}
      </div>
      <ul class="sections section-grid" id="listen-list">${cards}</ul>
    </section>`;
}

async function renderListeningCategory(root: HTMLElement, slug: string) {
  const mondaiType = listeningTypeFromSlug(slug);
  if (!mondaiType) {
    root.innerHTML = `<div class="error">알 수 없는 청해 카테고리입니다.</div>`;
    return;
  }
  const idx = await loadIndex();
  const exams = await Promise.all(idx.exams.map((e) => loadExam(e.id)));

  interface Entry { exam: Exam; m: number; questionCount: number; answered: number; correct: number }
  const entries: Entry[] = [];
  for (const exam of exams) {
    const sub = exam.listening?.subsections.find((s) => s.type === mondaiType);
    if (!sub) continue;
    const prog = getListenProgress(exam.test_id);
    const answered = sub.questions.filter((q) => prog[q.id]).length;
    const correct = sub.questions.filter((q) => prog[q.id]?.correct).length;
    entries.push({ exam, m: sub.order, questionCount: sub.questions.length, answered, correct });
  }

  const totalQ = entries.reduce((s, e) => s + e.questionCount, 0);
  const totalAnswered = entries.reduce((s, e) => s + e.answered, 0);
  const totalCorrect = entries.reduce((s, e) => s + e.correct, 0);
  const accuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const categoryName = categoryKo(mondaiType);

  const cards = entries.map((e) => {
    const shortTitle = e.exam.title
      .replace(/^JLPT N1 Mock Test\s*[–-]\s*/i, '')
      .replace(/^JLPT Practice Workbook\s*/i, 'Workbook ')
      .trim();
    const progress = e.questionCount ? Math.round((e.answered / e.questionCount) * 100) : 0;
    const acc = e.answered ? Math.round((e.correct / e.answered) * 100) : 0;
    return `
      <a class="card exam-card" href="#/exam/${e.exam.test_id}/listen/${e.m}">
        <div class="card-topline">
          <span class="card-badge">청해 問題${e.m}</span>
          <span class="card-meta">${e.questionCount}문제</span>
        </div>
        <div class="card-title">${escapeHtml(shortTitle)}</div>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <span style="width: ${progress}%"></span>
        </div>
        <div class="card-foot">
          <span>${e.answered}/${e.questionCount} 완료</span>
          <span>정답률 ${acc}%</span>
        </div>
      </a>`;
  }).join('');

  root.innerHTML = `
    <div class="app-shell">
      <header class="hero exam-hero">
        <a href="#/" class="back">홈으로</a>
        <p class="hero-kicker">Listening Drill</p>
        <h1>${escapeHtml(categoryName)}</h1>
        <p class="hero-copy">11회차에서 같은 유형의 청해 mondai를 모아서 풀어보세요. ${entries.length}회차 · ${totalQ}문제${totalAnswered ? ` · 정답률 ${accuracy}%` : ''}</p>
      </header>
      <main class="exam-main panel">
        <div class="cards">${cards}</div>
      </main>
    </div>`;
}

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

  // Listening category drill (cat:listen-X) is rendered as a list of exam cards,
  // each linking to that exam's listening view for the chosen mondai type.
  if (examId.startsWith('cat:') && LISTENING_SLUGS.has(examId.slice(4))) {
    await renderListeningCategory(root, examId.slice(4));
    return;
  }

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

  const selectedListenOrders = (): number[] => {
    if (!exam.listening) return [];
    return exam.listening.subsections
      .filter((sub) => selected.has(`listen:${sub.order}`))
      .map((sub) => sub.order);
  };

  const summary = () => {
    const list = orderedSelected();
    const lOrders = selectedListenOrders();
    const groupNoun = isCategoryDrill ? '회차' : '영역';
    const total = list.length + lOrders.length;
    if (total === 0) {
      return { label: `${groupNoun}을 선택하세요`, range: `총 ${max}문제`, count: 0, hasSelection: false };
    }
    const readingQs = list.reduce((sum, s) => sum + (s.to - s.from + 1), 0);
    const listenQs = lOrders.reduce((sum, m) => {
      const sub = exam.listening?.subsections.find((s) => s.order === m);
      return sum + (sub ? sub.questions.length : 0);
    }, 0);
    const totalQs = readingQs + listenQs;
    if (total === 1) {
      if (list.length === 1) {
        const s = list[0];
        const label = isCategoryDrill ? s.key : `問題${s.idx + 1} ${labelOf(s)}`;
        return { label, range: `${s.from}–${s.to} · ${totalQs}문제`, count: totalQs, hasSelection: true };
      }
      const m = lOrders[0];
      const sub = exam.listening?.subsections.find((s) => s.order === m);
      const label = `청해 問題${m}${sub ? ' ' + (LISTENING_KO[sub.type] ?? '') : ''}`.trim();
      return { label, range: `${listenQs}문제 (청해)`, count: totalQs, hasSelection: true };
    }
    const readTags = list.map((s) => isCategoryDrill ? s.key : `問題${s.idx + 1}`);
    const listenTags = lOrders.map((m) => `청해${m}`);
    const tags = [...readTags, ...listenTags].join(', ');
    return {
      label: `${total}개 ${groupNoun} 선택`,
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
        ${renderListeningCards(examId, exam.listening)}
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

  // Listening section keys (if any) for multi-select / wordlist preview.
  const listenKeys: string[] = exam.listening
    ? exam.listening.subsections.map((sub) => `listen:${sub.order}`)
    : [];
  const allSelectableCount = sections.length + listenKeys.length;

  // ── In-place updaters ──
  const refreshCards = () => {
    secList.querySelectorAll<HTMLLIElement>('.sec').forEach((li) => {
      const isSelected = selected.has(li.dataset.key!);
      li.classList.toggle('is-selected', isSelected);
      li.setAttribute('aria-pressed', String(isSelected));
    });
    root.querySelectorAll<HTMLLIElement>('.sec-listen').forEach((li) => {
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
    selectAllBtn.disabled = selected.size === allSelectableCount;
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
    for (const k of listenKeys) selected.add(k);
    update();
  });

  startBtn.addEventListener('click', () => {
    const list = orderedSelected();
    const lOrders = selectedListenOrders();
    // Listening-only selection → jump to that mondai's listening page.
    if (lOrders.length > 0 && list.length === 0) {
      navigate({ name: 'listen', examId, m: lOrders[0] });
      return;
    }
    if (list.length === 0) return;
    const from = Math.min(...list.map((s) => s.from));
    const to = Math.max(...list.map((s) => s.to));
    navigate({ name: 'question', examId, n: from, from, to });
  });

  wordsBtn.addEventListener('click', () => {
    const list = orderedSelected();
    const lOrders = selectedListenOrders();
    if (list.length === 0 && lOrders.length === 0) return;
    // Pass reading section keys + listening keys (listen:<m>) to wordlist.
    const sectionKeys = [
      ...list.map((s) => s.key),
      ...lOrders.map((m) => `listen:${m}`),
    ];
    navigate({ name: 'wordlist', examId, sections: sectionKeys });
  });

  // Listening cards: click = toggle in multi-select (same as reading cards).
  const listenList = root.querySelector<HTMLElement>('#listen-list');
  if (listenList) {
    const toggleListen = (li: HTMLElement) => {
      const k = li.dataset.key!;
      if (selected.has(k)) selected.delete(k);
      else selected.add(k);
      update();
    };
    listenList.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('.sec-listen');
      if (!li) return;
      toggleListen(li);
    });
    listenList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const li = (e.target as HTMLElement).closest<HTMLElement>('.sec-listen');
      if (!li) return;
      e.preventDefault();
      toggleListen(li);
    });
  }

  // First paint
  update();
}
