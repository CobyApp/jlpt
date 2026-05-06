export interface IndexEntry {
  id: string;
  title: string;
  file: string;
  questions: number;
  passages: number;
  source: string;
}

export interface IndexFile {
  generated_at: string;
  exams: IndexEntry[];
  vocab: { file: string; count: number; source: string };
  kanji_n1: { file: string; count: number; source: string };
  kanji_all: { file: string; count: number; source: string };
}

export interface Passage { ja: string; en: string; ko?: string }
export type Passages = Record<string, Passage>;

export interface Question {
  n: number;
  id: string;
  passage: string | null;
  stem: string;
  stem_u?: string;
  opts: string[];
  correct: number;
  category: string;
  expl: string;
  expl_ko?: string;
  src_label?: string;
  src_n?: number;
}

export interface Exam {
  test_id: string;
  title: string;
  source_url: string;
  scraped_at: string;
  passages: Passages;
  questions: Question[];
}

export interface VocabEntry { w: string; r: string; m: string; m_ko?: string }
