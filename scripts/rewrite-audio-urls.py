"""
청해 mp3의 audio_url 필드를 새 base URL로 일괄 재작성.

사용법:
    python3 scripts/rewrite-audio-urls.py https://taba.asia/jlpt-audio
    python3 scripts/rewrite-audio-urls.py https://taba.asia/jlpt-audio n1_2025-07

각 exam JSON의 listening.subsections[i].audio_url을
    <base>/<exam_id>/<type>.mp3
형태로 덮어쓴다. audio_source_url(nihonez 원본)과 audio_local_path는 보존.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMS = ROOT / 'data' / 'n1_corpus' / 'exams'


def main():
    if len(sys.argv) < 2:
        print('usage: rewrite-audio-urls.py <base_url> [exam_id ...]', file=sys.stderr)
        sys.exit(1)
    base = sys.argv[1].rstrip('/')
    targets = sys.argv[2:]
    files = sorted(EXAMS.glob('n1_*.json'))
    if targets:
        files = [f for f in files if f.stem in targets]
    for f in files:
        exam = json.loads(f.read_text(encoding='utf-8'))
        if not exam.get('listening'):
            continue
        for sub in exam['listening']['subsections']:
            sub['audio_url'] = f'{base}/{f.stem}/{sub["type"]}.mp3'
        f.write_text(json.dumps(exam, ensure_ascii=False), encoding='utf-8')
        print(f'[{f.stem}] rewrote audio_url -> {base}/{f.stem}/<type>.mp3')


if __name__ == '__main__':
    main()
