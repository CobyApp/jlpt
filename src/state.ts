const KEY_PROGRESS = 'jlpt:progress';
const KEY_LAST = 'jlpt:last';
const KEY_SETTINGS = 'jlpt:settings';
const KEY_WORDBOOK = 'jlpt:wordbook';
const KEY_SRS = 'jlpt:srs';

export interface AnswerRec { picked: number; correct: boolean; ts: number }
export type ExamProgress = Record<number, AnswerRec>;
export type AllProgress = Record<string, ExamProgress>;

export interface LastPos { examId: string; questionN: number; ts: number }
export interface Settings { furigana: boolean; dark: boolean }

const DEFAULT_SETTINGS: Settings = { furigana: false, dark: false };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn('[state] localStorage write failed:', e);
  }
}

export function recordAnswer(examId: string, n: number, picked: number, correct: boolean) {
  const all = read<AllProgress>(KEY_PROGRESS, {});
  if (!all[examId]) all[examId] = {};
  all[examId][n] = { picked, correct, ts: Date.now() };
  write(KEY_PROGRESS, all);
}

export function getProgress(examId: string): ExamProgress {
  return read<AllProgress>(KEY_PROGRESS, {})[examId] ?? {};
}

export function setLast(examId: string, questionN: number) {
  write(KEY_LAST, { examId, questionN, ts: Date.now() });
}

export function getLast(): LastPos | null {
  return read<LastPos | null>(KEY_LAST, null);
}

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY_SETTINGS, {}) };
}

export function setSettings(patch: Partial<Settings>) {
  write(KEY_SETTINGS, { ...getSettings(), ...patch });
}

// ─── Wordbook ──────────────────────────────────────────────────────────
export interface WordbookEntry { w: string; ts: number }

export function getWordbook(): WordbookEntry[] {
  const raw = read<unknown>(KEY_WORDBOOK, []);
  if (!Array.isArray(raw)) return [];
  // Backward-compat: support legacy shape (string[] of words).
  return raw
    .map((x): WordbookEntry | null => {
      if (typeof x === 'string') return { w: x, ts: 0 };
      if (x && typeof x === 'object' && typeof (x as any).w === 'string') {
        return { w: (x as any).w, ts: typeof (x as any).ts === 'number' ? (x as any).ts : 0 };
      }
      return null;
    })
    .filter((x): x is WordbookEntry => !!x);
}

export function isInWordbook(w: string): boolean {
  return getWordbook().some((e) => e.w === w);
}

export function addToWordbook(w: string) {
  if (!w) return;
  const list = getWordbook();
  if (list.some((e) => e.w === w)) return;
  list.push({ w, ts: Date.now() });
  write(KEY_WORDBOOK, list);
}

export function removeFromWordbook(w: string) {
  const list = getWordbook().filter((e) => e.w !== w);
  write(KEY_WORDBOOK, list);
}

export function toggleWordbook(w: string): boolean {
  if (isInWordbook(w)) {
    removeFromWordbook(w);
    return false;
  }
  addToWordbook(w);
  return true;
}

export function clearWordbook() {
  write(KEY_WORDBOOK, []);
}

// ─── SRS (Spaced Repetition) ──────────────────────────────────────────
/**
 * Per-word study state.
 *  level: -1 = never reviewed, 0..5 = mastery level (5 = mastered)
 *  seen: total times shown
 *  correct: total times marked "알아요"
 *  wrong: total times marked "모르겠어요"
 *  lastTs: last review timestamp
 */
export interface SrsRec {
  level: number;
  seen: number;
  correct: number;
  wrong: number;
  lastTs: number;
}

const DEFAULT_SRS: SrsRec = { level: -1, seen: 0, correct: 0, wrong: 0, lastTs: 0 };

export function getAllSrs(): Record<string, SrsRec> {
  return read<Record<string, SrsRec>>(KEY_SRS, {});
}

export function getSrs(w: string): SrsRec {
  return getAllSrs()[w] ?? { ...DEFAULT_SRS };
}

export type SrsAction = 'again' | 'skip' | 'easy';

export function recordSrs(w: string, action: SrsAction) {
  const all = getAllSrs();
  const cur = all[w] ?? { ...DEFAULT_SRS };
  cur.seen += 1;
  cur.lastTs = Date.now();
  if (action === 'again') {
    cur.wrong += 1;
    cur.level = Math.max(0, cur.level >= 0 ? cur.level - 1 : 0);
  } else if (action === 'easy') {
    cur.correct += 1;
    cur.level = Math.min(5, cur.level < 0 ? 1 : cur.level + 1);
  } else {
    // skip — count seen only, bump unseen→0
    if (cur.level < 0) cur.level = 0;
  }
  all[w] = cur;
  write(KEY_SRS, all);
}

export function clearSrs() { write(KEY_SRS, {}); }
export function clearSrsFor(words: string[]) {
  const all = getAllSrs();
  for (const w of words) delete all[w];
  write(KEY_SRS, all);
}
