import { onRouteChange } from './router';
import { renderHome } from './views/home';
import { renderExam } from './views/exam';
import { renderQuestion } from './views/question';
import { renderWordbook } from './views/wordbook';
import { renderWordlist } from './views/wordlist';
import { escapeHtml } from './lib/html';

const root = document.getElementById('app')!;

onRouteChange(async (route) => {
  try {
    if (route.name === 'home') await renderHome(root);
    else if (route.name === 'wordbook') await renderWordbook(root);
    else if (route.name === 'exam') await renderExam(root, route.examId);
    else if (route.name === 'wordlist') await renderWordlist(root, route.examId, { sections: route.sections, from: route.from, to: route.to });
    else if (route.name === 'question') await renderQuestion(root, route.examId, route.n, route.from, route.to);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    root.innerHTML = `
      <div class="error-banner">
        <h2>로드 실패</h2>
        <p>데이터를 불러오지 못했습니다: <code>${escapeHtml(msg)}</code></p>
        <p><a href="#/">← 홈으로</a></p>
      </div>`;
    console.error('[main] route render failed:', e);
  }
});
