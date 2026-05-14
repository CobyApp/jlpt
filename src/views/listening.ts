import { loadExam } from '../lib/data';
import { escapeHtml } from '../lib/html';
import { navigate } from '../router';
import { getSettings, setSettings, getListenProgress, recordListenAnswer } from '../state';
import type { Listening, ListeningSubsection, ListeningQuestion } from '../types';

let currentController: AbortController | null = null;

const BASE = (import.meta as any).env?.BASE_URL ?? '/';

/** Resolve an audio URL. Accepts full http(s) URLs (Supabase/CDN) or local relative paths. */
function resolveAudio(audioUrl: string): string {
  if (/^https?:\/\//.test(audioUrl)) return audioUrl;
  return `${BASE}data/${audioUrl}`.replace(/([^:])\/+/g, '$1/');
}

function stripFurigana(html: string): string {
  return html.replace(/<rt>.*?<\/rt>/gs, '');
}

function renderJa(html: string): string {
  return getSettings().furigana ? html : stripFurigana(html);
}

export async function renderListening(root: HTMLElement, examId: string, m: number) {
  if (currentController) currentController.abort();
  const controller = new AbortController();
  currentController = controller;
  const { signal } = controller;

  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const exam = await loadExam(examId);
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

  root.innerHTML = renderShell(exam.test_id, exam.title, exam.listening, sub, prevM, nextM);

  // Restore prior answers (in-place patch of DOM)
  const saved = getListenProgress(exam.test_id);
  for (const q of sub.questions) {
    const rec = saved[q.id];
    if (!rec) continue;
    restoreAnswered(root, q, rec.picked);
  }

  wireListeners(root, exam.test_id, sub, prevM, nextM, signal, saved);
}

function restoreAnswered(root: HTMLElement, q: ListeningQuestion, picked: number) {
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
  if (fb) fb.innerHTML = renderFeedback(q, picked);
}

function renderShell(
  examId: string,
  examTitle: string,
  listening: Listening,
  sub: ListeningSubsection,
  prevM: number | null,
  nextM: number | null,
): string {
  const audioPath = resolveAudio(sub.audio_url);
  const furiOn = getSettings().furigana;
  const subNav = listening.subsections.map((s) => `
    <a class="l-subnav-chip ${s.order === sub.order ? 'is-active' : ''}"
       href="#/exam/${examId}/listen/${s.order}">問題${s.order}</a>
  `).join('');

  const questions = sub.questions.map((q) => renderQuestion(q)).join('');

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
          <div class="ja">${renderJa(sub.intro_html)}</div>
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
          ${prevM ? `<button id="prev-m" type="button">← 問題${prevM}</button>` : '<span></span>'}
          ${nextM ? `<button id="next-m" type="button">問題${nextM} →</button>` : '<span></span>'}
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

function renderQuestion(q: ListeningQuestion): string {
  const count = visibleOptCount(q);
  const opts = Array.from({ length: count }, (_, i) => {
    const html = q.opts_html[i] ?? '';
    const text = renderJa(html || escapeHtml(q.opts[i] ?? ''));
    return `
      <li>
        <button class="opt" data-qid="${q.id}" data-i="${i}">
          <span class="opt-num">${i + 1}.</span><span class="opt-text">${text}</span>
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

function renderFeedback(q: ListeningQuestion, picked: number): string {
  const correct = picked === q.correct;
  const verdict = correct
    ? '✓ 정답'
    : `✗ 오답 (정답: ${q.correct + 1}번)`;
  const translation = q.translation_ko || q.translation_en || '';
  const expl = q.expl_ko || q.explanation_en || '';
  return `
    <div class="verdict ${correct ? 'ok' : 'no'}">${verdict}</div>
    <details class="listen-reveal" open>
      <summary>音声スクリプト (원문 일본어)</summary>
      <div class="ja listen-script">${renderJa(q.script_html)}</div>
    </details>
    ${translation ? `
      <details class="listen-reveal">
        <summary>한국어/영어 번역</summary>
        <div class="listen-translation">${translation}</div>
      </details>
    ` : ''}
    ${expl ? `
      <details class="listen-reveal">
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
) {
  const qmap = new Map(sub.questions.map((q) => [q.id, q]));
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

  // Furigana toggle: in-place patch script/intro/opts
  const furiBtn = root.querySelector<HTMLButtonElement>('#toggle-furigana');
  furiBtn?.addEventListener('click', () => {
    setSettings({ furigana: !getSettings().furigana });
    furiBtn.textContent = `후리가나 ${getSettings().furigana ? 'ON' : 'OFF'}`;

    const intro = root.querySelector<HTMLElement>('.listen-intro-card .ja');
    if (intro) intro.innerHTML = renderJa(sub.intro_html);

    root.querySelectorAll<HTMLElement>('.listen-q').forEach((card) => {
      const qid = card.dataset.qid!;
      const q = qmap.get(qid)!;
      card.querySelectorAll<HTMLElement>('.opt .opt-text').forEach((el, i) => {
        const html = q.opts_html[i] ?? '';
        el.innerHTML = html ? renderJa(html) : escapeHtml(q.opts[i] ?? '');
      });
      const fb = card.querySelector<HTMLElement>('.feedback');
      if (fb && gradedSet.has(qid)) {
        const picked = pickedMap.get(qid)!;
        fb.innerHTML = renderFeedback(q, picked);
      }
    });
  }, { signal });

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
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
      fb.innerHTML = renderFeedback(q, picked);
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      recordListenAnswer(examId, qid, picked, picked === q.correct);
    }
  }, { signal });
}
