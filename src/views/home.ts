import { loadIndex } from '../lib/data';
import { escapeHtml } from '../lib/html';
import { getProgress, getLast } from '../state';
import { ALL_CATEGORIES, categoryKo } from '../lib/categories';

type HomeTab = 'exams' | 'cats';

const TAB_KEY = 'jlpt:home-tab';

function loadTab(): HomeTab {
  const v = localStorage.getItem(TAB_KEY);
  return v === 'cats' ? 'cats' : 'exams';
}

function saveTab(t: HomeTab) {
  localStorage.setItem(TAB_KEY, t);
}

export async function renderHome(root: HTMLElement) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const idx = await loadIndex();
  const last = getLast();
  const totalQuestions = idx.exams.reduce((sum, e) => sum + e.questions, 0);
  const answeredTotal = idx.exams.reduce(
    (sum, e) => sum + Object.keys(getProgress(e.id)).length,
    0,
  );
  const overallProgress = totalQuestions
    ? Math.round((answeredTotal / totalQuestions) * 100)
    : 0;

  const examCards = idx.exams.map((e) => {
    const prog = getProgress(e.id);
    const answered = Object.keys(prog).length;
    const correct = Object.values(prog).filter((p) => p.correct).length;
    const progress = e.questions ? Math.round((answered / e.questions) * 100) : 0;
    const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
    return `
      <a class="card exam-card" href="#/exam/${e.id}">
        <div class="card-topline">
          <span class="card-badge">Mock Test</span>
          <span class="card-meta">${e.questions}문제 · ${e.passages}지문</span>
        </div>
        <div class="card-title">${escapeHtml(e.title)}</div>
        <div class="progress-track" role="progressbar" aria-label="${escapeHtml(e.title)} 학습 진도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <span style="width: ${progress}%"></span>
        </div>
        <div class="card-foot">
          <span>${answered}/${e.questions} 완료</span>
          <span>정답률 ${accuracy}%</span>
        </div>
      </a>`;
  }).join('');

  const resume = last
    ? `<a class="resume-pill" href="#/exam/${last.examId}/q/${last.questionN}">
         <span class="resume-pill-label">이어서 풀기</span>
         <span class="resume-pill-meta">${escapeHtml(last.examId)} · 문제 ${last.questionN}</span>
         <span class="resume-pill-arrow">→</span>
       </a>`
    : '';

  const categoriesByGroup = ALL_CATEGORIES.reduce<Record<string, typeof ALL_CATEGORIES>>((acc, c) => {
    (acc[c.group] ||= []).push(c);
    return acc;
  }, {});

  const catSection = Object.entries(categoriesByGroup).map(([group, cats]) => {
    const cards = cats.map((c) => {
      const examId = `cat:${c.slug}`;
      const prog = getProgress(examId);
      const answered = Object.keys(prog).length;
      return `
        <a class="card cat-card" href="#/exam/${examId}">
          <span class="cat-group">${escapeHtml(group)}</span>
          <h3 class="cat-name">${escapeHtml(categoryKo(c.category))}</h3>
          <span class="cat-meta">${answered ? `${answered}문제 풀었음` : '아직 학습 전'}</span>
        </a>`;
    }).join('');
    return `
      <div class="cat-group-block">
        <h3 class="cat-group-label">${escapeHtml(group)}</h3>
        <div class="cat-grid">${cards}</div>
      </div>`;
  }).join('');

  const tab = loadTab();

  root.innerHTML = `
    <div class="app-shell">
      <header class="home-bar">
        <div class="home-bar-title">
          <span class="home-kicker">JLPT N1</span>
          <h1 class="home-title">오늘도 한 회차씩, 선명하게.</h1>
        </div>
        <div class="home-bar-meta">
          <div class="home-progress" role="progressbar" aria-label="전체 진도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${overallProgress}">
            <div class="home-progress-track"><i style="width:${overallProgress}%"></i></div>
            <span class="home-progress-label">${answeredTotal}<small>/${totalQuestions}</small></span>
          </div>
          ${resume}
        </div>
      </header>

      <nav class="tab-bar" role="tablist" aria-label="학습 모드">
        <button class="tab ${tab === 'exams' ? 'is-active' : ''}" role="tab" data-tab="exams" aria-selected="${tab === 'exams'}">회차별 풀이</button>
        <button class="tab ${tab === 'cats' ? 'is-active' : ''}" role="tab" data-tab="cats" aria-selected="${tab === 'cats'}">영역별 모아풀기</button>
      </nav>

      <section class="tab-pane ${tab === 'exams' ? '' : 'is-hidden'}" data-pane="exams" role="tabpanel">
        <div class="cards">${examCards}</div>
      </section>

      <section class="tab-pane ${tab === 'cats' ? '' : 'is-hidden'}" data-pane="cats" role="tabpanel">
        ${catSection}
      </section>
    </div>`;

  const tabs = root.querySelectorAll<HTMLButtonElement>('.tab');
  const panes = root.querySelectorAll<HTMLElement>('.tab-pane');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = (btn.dataset.tab as HomeTab) || 'exams';
      saveTab(next);
      tabs.forEach((b) => {
        const active = b.dataset.tab === next;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      panes.forEach((p) => {
        const active = p.dataset.pane === next;
        p.classList.toggle('is-hidden', !active);
        if (active) {
          // Re-trigger fade animation on tab switch
          p.classList.remove('tab-pane-enter');
          // force reflow
          void p.offsetWidth;
          p.classList.add('tab-pane-enter');
        }
      });
    });
  });
}
