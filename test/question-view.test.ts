import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderQuestion } from '../src/views/question';
import { _resetCache } from '../src/lib/data';

beforeEach(() => {
  _resetCache();
  globalThis.fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        exams: [{ id: 'exam-a', title: 'Exam A', file: 'exams/exam-a.json', questions: 4, passages: 0, source: '' }],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        test_id: 'exam-a',
        title: 'Exam A',
        source_url: '',
        scraped_at: '',
        passages: {},
        questions: [
          { n: 1, id: 'q1', passage: null, stem: '一', opts: ['a', 'b'], correct: 0, category: 'Kanji Reading', expl: '' },
          { n: 2, id: 'q2', passage: null, stem: '二', opts: ['a', 'b'], correct: 0, category: 'Kanji Reading', expl: '' },
          { n: 3, id: 'q3', passage: null, stem: '三', opts: ['a', 'b'], correct: 0, category: 'Kanji Reading', expl: '' },
          { n: 4, id: 'q4', passage: null, stem: '四', opts: ['a', 'b'], correct: 0, category: 'Kanji Reading', expl: '' },
        ],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }) as any;
});

describe('renderQuestion', () => {
  it('renders a range progress indicator for the current question', async () => {
    const root = document.createElement('div');
    await renderQuestion(root, 'exam-a', 2, 1, 4);

    const progress = root.querySelector('.qhdr-progress');
    expect(progress).not.toBeNull();
    expect(progress?.getAttribute('aria-valuenow')).toBe('50');
    expect(root.textContent).toContain('2 / 4');
  });
});
