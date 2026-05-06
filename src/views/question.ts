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
        <a href="#/exam/${examId}" class="back" title="${escapeHtml(exam.title)}">←</a>
        <div class="qhdr-info">
          <span class="qhdr-pos">${n} / ${max}</span>
          <span class="qhdr-cat">${categoryKo(q.category)}</span>${q.src_label ? `<span class="qhdr-src">${escapeHtml(q.src_label)} · ${q.src_n}</span>` : ''}
          <span class="qhdr-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rangeProgress}"><i style="width:${rangeProgress}%"></i></span>
        </div>
        <button id="toggle-furigana" class="toggle">후리가나 ${getSettings().furigana ? 'ON' : 'OFF'}</button>
      </header>
      <main class="qmain">
        <section class="question-card">
          ${q.passage ? renderPassage(exam, q.passage, idx) : ''}
          <div class="stem">${q.stem ? renderJaWithUnderline(q.stem, idx, q.stem_u) : '(빈칸 채우기 — 위 지문 참조)'}</div>
          <ol class="opts">
            ${q.opts.map((o, i) => `<li><button class="opt" data-i="${i}"><span class="opt-num">${i + 1}.</span><span class="opt-text">${renderJa(o, idx)}</span></button></li>`).join('')}
          </ol>
          <div class="qactions">
            <button id="submit" class="primary" disabled>정답 확인</button>
          </div>
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
  const submitBtn = root.querySelector<HTMLButtonElement>('#submit')!;
  let picked = -1;
  let graded = false;

  const selectOption = (i: number) => {
    if (graded) return;
    picked = i;
    optBtns.forEach((b, j) => b.classList.toggle('opt-selected', j === i));
    submitBtn.disabled = false;
  };
  const submit = () => {
    if (picked < 0 || graded) return;
    graded = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '확인됨';
    gradeAndShow(q, picked, optBtns, fb, examId);
  };

  optBtns.forEach((btn) => {
    btn.addEventListener('click', () => selectOption(Number(btn.dataset.i)), { signal });
  });
  submitBtn.addEventListener('click', submit, { signal });

  const keyHandler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key >= '1' && e.key <= '4') {
      const i = Number(e.key) - 1;
      if (i < q.opts.length) selectOption(i);
    } else if (e.key === 'Enter' && picked >= 0 && !graded) {
      submit();
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
    <div class="expl">${formatExpl(expl)}</div>
  `;
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const EXPL_LABELS = ['정답', '핵심 이유', '핵심', '이유', '해설', '오답', '오답 분석', '포인트', '학습 포인트', '어휘', '문법', '해석', '의미'];
const EXPL_LABEL_RE = new RegExp(`(?:^|\\s)(${EXPL_LABELS.map(l => l.replace(/ /g, '\\s')).join('|')})\\s*[:：]\\s*`, 'g');

function formatExpl(text: string): string {
  const matches: { label: string; start: number; bodyStart: number }[] = [];
  EXPL_LABEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPL_LABEL_RE.exec(text)) !== null) {
    const labelStart = m.index + (m[0].length - m[0].trimStart().length);
    matches.push({ label: m[1], start: labelStart, bodyStart: m.index + m[0].length });
  }
  if (matches.length === 0) {
    return `<span class="expl-block">${escapeHtml(text.trim())}</span>`;
  }
  const blocks: string[] = [];
  // Lead text before first label
  if (matches[0].start > 0) {
    const lead = text.slice(0, matches[0].start).trim();
    if (lead) blocks.push(`<span class="expl-block">${escapeHtml(lead)}</span>`);
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = text.slice(cur.bodyStart, next ? next.start : undefined).trim().replace(/[.,]\s*$/, '');
    blocks.push(formatExplBlock(cur.label, body));
  }
  return blocks.join('');
}

function formatExplBlock(label: string, body: string): string {
  // For 오답, try to parse "1. ~, 2. ~, 3. ~" into a list
  if (/^오답/.test(label)) {
    const items = body.split(/(?:^|[,，、])\s*(?=\d\s*[.\.]\s*)/).map(s => s.trim()).filter(Boolean);
    if (items.length >= 2) {
      const lis = items.map((it) => {
        const itemMatch = it.match(/^(\d)\s*[.\.]\s*(.*)$/s);
        if (itemMatch) {
          return `<li><strong>${itemMatch[1]}.</strong> ${escapeHtml(itemMatch[2])}</li>`;
        }
        return `<li>${escapeHtml(it)}</li>`;
      }).join('');
      return `<span class="expl-block"><strong>${escapeHtml(label)}:</strong><ul>${lis}</ul></span>`;
    }
  }
  return `<span class="expl-block"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(body)}</span>`;
}
