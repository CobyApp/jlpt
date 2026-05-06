import { describe, it, expect } from 'vitest';
import { parseRoute } from '../src/router';

describe('parseRoute', () => {
  it('home', () => {
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('')).toEqual({ name: 'home' });
  });
  it('exam', () => {
    expect(parseRoute('#/exam/n1_2025-07')).toEqual({ name: 'exam', examId: 'n1_2025-07' });
  });
  it('question with from/to', () => {
    expect(parseRoute('#/exam/n1_2025-07/q/3?from=1&to=6')).toEqual({
      name: 'question', examId: 'n1_2025-07', n: 3, from: 1, to: 6,
    });
  });
  it('question without range', () => {
    expect(parseRoute('#/exam/x/q/10')).toEqual({ name: 'question', examId: 'x', n: 10 });
  });
  it('falls back to home for non-numeric question n', () => {
    expect(parseRoute('#/exam/x/q/abc')).toEqual({ name: 'home' });
  });
  it('falls back to home for unrecognized path', () => {
    expect(parseRoute('#/garbage')).toEqual({ name: 'home' });
  });
  it('wordbook', () => {
    expect(parseRoute('#/wordbook')).toEqual({ name: 'wordbook' });
  });
  it('wordlist with multiple sections', () => {
    const r = parseRoute('#/exam/n1_2025-07/words?sections=Kanji%20Reading,Usage');
    expect(r).toEqual({
      name: 'wordlist',
      examId: 'n1_2025-07',
      sections: ['Kanji Reading', 'Usage'],
    });
  });
  it('wordlist with legacy single section param', () => {
    const r = parseRoute('#/exam/n1_2025-07/words?section=Kanji%20Reading');
    expect(r).toEqual({
      name: 'wordlist',
      examId: 'n1_2025-07',
      sections: ['Kanji Reading'],
    });
  });
  it('wordlist without filters', () => {
    expect(parseRoute('#/exam/x/words')).toEqual({ name: 'wordlist', examId: 'x' });
  });
});
