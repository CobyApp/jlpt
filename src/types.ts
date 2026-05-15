export interface IndexEntry {
  id: string;
  title: string;
  file: string;
  questions: number;
  passages: number;
  source: string;
  listening_questions?: number;
  listening_subsections?: number;
}

export interface IndexFile {
  generated_at: string;
  exams: IndexEntry[];
  vocab: { file: string; count: number; source: string };
  kanji_n1: { file: string; count: number; source: string };
  kanji_all: { file: string; count: number; source: string };
  category_totals?: Record<string, number>;
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
  listening?: Listening;
}

export interface VocabEntry { w: string; r: string; m: string; m_ko?: string }

export interface Listening {
  section_url: string;
  title: string;
  subsections: ListeningSubsection[];
}

export interface ListeningSubsection {
  order: number;
  title: string;
  english_title: string;
  type: string;
  intro_html: string;
  audio_url: string;
  audio_source_url?: string;
  questions: ListeningQuestion[];
}

export interface ListeningQuestion {
  id: string;
  n: number;
  opts: string[];
  opts_html: string[];
  correct: number;
  script_html: string;
  translation_en: string;
  translation_ko?: string;
  explanation_en: string;
  expl_ko?: string;
  points?: number;
}
