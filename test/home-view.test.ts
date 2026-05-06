import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHome } from '../src/views/home';
import { _resetCache } from '../src/lib/data';

beforeEach(() => {
  _resetCache();
  localStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      generated_at: '2026-04-29T00:00:00Z',
      exams: [
        {
          id: 'exam-a',
          title: 'JLPT N1 Mock Test - December 2024',
          file: 'exams/exam-a.json',
          questions: 10,
          passages: 2,
          source: '',
        },
      ],
    }),
  }) as any;
});

describe('renderHome', () => {
  it('renders the redesigned dashboard shell and progress meter', async () => {
    localStorage.setItem('jlpt:progress', JSON.stringify({
      'exam-a': {
        1: { picked: 0, correct: true, ts: 1 },
        2: { picked: 1, correct: false, ts: 2 },
      },
    }));

    const root = document.createElement('div');
    await renderHome(root);

    expect(root.querySelector('.app-shell')).not.toBeNull();
    expect(root.querySelector('.home-kicker')?.textContent).toContain('JLPT N1');
    expect(root.querySelectorAll('.tab')).toHaveLength(2);
    expect(root.querySelector('.home-progress')?.getAttribute('aria-valuenow')).toBe('20');
    expect(root.querySelector('[data-pane="exams"]')?.classList.contains('is-hidden')).toBe(false);
    expect(root.querySelector('[data-pane="cats"]')?.classList.contains('is-hidden')).toBe(true);
    expect(root.querySelector('.progress-track')?.getAttribute('aria-valuenow')).toBe('20');
    expect(root.textContent).toContain('정답률 50%');
  });
});
