const MAP: Record<string, string> = {
  'Kanji Reading': '한자 읽기',
  'Contextually-defined Expressions': '문맥 규정',
  'Paraphrases': '유의 표현',
  'Usage': '용법',
  'Sentential Grammar 1 (Selecting grammar form)': '문법 형식 판단',
  'Sentential Grammar 2 (Sentence composition)': '문장 만들기',
  'Text Grammar': '글의 문법',
  'Comprehension (Short passages)': '단문 독해',
  'Comprehension (Mid-size passages)': '중간 길이 독해',
  'Comprehension (Long passages)': '장문 독해',
  'Integrated Comprehension': '통합 이해',
  'Thematic Comprehension': '주장 이해',
  'Information Retrieval': '정보 검색',
  // Listening pseudo-categories (used by 영역별 모아풀기). The "category"
  // for listening is the mondai type slug from nihonez. Stored as Korean
  // labels here so categoryKo() works the same way for reading + listening.
  'task-based-comprehension': '청해 — 과제 이해',
  'comprehension-of-key-points': '청해 — 포인트 이해',
  'comprehension-general-outline': '청해 — 개요 이해',
  'quick-response': '청해 — 즉시 응답',
  'listening-integrated-comprehension': '청해 — 통합 이해',
};

export interface CategoryDef {
  slug: string;
  category: string;
  group: '어휘' | '문법' | '독해' | '청해';
}

export const ALL_CATEGORIES: CategoryDef[] = [
  { slug: 'kanji-reading', category: 'Kanji Reading', group: '어휘' },
  { slug: 'contextual', category: 'Contextually-defined Expressions', group: '어휘' },
  { slug: 'paraphrases', category: 'Paraphrases', group: '어휘' },
  { slug: 'usage', category: 'Usage', group: '어휘' },
  { slug: 'grammar-form', category: 'Sentential Grammar 1 (Selecting grammar form)', group: '문법' },
  { slug: 'sentence-build', category: 'Sentential Grammar 2 (Sentence composition)', group: '문법' },
  { slug: 'text-grammar', category: 'Text Grammar', group: '문법' },
  { slug: 'short-passage', category: 'Comprehension (Short passages)', group: '독해' },
  { slug: 'mid-passage', category: 'Comprehension (Mid-size passages)', group: '독해' },
  { slug: 'long-passage', category: 'Comprehension (Long passages)', group: '독해' },
  { slug: 'integrated', category: 'Integrated Comprehension', group: '독해' },
  { slug: 'thematic', category: 'Thematic Comprehension', group: '독해' },
  { slug: 'info-retrieval', category: 'Information Retrieval', group: '독해' },
  { slug: 'listen-task', category: 'task-based-comprehension', group: '청해' },
  { slug: 'listen-key', category: 'comprehension-of-key-points', group: '청해' },
  { slug: 'listen-outline', category: 'comprehension-general-outline', group: '청해' },
  { slug: 'listen-quick', category: 'quick-response', group: '청해' },
  { slug: 'listen-integrated', category: 'listening-integrated-comprehension', group: '청해' },
];

/** Slugs that correspond to listening mondai types (used to route to listening view). */
export const LISTENING_SLUGS = new Set([
  'listen-task',
  'listen-key',
  'listen-outline',
  'listen-quick',
  'listen-integrated',
]);

/** Map listening slug → mondai type (matches `listening.subsections[].type`). */
export function listeningTypeFromSlug(slug: string): string | null {
  const c = ALL_CATEGORIES.find((c) => c.slug === slug);
  return c && c.group === '청해' ? c.category : null;
}

const SLUG_TO_CATEGORY = Object.fromEntries(ALL_CATEGORIES.map((c) => [c.slug, c.category]));

export function categoryKo(en: string): string {
  return MAP[en] ?? en;
}

export function categoryFromSlug(slug: string): string | null {
  return SLUG_TO_CATEGORY[slug] ?? null;
}

export function sectionLabelKo(num: number, category: string): string {
  return `問題${num} ${categoryKo(category)}`;
}
