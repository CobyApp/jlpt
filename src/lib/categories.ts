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
};

export interface CategoryDef {
  slug: string;
  category: string;
  group: '어휘' | '문법' | '독해';
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
];

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
