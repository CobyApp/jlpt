"""
scripts/.batches/out-*.json 의 번역된 단어들을 vocab.json 에 병합.

기존 vocab.json 을 읽어서 중복(w 기준)을 제거하고 새 항목을 뒤에 추가.
출력은 data/n1_corpus_ko/vocab.json 을 in-place 갱신.
"""
from __future__ import annotations
import json, glob, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / 'data' / 'n1_corpus_ko' / 'vocab.json'
BATCHES_DIR = ROOT / 'scripts' / '.batches'

def main():
    vocab = json.loads(VOCAB.read_text(encoding='utf-8'))
    have = {e['w']: i for i, e in enumerate(vocab) if e.get('w')}
    new_entries = []
    seen_new = set()
    for path in sorted(glob.glob(str(BATCHES_DIR / 'out-*.json'))):
        chunk = json.loads(Path(path).read_text(encoding='utf-8'))
        for e in chunk:
            w = e.get('w')
            if not w: continue
            if w in have or w in seen_new: continue
            # Normalize: ensure required keys exist
            entry = {
                'w': w,
                'r': e.get('r', ''),
                'm': e.get('m', ''),
                'm_ko': e.get('m_ko', ''),
            }
            new_entries.append(entry)
            seen_new.add(w)

    merged = vocab + new_entries
    VOCAB.write_text(json.dumps(merged, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'before: {len(vocab)}  +new: {len(new_entries)}  -> total: {len(merged)}')

    # Length distribution
    from collections import Counter
    cnt = Counter(len(e['w']) for e in merged)
    print('length dist:', sorted(cnt.items()))

if __name__ == '__main__':
    main()
