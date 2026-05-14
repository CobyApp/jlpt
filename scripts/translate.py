"""
JLPT N1 corpus 한국어 번역 파이프라인.

사용법:
    export ANTHROPIC_API_KEY=sk-ant-...
    .venv/bin/python scripts/translate.py [--limit N] [--what vocab|exams|all]

캐시: scripts/.translate-cache.json (멱등성 보장).
출력: data/n1_corpus_ko/ (입력과 같은 스키마, 영문 자리에 한국어 추가).
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, sys
from pathlib import Path
from anthropic import Anthropic

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'n1_corpus'
DST = ROOT / 'data' / 'n1_corpus_ko'
CACHE = ROOT / 'scripts' / '.translate-cache.json'
MODEL = 'claude-haiku-4-5-20251001'

def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding='utf-8'))
    return {}

def save_cache(c: dict):
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=0), encoding='utf-8')

def key(prompt: str) -> str:
    return hashlib.sha256(f'{MODEL}::{prompt}'.encode('utf-8')).hexdigest()[:32]

def call(client: Anthropic, system: str, prompt: str, cache: dict) -> str:
    k = key(system + '|||' + prompt)
    if k in cache:
        return cache[k]
    msg = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=system,
        messages=[{'role': 'user', 'content': prompt}],
    )
    out = msg.content[0].text.strip()
    cache[k] = out
    return out

def translate_vocab(client: Anthropic, cache: dict, limit: int | None):
    src = json.loads((SRC / 'vocab.json').read_text(encoding='utf-8'))
    if limit is not None: src = src[:limit]
    sys_prompt = (
        '당신은 일본어→한국어 사전 번역가입니다. '
        '주어진 일본어 단어와 영어 의미를 보고 자연스러운 한국어 의미로 번역하세요. '
        '여러 의미가 있으면 콤마로 구분. 한국어 의미만 출력 (다른 설명 없이).'
    )
    out = []
    for i, v in enumerate(src):
        prompt = f'단어: {v["w"]}\n읽기: {v["r"]}\n영어 의미: {v["m"]}'
        m_ko = call(client, sys_prompt, prompt, cache)
        out.append({**v, 'm_ko': m_ko})
        if (i + 1) % 50 == 0:
            print(f'  vocab {i+1}/{len(src)}')
            save_cache(cache)
    DST.mkdir(parents=True, exist_ok=True)
    (DST / 'vocab.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'  vocab.json -> {len(out)} entries')

def translate_exam(client: Anthropic, cache: dict, exam_path: Path):
    exam = json.loads(exam_path.read_text(encoding='utf-8'))

    # passages: en -> ko
    pass_sys = '당신은 일본어 학습 자료 번역가입니다. 영문 번역을 한국어로 자연스럽게 번역하세요. 한국어만 출력.'
    for pid, p in exam['passages'].items():
        if p.get('en'):
            p['ko'] = call(client, pass_sys, p['en'], cache)

    # explanations: regenerate in Korean
    expl_sys = (
        '당신은 JLPT N1 일본어 시험 해설 작성자입니다. '
        '주어진 영문 해설을 참고하여, 한국어로 다음 형식의 해설을 작성하세요:\n\n'
        '1. 정답 이유 (1~2문장)\n'
        '2. 핵심 어휘/문법 포인트 (1~3개 bullet)\n'
        '3. 오답 분석 (필요한 경우)\n\n'
        '한국어로만 작성. 마크다운 형식 사용 가능.'
    )
    for q in exam['questions']:
        if q.get('expl'):
            prompt = (
                f'문제: {q["stem"] or "(지문 빈칸)"}\n'
                f'정답: {q["correct"]+1}번 = {q["opts"][q["correct"]]}\n'
                f'카테고리: {q["category"]}\n\n'
                f'영문 해설:\n{q["expl"]}'
            )
            q['expl_ko'] = call(client, expl_sys, prompt, cache)

    # listening: translate audio-script translation + generate korean explanation
    if exam.get('listening'):
        translate_listening(client, cache, exam['listening'])

    DST_EXAMS = DST / 'exams'
    DST_EXAMS.mkdir(parents=True, exist_ok=True)
    out_path = DST_EXAMS / exam_path.name
    out_path.write_text(json.dumps(exam, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'  {exam_path.name} done')


def translate_listening(client: Anthropic, cache: dict, listening: dict):
    """Translate listening_script_translation (en) -> ko, and synthesize Korean explanation."""
    tr_sys = (
        '당신은 일본어 학습 자료 번역가입니다. '
        'JLPT 청해 음성의 영문 번역을 한국어로 자연스럽게 번역하세요. '
        '대화체는 대화체로, 개행(<br>)은 그대로 보존. 한국어만 출력.'
    )
    expl_sys = (
        '당신은 JLPT N1 청해 해설 작성자입니다. '
        '주어진 음성 원문 텍스트와 정답을 참고하여, 한국어로 다음 형식의 해설을 작성하세요:\n\n'
        '1. 정답 이유 (1~2문장; 본문 어디서 단서가 나왔는지)\n'
        '2. 핵심 표현/어휘 (1~3개 bullet)\n'
        '3. 오답 분석 (필요한 경우)\n\n'
        '한국어로만 작성. 마크다운 형식 사용 가능.'
    )
    for sub in listening['subsections']:
        for q in sub['questions']:
            if q.get('translation_en'):
                q['translation_ko'] = call(client, tr_sys, q['translation_en'], cache)
            script_text = re.sub(r'<rt>.*?</rt>', '', q.get('script_html', ''), flags=re.S)
            script_text = re.sub(r'<[^>]+>', '', script_text).strip()
            if script_text and q.get('correct', -1) >= 0:
                correct_idx = q['correct']
                opts = q.get('opts') or []
                correct_text = opts[correct_idx] if 0 <= correct_idx < len(opts) else f'(no.{correct_idx + 1})'
                prompt = (
                    f'카테고리: {sub.get("english_title", sub.get("type", ""))}\n'
                    f'정답: {correct_idx + 1}번 = {correct_text}\n\n'
                    f'음성 원문(일본어):\n{script_text[:1500]}'
                )
                q['expl_ko'] = call(client, expl_sys, prompt, cache)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=None, help='제한 개수 (vocab은 entry 단위, exams는 회차 파일 단위, 테스트용)')
    ap.add_argument('--what', choices=['vocab', 'exams', 'all'], default='all')
    args = ap.parse_args()

    if not os.environ.get('ANTHROPIC_API_KEY'):
        print('ERROR: ANTHROPIC_API_KEY not set'); sys.exit(1)

    DST.mkdir(parents=True, exist_ok=True)
    # copy non-translated files
    for name in ['index.json', 'kanji_n1.json', 'kanji_all.json']:
        (DST / name).write_bytes((SRC / name).read_bytes())

    client = Anthropic()
    cache = load_cache()
    try:
        if args.what in ('vocab', 'all'):
            print('translating vocab...')
            translate_vocab(client, cache, args.limit)
        if args.what in ('exams', 'all'):
            print('translating exams...')
            files = sorted((SRC / 'exams').glob('n1_*.json'))
            if args.limit is not None: files = files[:args.limit]
            for f in files:
                translate_exam(client, cache, f)
                save_cache(cache)
    finally:
        save_cache(cache)
    print('done.')

if __name__ == '__main__':
    main()
