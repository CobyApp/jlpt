import type { IndexFile, Exam, Passages, Question, VocabEntry } from '../types';
import { categoryFromSlug, categoryKo } from './categories';

const BASE = import.meta.env?.BASE_URL ?? '/';
const url = (path: string) => `${BASE}data/${path}`.replace(/\/+/g, '/');

let indexP: Promise<IndexFile> | null = null;
const examP = new Map<string, Promise<Exam>>();
let vocabP: Promise<VocabEntry[]> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(url(path));
  if (!r.ok) throw new Error(`fetch ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export function loadIndex(): Promise<IndexFile> {
  if (!indexP) indexP = fetchJson<IndexFile>('index.json');
  return indexP;
}

export async function loadExam(id: string): Promise<Exam> {
  if (examP.has(id)) return examP.get(id)!;
  if (id.startsWith('cat:')) {
    const p = loadCategoryAsExam(id.slice(4));
    examP.set(id, p);
    return p;
  }
  const idx = await loadIndex();
  const entry = idx.exams.find((e) => e.id === id);
  if (!entry) throw new Error(`unknown exam: ${id}`);
  const p = fetchJson<Exam>(entry.file);
  examP.set(id, p);
  return p;
}

function shortLabel(title: string): string {
  return title
    .replace(/^JLPT N1 Mock Test\s*[–-]\s*/i, '')
    .replace(/^JLPT Practice Workbook\s*/i, 'Workbook ')
    .trim();
}

async function loadCategoryAsExam(slug: string): Promise<Exam> {
  const cat = categoryFromSlug(slug);
  if (!cat) throw new Error(`unknown category slug: ${slug}`);
  const idx = await loadIndex();
  // Load all underlying exams (skip cat: ids)
  const exams = await Promise.all(
    idx.exams.map((e) => loadExam(e.id)),
  );
  const passages: Passages = {};
  const collected: Question[] = [];
  exams.forEach((e) => {
    const label = shortLabel(e.title);
    e.questions.forEach((q) => {
      if (q.category !== cat) return;
      if (q.passage && e.passages[q.passage]) {
        passages[q.passage] = e.passages[q.passage];
      }
      collected.push({ ...q, src_label: label, src_n: q.n });
    });
  });
  const questions = collected.map((q, i) => ({ ...q, n: i + 1 }));
  return {
    test_id: 'cat:' + slug,
    title: `영역별 모음 — ${categoryKo(cat)}`,
    source_url: '',
    scraped_at: '',
    passages,
    questions,
  };
}

export function loadVocab(): Promise<VocabEntry[]> {
  if (!vocabP) vocabP = fetchJson<VocabEntry[]>('vocab.json');
  return vocabP;
}

export function _resetCache() {
  indexP = null;
  examP.clear();
  vocabP = null;
}
