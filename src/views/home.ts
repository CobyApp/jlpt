import { loadIndex } from '../lib/data';
import { escapeHtml } from '../lib/html';
import { getProgress, getLast } from '../state';
import { ALL_CATEGORIES, categoryKo } from '../lib/categories';

export async function renderHome(root: HTMLElement) {
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  const idx = await loadIndex();
  const last = getLast();
  const totalQuestions = idx.exams.reduce((sum, e) => sum + e.questions, 0);
  const answeredTotal = idx.exams.reduce((sum, e) => sum + Object.keys(getProgress(e.id)).length, 0);

  const cards = idx.exams.map((e) => {
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
    ? `<a class="resume" href="#/exam/${last.examId}/q/${last.questionN}"><strong>이어서 풀기</strong><span>${last.examId} · 문제 ${last.questionN}</span></a>`
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

  root.innerHTML = `
    <div class="app-shell">
      <header class="hero home-hero">
        <div>
          <p class="hero-kicker">JLPT N1 Study Deck</p>
          <h1>오늘도 한 회차씩, 선명하게.</h1>
          <p class="hero-copy">회차별 문제와 한국어 해설, 단어 팝오버를 한 화면에서 집중해서 학습하세요.</p>
        </div>
        ${resume}
      </header>
      <section class="dashboard-stats" aria-label="학습 요약">
        <div class="stat-card">
          <span>회차</span>
          <strong>${idx.exams.length}개</strong>
        </div>
        <div class="stat-card">
          <span>문제</span>
          <strong>총 ${totalQuestions}문제</strong>
        </div>
        <div class="stat-card">
          <span>진도</span>
          <strong>${answeredTotal}/${totalQuestions}</strong>
        </div>
      </section>
      <section class="home-section">
        <div class="section-heading"><h2>회차별 풀이</h2><span class="section-sub">최신 모의고사부터 차례로</span></div>
        <div class="cards">${cards}</div>
      </section>
      <section class="home-section">
        <div class="section-heading"><h2>영역별 모음</h2><span class="section-sub">전 회차에서 같은 유형만 모아 풀기</span></div>
        ${catSection}
      </section>
    </div>`;
}
