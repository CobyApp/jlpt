"""
시험 corpus 전체에서 vocab.json에 빠진 단어 후보를 뽑아낸다.

대상:
  1) 연속한 名詞 (+ 접미사) 토큰을 합친 4+ 글자 한자 합성어 (예: 判断能力, 文学部図書館, 国際化)
  2) 단일 名詞 2+ 글자 (예: 雇用, 抽出)

활용/형용사는 표면형 변형이 많아 단일 매칭이 어려워서 제외.
어휘 매칭기는 정확 일치 기반이므로 명사 위주로만 enrichment 한다.

조건:
  - 이미 vocab.json 에 있는 표제어는 제외
  - 한자/가나만 사용된 형태만 (기호/숫자 배제)
  - 빈도 내림차순 정렬

출력: scripts/.vocab-candidates.json
  [{ "w": str, "r": str (kana reading), "src": "compound"|"noun", "freq": int }, ...]

실행:
  .venv/bin/python scripts/extract-vocab-candidates.py
"""
from __future__ import annotations
import json, re, glob
from pathlib import Path
from collections import Counter
import fugashi

ROOT = Path(__file__).resolve().parent.parent
EXAMS_DIR = ROOT / 'data' / 'n1_corpus_ko' / 'exams'
VOCAB_PATH = ROOT / 'data' / 'n1_corpus_ko' / 'vocab.json'
OUT_PATH = ROOT / 'scripts' / '.vocab-candidates.json'

KANJI_ONLY = re.compile(r'^[一-龯々ヶ]+$')
HAS_KANJI = re.compile(r'[一-龯々ヶ]')
ALL_JP = re.compile(r'^[ぁ-んァ-ヶー一-龯々]+$')

def kata_to_hira(s: str) -> str:
    out = []
    for ch in s:
        c = ord(ch)
        if 0x30A1 <= c <= 0x30F6:
            out.append(chr(c - 0x60))
        else:
            out.append(ch)
    return ''.join(out)

def reading_of(token) -> str:
    # fugashi token.feature.kana / .pron / .lemma (UniDic)
    f = token.feature
    for attr in ('kana', 'pron', 'kanaBase'):
        v = getattr(f, attr, None)
        if v and v != '*':
            return kata_to_hira(v)
    # fallback: surface (already hira/kata)
    return kata_to_hira(token.surface)

def main():
    vocab = json.loads(VOCAB_PATH.read_text(encoding='utf-8'))
    have = {e['w'] for e in vocab if e.get('w')}

    tagger = fugashi.Tagger()
    compounds: Counter[str] = Counter()
    compound_readings: dict[str, str] = {}
    nouns: Counter[str] = Counter()
    noun_readings: dict[str, str] = {}

    NOUN_CHAIN_POS = ('名詞', '接尾辞', '接頭辞')

    for path in sorted(glob.glob(str(EXAMS_DIR / 'n1_*.json'))):
        ex = json.loads(Path(path).read_text(encoding='utf-8'))
        texts: list[str] = []
        for p in ex['passages'].values():
            if p.get('ja'): texts.append(p['ja'])
        for q in ex['questions']:
            if q.get('stem'): texts.append(q['stem'])
            for o in q.get('opts', []): texts.append(o)
        for line in texts:
            if not line: continue
            ws = list(tagger(line))
            i = 0
            while i < len(ws):
                w = ws[i]
                pos = w.feature.pos1
                surf = w.surface
                # noun-chain (incl. 接尾辞) — kanji-only surfaces
                if pos == '名詞' and KANJI_ONLY.match(surf):
                    j = i
                    chunk = ''
                    chunk_read = ''
                    noun_token_count = 0
                    while j < len(ws):
                        wj = ws[j]
                        pj = wj.feature.pos1
                        if pj in NOUN_CHAIN_POS and KANJI_ONLY.match(wj.surface):
                            chunk += wj.surface
                            chunk_read += reading_of(wj)
                            if pj == '名詞':
                                noun_token_count += 1
                            j += 1
                        else:
                            break
                    span = j - i
                    # compound: 2+ tokens including at least one noun, 4+ chars
                    if span >= 2 and noun_token_count >= 1 and len(chunk) >= 4 and chunk not in have:
                        compounds[chunk] += 1
                        compound_readings.setdefault(chunk, chunk_read)
                    # single-noun 2+ chars
                    if span == 1 and len(surf) >= 2 and surf not in have:
                        nouns[surf] += 1
                        noun_readings.setdefault(surf, reading_of(w))
                    i = j
                    continue
                i += 1

    out = []
    for w, n in compounds.most_common():
        out.append({'w': w, 'r': compound_readings.get(w, ''), 'src': 'compound', 'freq': n})
    for w, n in nouns.most_common():
        out.append({'w': w, 'r': noun_readings.get(w, ''), 'src': 'noun', 'freq': n})

    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f'compounds: {len(compounds)}, nouns: {len(nouns)}')
    print(f'total candidates: {len(out)} -> {OUT_PATH}')

if __name__ == '__main__':
    main()
