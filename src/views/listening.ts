import { loadExam, loadVocab } from '../lib/data';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import { getSettings, setSettings, getListenProgress, recordListenAnswer } from '../state';
import { buildIndex, matchVocab } from '../lib/vocab-match';
import { withFurigana, withoutFurigana } from '../lib/furigana';
import { showPopover, hidePopover } from '../lib/popover';
import type { Listening, ListeningSubsection, ListeningQuestion, VocabEntry } from '../types';

let currentController: AbortController | null = null;

const BASE = (import.meta as any).env?.BASE_URL ?? '/';

type VocabIdx = ReturnType<typeof buildIndex>;

/** Resolve an audio URL. Accepts full http(s) URLs (Supabase/CDN) or local relative paths. */
function resolveAudio(audioUrl: string): string {
  if (/^https?:\/\//.test(audioUrl)) return audioUrl;
  return `${BASE}data/${audioUrl}`.replace(/([^:])\/+/g, '$1/');
}

/**
 * Strip nihonez-style listening HTML into plain Japanese text so we can run
 * vocab-matching ourselves. Drops <rt> readings (we re-derive readings from
 * the vocab DB), <ruby> wrappers (keep the base kanji/kana), and other markup.
 * Preserves paragraph boundaries via newlines.
 */
function htmlToPlain(html: string): string {
  return html
    .replace(/<rt>.*?<\/rt>/gs, '')
    .replace(/<\/?ruby>/g, '')
    .replace(/<br\s*\/?>(?!\s*<br)/g, '\n')
    .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '\n\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderJa(text: string, idx: VocabIdx): string {
  if (!text) return '';
  const segs = matchVocab(text, idx);
  return getSettings().furigana ? withFurigana(segs) : withoutFurigana(segs);
}

/** Convert plain text (from htmlToPlain) into vocab-matched, multi-line HTML. */
function renderJaBlock(text: string, idx: VocabIdx): string {
  if (!text) return '';
  return text
    .split('\n\n')
    .map((para) => para
      .split('\n')
      .map((line) => renderJa(line, idx))
      .join('<br>'))
    .map((para) => `<p class="ja-para">${para}</p>`)
    .join('');
}

export async function renderListening(root: HTMLElement, examId: string, m: number) {
  if (currentController) currentController.abort();
  const controller = new AbortController();
  currentController = controller;
  const { signal } = controller;

  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const [exam, vocab] = await Promise.all([loadExam(examId), loadVocab()]);
  if (!exam.listening) {
    root.innerHTML = `<div class="error">청해 데이터가 없습니다 (회차: ${escapeHtml(examId)}).</div>`;
    return;
  }
  const sub = exam.listening.subsections.find((s) => s.order === m);
  if (!sub) {
    root.innerHTML = `<div class="error">問題${m}을 찾을 수 없습니다.</div>`;
    return;
  }
  const total = exam.listening.subsections.length;
  const prevM = m > 1 ? m - 1 : null;
  const nextM = m < total ? m + 1 : null;
  const idx = buildIndex(vocab);

  root.innerHTML = renderShell(exam.test_id, exam.title, exam.listening, sub, prevM, nextM, idx);

  // Restore prior answers (in-place patch of DOM)
  const saved = getListenProgress(exam.test_id);
  for (const q of sub.questions) {
    const rec = saved[q.id];
    if (!rec) continue;
    restoreAnswered(root, q, rec.picked, idx);
  }

  wireListeners(root, exam.test_id, sub, prevM, nextM, signal, saved, idx, vocab, exam.questions.length);
}

function restoreAnswered(root: HTMLElement, q: ListeningQuestion, picked: number, idx: VocabIdx) {
  const card = root.querySelector<HTMLElement>(`.listen-q[data-qid="${q.id}"]`);
  if (!card) return;
  card.querySelectorAll<HTMLButtonElement>('.opt').forEach((b, i) => {
    if (i === q.correct) b.classList.add('opt-correct');
    else if (i === picked) b.classList.add('opt-wrong', 'opt-picked');
    if (i === picked) b.classList.add('opt-selected');
  });
  const submit = card.querySelector<HTMLButtonElement>('.submit');
  if (submit) { submit.disabled = true; submit.textContent = '확인됨'; }
  const fb = card.querySelector<HTMLElement>('.feedback');
  if (fb) fb.innerHTML = renderFeedback(q, picked, idx);
}

function renderShell(
  examId: string,
  examTitle: string,
  listening: Listening,
  sub: ListeningSubsection,
  prevM: number | null,
  nextM: number | null,
  idx: VocabIdx,
): string {
  const audioPath = resolveAudio(sub.audio_url);
  const furiOn = getSettings().furigana;
  const subNav = listening.subsections.map((s) => `
    <a class="l-subnav-chip ${s.order === sub.order ? 'is-active' : ''}"
       href="#/exam/${examId}/listen/${s.order}">問題${s.order}</a>
  `).join('');

  const questions = sub.questions.map((q) => renderQuestion(q, idx)).join('');
  const introPlain = htmlToPlain(sub.intro_html);

  return `
    <div class="study-shell listen-shell">
      <header class="qhdr listen-hdr">
        <a href="#/exam/${examId}" class="back" title="${escapeHtml(examTitle)}" aria-label="회차로 돌아가기"></a>
        <div class="qhdr-info">
          <span class="qhdr-pos">問題${sub.order} / ${listening.subsections.length}</span>
          <span class="qhdr-cat">聴解 · ${escapeHtml(sub.english_title)}</span>
          <span class="qhdr-src">${sub.questions.length}문제</span>
        </div>
        <button id="toggle-furigana" class="toggle">후리가나 ${furiOn ? 'ON' : 'OFF'}</button>
      </header>

      <main class="qmain listen-main">
        <nav class="l-subnav" aria-label="청해 문제 이동">${subNav}</nav>

        <section class="listen-intro-card">
          <div class="ja intro-ja">${renderJa(introPlain, idx)}</div>
        </section>

        <section class="listen-audio-card" aria-label="오디오 재생">
          <div class="audio-row">
            <audio controls preload="metadata" src="${audioPath}"></audio>
          </div>
          <div class="audio-meta">
            <span>問題${sub.order} · ${escapeHtml(sub.english_title)}</span>
            <span class="audio-help">한 번에 ${sub.questions.length}문제 전체</span>
          </div>
        </section>

        <ol class="listen-questions">${questions}</ol>

        <nav class="qnav listen-nav">
          ${prevM
            ? `<button id="prev-m" type="button">← 問題${prevM}</button>`
            : `<button id="back-to-reading" type="button">← 독해로</button>`}
          ${nextM
            ? `<button id="next-m" type="button">問題${nextM} →</button>`
            : `<button id="finish-exam" type="button">완료 · 회차로</button>`}
        </nav>
      </main>
    </div>
  `;
}

function visibleOptCount(q: ListeningQuestion): number {
  // Trim trailing empty options — Quick Response only has 3 choices.
  let n = Math.min(q.opts.length, q.opts_html.length);
  while (n > 0 && !(q.opts[n - 1] ?? '').trim() && !(q.opts_html[n - 1] ?? '').trim()) n--;
  return Math.max(n, 0);
}

function renderQuestion(q: ListeningQuestion, idx: VocabIdx): string {
  const count = visibleOptCount(q);
  const opts = Array.from({ length: count }, (_, i) => {
    const text = q.opts[i] ?? '';
    return `
      <li>
        <button class="opt" data-qid="${q.id}" data-i="${i}">
          <span class="opt-num">${i + 1}.</span><span class="opt-text">${renderJa(text, idx)}</span>
        </button>
      </li>
    `;
  }).join('');

  return `
    <li class="listen-q" data-qid="${q.id}">
      <header class="listen-q-hdr">
        <span class="listen-q-num">Q${q.n}</span>
        <span class="listen-q-hint">선택지 ${count}개 — 음성을 듣고 고르세요</span>
      </header>
      <ol class="opts">${opts}</ol>
      <div class="qactions">
        <button class="primary submit" data-qid="${q.id}" disabled>정답 확인</button>
      </div>
      <div class="feedback" data-qid="${q.id}"></div>
    </li>
  `;
}

function renderFeedback(q: ListeningQuestion, picked: number, idx: VocabIdx): string {
  const correct = picked === q.correct;
  const verdict = correct
    ? '✓ 정답'
    : `✗ 오답 (정답: ${q.correct + 1}번)`;
  const translation = q.translation_ko || '';
  const expl = q.expl_ko || '';
  const scriptPlain = htmlToPlain(q.script_html);
  return `
    <div class="verdict ${correct ? 'ok' : 'no'}">${verdict}</div>
    <details class="listen-reveal" open>
      <summary>音声スクリプト (원문 일본어)</summary>
      <div class="ja listen-script">${renderJaBlock(scriptPlain, idx)}</div>
    </details>
    ${translation ? `
      <details class="listen-reveal">
        <summary>한국어 번역</summary>
        <div class="listen-translation">${translation}</div>
      </details>
    ` : ''}
    ${expl ? `
      <details class="listen-reveal" open>
        <summary>해설</summary>
        <div class="listen-expl">${expl}</div>
      </details>
    ` : ''}
  `;
}

function wireListeners(
  root: HTMLElement,
  examId: string,
  sub: ListeningSubsection,
  prevM: number | null,
  nextM: number | null,
  signal: AbortSignal,
  saved: Record<string, { picked: number; correct: boolean; ts: number }>,
  idx: VocabIdx,
  vocab: VocabEntry[],
  readingTotal: number,
) {
  const qmap = new Map(sub.questions.map((q) => [q.id, q]));
  const vocabMap = new Map(vocab.map((v) => [v.w, v]));
  const pickedMap = new Map<string, number>();
  const gradedSet = new Set<string>();
  // Seed graded set from persisted answers
  for (const q of sub.questions) {
    const rec = saved[q.id];
    if (rec) {
      pickedMap.set(q.id, rec.picked);
      gradedSet.add(q.id);
    }
  }

  root.querySelector<HTMLButtonElement>('#prev-m')?.addEventListener('click', () => {
    if (prevM) navigate({ name: 'listen', examId, m: prevM });
  }, { signal });
  root.querySelector<HTMLButtonElement>('#next-m')?.addEventListener('click', () => {
    if (nextM) navigate({ name: 'listen', examId, m: nextM });
  }, { signal });
  // Listening m=1 prev → last reading question (so 전체 시작 flow is reversible)
  root.querySelector<HTMLButtonElement>('#back-to-reading')?.addEventListener('click', () => {
    if (readingTotal > 0) navigate({ name: 'question', examId, n: readingTotal });
    else navigate({ name: 'exam', examId });
  }, { signal });
  // Listening m=last next → back to exam-start screen (complete)
  root.querySelector<HTMLButtonElement>('#finish-exam')?.addEventListener('click', () => {
    navigate({ name: 'exam', examId });
  }, { signal });

  // Furigana toggle: in-place patch script/intro/opts (and any open feedbacks)
  const furiBtn = root.querySelector<HTMLButtonElement>('#toggle-furigana');
  furiBtn?.addEventListener('click', () => {
    setSettings({ furigana: !getSettings().furigana });
    furiBtn.textContent = `후리가나 ${getSettings().furigana ? 'ON' : 'OFF'}`;

    const intro = root.querySelector<HTMLElement>('.listen-intro-card .ja');
    if (intro) intro.innerHTML = renderJa(htmlToPlain(sub.intro_html), idx);

    root.querySelectorAll<HTMLElement>('.listen-q').forEach((card) => {
      const qid = card.dataset.qid!;
      const q = qmap.get(qid)!;
      card.querySelectorAll<HTMLElement>('.opt .opt-text').forEach((el, i) => {
        el.innerHTML = renderJa(q.opts[i] ?? '', idx);
      });
      const fb = card.querySelector<HTMLElement>('.feedback');
      if (fb && gradedSet.has(qid)) {
        const picked = pickedMap.get(qid)!;
        fb.innerHTML = renderFeedback(q, picked, idx);
      }
    });
  }, { signal });

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Vocab popover (★ wordbook lives inside the popover itself)
    const vw = target.closest('.vw') as HTMLElement | null;
    if (vw) {
      e.stopPropagation();
      const w = vw.dataset.w!;
      const v = vocabMap.get(w);
      if (v) showPopover(vw, v);
      return;
    }

    const opt = target.closest('.opt') as HTMLButtonElement | null;
    if (opt && !opt.disabled) {
      const qid = opt.dataset.qid!;
      if (gradedSet.has(qid)) return;
      const i = Number(opt.dataset.i);
      pickedMap.set(qid, i);
      const card = opt.closest('.listen-q')!;
      card.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => {
        b.classList.toggle('opt-selected', Number(b.dataset.i) === i);
      });
      const sb = card.querySelector<HTMLButtonElement>('.submit')!;
      sb.disabled = false;
      return;
    }
    const submit = target.closest('.submit') as HTMLButtonElement | null;
    if (submit && !submit.disabled) {
      const qid = submit.dataset.qid!;
      if (gradedSet.has(qid)) return;
      const picked = pickedMap.get(qid);
      if (picked == null) return;
      gradedSet.add(qid);
      submit.disabled = true;
      submit.textContent = '확인됨';
      const q = qmap.get(qid)!;
      const card = submit.closest('.listen-q')!;
      card.querySelectorAll<HTMLButtonElement>('.opt').forEach((b, i) => {
        b.classList.remove('opt-picked', 'opt-correct', 'opt-wrong');
        if (i === q.correct) b.classList.add('opt-correct');
        else if (i === picked) b.classList.add('opt-wrong', 'opt-picked');
      });
      const fb = card.querySelector<HTMLElement>('.feedback')!;
      fb.innerHTML = renderFeedback(q, picked, idx);
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      recordListenAnswer(examId, qid, picked, picked === q.correct);
    }
  }, { signal });

  window.addEventListener('hashchange', hidePopover, { signal });
}
