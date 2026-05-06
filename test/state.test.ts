import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordAnswer, getProgress, setLast, getLast, getSettings, setSettings,
  getWordbook, addToWordbook, removeFromWordbook, isInWordbook, toggleWordbook, clearWordbook,
} from '../src/state';

beforeEach(() => localStorage.clear());

describe('state', () => {
  it('records and retrieves answers', () => {
    recordAnswer('exam-a', 1, 2, true);
    const p = getProgress('exam-a');
    expect(p[1]).toMatchObject({ picked: 2, correct: true });
    expect(typeof p[1].ts).toBe('number');
  });

  it('last position roundtrip', () => {
    setLast('exam-b', 5);
    expect(getLast()).toMatchObject({ examId: 'exam-b', questionN: 5 });
  });

  it('settings default + roundtrip', () => {
    expect(getSettings()).toEqual({ furigana: false, dark: false });
    setSettings({ furigana: true });
    expect(getSettings().furigana).toBe(true);
    expect(getSettings().dark).toBe(false);
  });
});

describe('wordbook', () => {
  it('add / contains / remove', () => {
    expect(getWordbook()).toEqual([]);
    addToWordbook('判断能力');
    expect(isInWordbook('判断能力')).toBe(true);
    expect(getWordbook()).toHaveLength(1);
    removeFromWordbook('判断能力');
    expect(isInWordbook('判断能力')).toBe(false);
    expect(getWordbook()).toEqual([]);
  });

  it('add is idempotent — same word twice = single entry', () => {
    addToWordbook('概念');
    addToWordbook('概念');
    expect(getWordbook()).toHaveLength(1);
  });

  it('toggle returns new state', () => {
    expect(toggleWordbook('普遍')).toBe(true);
    expect(isInWordbook('普遍')).toBe(true);
    expect(toggleWordbook('普遍')).toBe(false);
    expect(isInWordbook('普遍')).toBe(false);
  });

  it('clear empties the wordbook', () => {
    addToWordbook('a');
    addToWordbook('b');
    clearWordbook();
    expect(getWordbook()).toEqual([]);
  });

  it('migrates legacy string[] payload to {w, ts} shape', () => {
    localStorage.setItem('jlpt:wordbook', JSON.stringify(['古い', '新しい']));
    const list = getWordbook();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ w: '古い', ts: 0 });
  });
});
