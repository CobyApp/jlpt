"""
/tmp/listen-output/<exam_id>.json (= {question_id: expl_ko}) 들을 읽어
data/n1_corpus/exams/<exam_id>.json 의 listening 각 question에 expl_ko 필드 주입.

사용:
    python3 scripts/apply-listen-expl.py            # 전체
    python3 scripts/apply-listen-expl.py n1_2025-07 # 특정 회차
"""
from __future__ import annotations
import json, sys, glob, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'scripts' / '.expl-output'


def main():
    targets = sys.argv[1:]
    files = sorted(glob.glob(str(ROOT / 'data/n1_corpus/exams/n1_*.json')))
    if targets:
        files = [f for f in files if Path(f).stem in targets]
    total_q = 0
    for path in files:
        exam_id = Path(path).stem
        out_path = OUT_DIR / f'{exam_id}.json'
        if not out_path.exists():
            print(f'  [{exam_id}] no output file, skip')
            continue
        outputs = json.loads(out_path.read_text(encoding='utf-8'))
        d = json.load(open(path))
        L = d.get('listening')
        if not L:
            continue
        count = 0
        for sub in L['subsections']:
            for q in sub['questions']:
                expl = outputs.get(q['id'])
                if expl:
                    q['expl_ko'] = expl
                    count += 1
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False)
        total_q += count
        print(f'  [{exam_id}] applied expl_ko to {count} questions')
    print(f'total: {total_q} questions updated')


if __name__ == '__main__':
    main()
