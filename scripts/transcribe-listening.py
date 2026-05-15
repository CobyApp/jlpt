"""
청해 mp3를 Whisper로 일본어 전사 + exam JSON의 script_html에 주입.

전제:
    `.venv/bin/pip install faster-whisper`
    mp3는 data/n1_corpus/audio/<exam_id>/<type>.mp3 에 위치

전략:
    각 mondai mp3 1개를 통째로 large-v3 모델로 일본어 전사 → 그 mondai의 모든 질문(script_html이 비어있는 것만)에 동일 텍스트를 채워 넣음. (질문별 분할은 어려워서 보류; agent가 정답 단서를 본문에서 찾도록.)

사용법:
    .venv/bin/python scripts/transcribe-listening.py               # script_html이 비어있는 mondai만
    .venv/bin/python scripts/transcribe-listening.py --force       # 모든 mondai 재전사
    .venv/bin/python scripts/transcribe-listening.py n1_2024-12    # 특정 회차만

캐시: scripts/.transcribe-cache.json (mp3 경로 → 텍스트).
"""
from __future__ import annotations
import argparse, json, os, sys, html
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMS = ROOT / 'data' / 'n1_corpus' / 'exams'
AUDIO = ROOT / 'data' / 'n1_corpus' / 'audio'
CACHE = ROOT / 'scripts' / '.transcribe-cache.json'


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding='utf-8'))
    return {}


def save_cache(c: dict):
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=0), encoding='utf-8')


def transcribe_file(model, mp3_path: Path) -> str:
    """Return full transcript (joined segments)."""
    segments, info = model.transcribe(
        str(mp3_path),
        language='ja',
        beam_size=5,
        condition_on_previous_text=False,  # speaker turns, safer
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )
    # Force iteration; faster-whisper segments is a generator
    parts = []
    for seg in segments:
        parts.append(seg.text.strip())
    return '\n'.join(parts).strip()


def text_to_script_html(text: str) -> str:
    """Wrap plain transcript into the same HTML envelope as nihonez (jlpt-passages > passage)."""
    if not text:
        return ''
    # Split by newlines into paragraphs (each segment was a line)
    paras = [html.escape(p) for p in text.split('\n') if p.strip()]
    body = '<br>'.join(paras)
    return f'<div class="jlpt-passages"><div class="passage">{body}</div></div>'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('exam_ids', nargs='*', help='특정 회차만 처리 (생략 시 전체)')
    ap.add_argument('--force', action='store_true', help='이미 script_html 있는 mondai도 재전사')
    ap.add_argument('--model', default='large-v3', help='Whisper 모델 (default: large-v3)')
    ap.add_argument('--compute-type', default='auto', help='int8 / float16 / float32 / auto')
    args = ap.parse_args()

    # Lazy import for fast --help
    from faster_whisper import WhisperModel
    print(f'[whisper] loading model {args.model} (compute_type={args.compute_type}) ...')
    model = WhisperModel(args.model, device='auto', compute_type=args.compute_type)

    cache = load_cache()
    files = sorted(EXAMS.glob('n1_*.json'))
    if args.exam_ids:
        files = [f for f in files if f.stem in args.exam_ids]
    print(f'targets: {[f.stem for f in files]}')

    for exam_path in files:
        exam = json.loads(exam_path.read_text(encoding='utf-8'))
        L = exam.get('listening')
        if not L:
            continue
        exam_id = exam_path.stem
        for sub in L['subsections']:
            # Check if any question already has script_html
            need = args.force or any(not (q.get('script_html') or '').strip() for q in sub['questions'])
            if not need:
                print(f'  [{exam_id}/{sub["type"]}] skip (all questions already have script_html)')
                continue
            mp3 = AUDIO / exam_id / f'{sub["type"]}.mp3'
            if not mp3.exists():
                print(f'  [{exam_id}/{sub["type"]}] MISSING mp3: {mp3}')
                continue
            key = f'{exam_id}/{sub["type"]}'
            if key in cache and not args.force:
                text = cache[key]
                print(f'  [{key}] cache hit ({len(text)} chars)')
            else:
                print(f'  [{key}] transcribing {mp3.name} ...')
                text = transcribe_file(model, mp3)
                cache[key] = text
                save_cache(cache)
                print(f'  [{key}] -> {len(text)} chars')
            html_block = text_to_script_html(text)
            for q in sub['questions']:
                if not (q.get('script_html') or '').strip() or args.force:
                    q['script_html'] = html_block
        exam_path.write_text(json.dumps(exam, ensure_ascii=False), encoding='utf-8')
        print(f'[{exam_id}] wrote transcripts')


if __name__ == '__main__':
    main()
