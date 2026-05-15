"""
청해 expl_ko 작성용 입력/출력 파일 준비.

각 회차의 listening을 mondai별로 5개 텍스트 파일로 쪼개서 저장.
Agent가 Read tool로 한 번에 읽기 좋은 크기로(< 25K tokens).

입력: /tmp/listen-input/<exam_id>/m<1..5>.txt
출력: /tmp/listen-output/<exam_id>.json = {question_id: expl_ko_string}
"""
from __future__ import annotations
import json, re, glob, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_DIR = ROOT / 'scripts' / '.expl-input'
OUT_DIR = ROOT / 'scripts' / '.expl-output'
IN_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)


def strip_html(html: str) -> str:
    if not html:
        return ""
    s = re.sub(r'<rt>.*?</rt>', '', html, flags=re.S)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</(p|div|li|h[1-6])>', '\n\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\n{3,}', '\n\n', s).strip()
    return s


def wrap_long(text: str, width: int = 60) -> str:
    out_lines = []
    for line in text.split('\n'):
        if len(line) <= width:
            out_lines.append(line)
            continue
        for i in range(0, len(line), width):
            out_lines.append(line[i:i + width])
    return '\n'.join(out_lines)


def main():
    # Clean stale
    import shutil
    if IN_DIR.exists():
        shutil.rmtree(IN_DIR)
    IN_DIR.mkdir(parents=True, exist_ok=True)

    for path in sorted(glob.glob(str(ROOT / 'data/n1_corpus/exams/n1_*.json'))):
        exam_id = os.path.basename(path).replace('.json', '')
        d = json.load(open(path))
        L = d.get('listening')
        if not L:
            continue
        exam_dir = IN_DIR / exam_id
        exam_dir.mkdir(parents=True, exist_ok=True)

        per_exam_sizes = []
        for sub in L['subsections']:
            mondai = sub['order']
            mtype = sub.get('type', '')

            # Decide whether questions share a single script (Whisper-transcribed mondai-level)
            # or each has its own (nihonez per-question split).
            scripts = [strip_html(q.get('script_html', '')) for q in sub['questions']]
            non_empty = [s for s in scripts if s]
            all_same = len(set(non_empty)) <= 1
            shared_script = non_empty[0] if (all_same and non_empty) else ''

            lines = [
                f'EXAM: {exam_id}',
                f'MONDAI: {mondai} ({mtype})',
                f'QUESTIONS: {len(sub["questions"])}',
                '',
            ]
            if shared_script:
                lines.append('[MONDAI_SCRIPT_JA] (전체 mondai 음성의 전사. 각 question의 정답 단서는 이 안에서 찾을 것)')
                lines.append(wrap_long(shared_script, 60))
                lines.append('')

            for q in sub['questions']:
                lines.append('=' * 60)
                lines.append(f'QID: {q["id"]}  |  local#{q["n"]}  |  mondai {mondai}')
                lines.append('-' * 60)
                lines.append('[OPTIONS]')
                for i, o in enumerate(q['opts']):
                    lines.append(f'  {i + 1}. {o}')
                correct_text = q['opts'][q['correct']] if 0 <= q['correct'] < len(q['opts']) else ''
                lines.append(f'[CORRECT] {q["correct"] + 1}  ({correct_text})')
                # Per-question script when scripts differ (nihonez split per question).
                if not shared_script:
                    qscript = strip_html(q.get('script_html', ''))
                    if qscript:
                        lines.append('[SCRIPT_JA]')
                        lines.append(wrap_long(qscript, 60))
                lines.append('')

            out_path = exam_dir / f'm{mondai}.txt'
            out_path.write_text('\n'.join(lines), encoding='utf-8')
            per_exam_sizes.append((mondai, len(sub['questions']), len(lines), out_path.stat().st_size // 1024))

        sz_str = ', '.join(f'm{m}={q}q/{l}ln/{kb}KB' for m, q, l, kb in per_exam_sizes)
        print(f'{exam_id}: {sz_str}')


if __name__ == '__main__':
    main()
