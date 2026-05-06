import { loadExam, loadVocab } from '../lib/data';
import { categoryKo } from '../lib/categories';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import { recordAnswer, setLast, getSettings, setSettings } from '../state';
import { buildIndex, matchVocab } from '../lib/vocab-match';
import { withFurigana, withoutFurigana } from '../lib/furigana';
import { showPopover, hidePopover } from '../lib/popover';
import type { Exam, Question } from '../types';

let currentController: AbortController | null = null;

export async function renderQuestion(
  root: HTMLElement,
  examId: string,
  n: number,
  from?: number,
  to?: number,
) {
  if (currentController) currentController.abort();
  const controller = new AbortController();
  currentController = controller;
  const { signal } = controller;

  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const exam = await loadExam(examId);
  const q = exam.questions.find((x) => x.n === n);
  if (!q) { root.innerHTML = `<div class="error">문제 ${n}을 찾을 수 없습니다.</div>`; return; }

  const min = from ?? 1;
  const max = to ?? exam.questions.length;
  const rangeTotal = Math.max(1, max - min + 1);
  const rangePosition = Math.min(Math.max(n - min + 1, 1), rangeTotal);
  const rangeProgress = Math.round((rangePosition / rangeTotal) * 100);
  const vocab = await loadVocab();
  const idx = buildIndex(vocab);
  setLast(examId, n);

  root.innerHTML = `
    <div class="study-shell">
      <header class="qhdr">
        <div>
          <a href="#/exam/${examId}" class="back">${escapeHtml(exam.title)}</a>
          <div class="qmeta">
            <span>문제 ${n} / ${max}</span>
            <span>범위 ${min}–${max}</span>
            <span>${categoryKo(q.category)}</span>
          </div>
          <div class="question-progress" role="progressbar" aria-label="현재 범위 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rangeProgress}">
            <span style="width: ${rangeProgress}%"></span>
          </div>
          <div class="qposition">${rangePosition}번째 / ${rangeTotal}문제</div>
        </div>
        <button id="toggle-furigana" class="toggle">${getSettings().furigana ? '후리가나 ON' : '후리가나 OFF'}</button>
      </header>
      <main class="qmain">
        <section class="question-card">
          ${q.passage ? renderPassage(exam, q.passage, idx) : ''}
          <div class="stem">${q.stem ? renderJaWithUnderline(q.stem, idx, q.stem_u) : '(빈칸 채우기 — 위 지문 참조)'}</div>
          <ol class="opts">
            ${q.opts.map((o, i) => `<li><button class="opt" data-i="${i}"><span>${i + 1}</span>${renderJa(o, idx)}</button></li>`).join('')}
          </ol>
          <div class="feedback" id="feedback"></div>
          <nav class="qnav">
            <button id="prev" ${n <= min ? 'disabled' : ''}>이전</button>
            <button id="next" ${n >= max ? 'disabled' : ''}>다음</button>
          </nav>
        </section>
      </main>
    </div>`;

  root.querySelector<HTMLButtonElement>('#prev')!.addEventListener('click', () => {
    if (n > min) navigate({ name: 'question', examId, n: n - 1, from, to });
  }, { signal });
  root.querySelector<HTMLButtonElement>('#next')!.addEventListener('click', () => {
    if (n < max) navigate({ name: 'question', examId, n: n + 1, from, to });
  }, { signal });
  root.querySelector<HTMLButtonElement>('#toggle-furigana')!.addEventListener('click', () => {
    setSettings({ furigana: !getSettings().furigana });
    renderQuestion(root, examId, n, from, to);
  }, { signal });

  const optBtns = root.querySelectorAll<HTMLButtonElement>('.opt');
  const fb = root.querySelector<HTMLDivElement>('#feedback')!;

  optBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const picked = Number(btn.dataset.i);
      gradeAndShow(q, picked, optBtns, fb, examId);
    }, { signal });
  });

  const keyHandler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key >= '1' && e.key <= '4') {
      const i = Number(e.key) - 1;
      if (i < q.opts.length) optBtns[i]?.click();
    } else if (e.key === 'ArrowLeft' && n > min) {
      navigate({ name: 'question', examId, n: n - 1, from, to });
    } else if (e.key === 'ArrowRight' && n < max) {
      navigate({ name: 'question', examId, n: n + 1, from, to });
    }
  };
  document.addEventListener('keydown', keyHandler, { signal });

  const vocabMap = new Map(vocab.map((v) => [v.w, v]));
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('.vw') as HTMLElement | null;
    if (t) {
      e.stopPropagation();
      const w = t.dataset.w!;
      const v = vocabMap.get(w);
      if (v) showPopover(t, v);
    }
  }, { signal });
  window.addEventListener('hashchange', hidePopover, { signal });
}

function renderPassage(exam: Exam, pid: string, idx: ReturnType<typeof buildIndex>): string {
  const p = exam.passages[pid];
  if (!p) return '';
  const ko = p.ko ? `<details class="passage-ko"><summary>한국어 번역</summary><div class="ko">${escapeHtml(p.ko)}</div></details>` : '';
  return `<aside class="passage"><div class="ja">${renderJa(p.ja, idx)}</div>${ko}</aside>`;
}

function renderJa(text: string, idx: ReturnType<typeof buildIndex>): string {
  const segs = matchVocab(text, idx);
  return getSettings().furigana ? withFurigana(segs) : withoutFurigana(segs);
}

function renderJaWithUnderline(text: string, idx: ReturnType<typeof buildIndex>, underline?: string): string {
  if (!underline) return renderJa(text, idx);
  const i = text.indexOf(underline);
  if (i < 0) return renderJa(text, idx);
  const before = text.slice(0, i);
  const target = text.slice(i, i + underline.length);
  const after = text.slice(i + underline.length);
  return `${renderJa(before, idx)}<u class="qu">${renderJa(target, idx)}</u>${renderJa(after, idx)}`;
}

function gradeAndShow(
  q: Question,
  picked: number,
  optBtns: NodeListOf<HTMLButtonElement>,
  fb: HTMLDivElement,
  examId: string,
) {
  const correct = picked === q.correct;
  recordAnswer(examId, q.n, picked, correct);

  optBtns.forEach((b, i) => {
    b.classList.remove('opt-picked', 'opt-correct', 'opt-wrong');
    if (i === q.correct) b.classList.add('opt-correct');
    else if (i === picked) b.classList.add('opt-wrong', 'opt-picked');
  });

  const verdict = correct ? '✓ 정답' : `✗ 오답 (정답: ${q.correct + 1}번)`;
  const expl = q.expl_ko ?? q.expl ?? '(해설 없음)';
  fb.innerHTML = `
    <div class="verdict ${correct ? 'ok' : 'no'}">${verdict}</div>
    <div class="expl">${escapeHtml(expl)}</div>
  `;
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
