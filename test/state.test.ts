import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordAnswer, getProgress, setLast, getLast, getSettings, setSettings,
  getWordbook, addToWordbook, removeFromWordbook, isInWordbook, toggleWordbook, clearWordbook,
  getSrs, recordSrs, clearSrs,
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

describe('SRS', () => {
  it('default state for unseen word', () => {
    expect(getSrs('未見').level).toBe(-1);
    expect(getSrs('未見').seen).toBe(0);
  });

  it('easy → level up, capped at 5', () => {
    for (let i = 0; i < 7; i++) recordSrs('判断', 'easy');
    const s = getSrs('判断');
    expect(s.level).toBe(5);
    expect(s.correct).toBe(7);
    expect(s.seen).toBe(7);
  });

  it('again → level down, floor 0', () => {
    recordSrs('概念', 'easy');
    recordSrs('概念', 'easy');
    expect(getSrs('概念').level).toBe(2);
    recordSrs('概念', 'again');
    expect(getSrs('概念').level).toBe(1);
    recordSrs('概念', 'again');
    expect(getSrs('概念').level).toBe(0);
    recordSrs('概念', 'again');
    expect(getSrs('概念').level).toBe(0); // floor
    expect(getSrs('概念').wrong).toBe(3);
  });

  it('skip → seen++ but no level change', () => {
    recordSrs('観点', 'skip');
    expect(getSrs('観点').level).toBe(0); // bumped from -1 to 0
    expect(getSrs('観点').seen).toBe(1);
    recordSrs('観点', 'easy');
    expect(getSrs('観点').level).toBe(1);
    recordSrs('観点', 'skip');
    expect(getSrs('観点').level).toBe(1); // unchanged
  });

  it('clearSrs', () => {
    recordSrs('w1', 'easy');
    clearSrs();
    expect(getSrs('w1').level).toBe(-1);
  });
});
