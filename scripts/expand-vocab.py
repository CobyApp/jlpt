"""
.vocab-candidates.json 의 항목들을 Claude Haiku 로 번역해서 vocab.json 에 병합.

각 항목에 영어 의미(m)와 한국어 의미(m_ko)를 채운다.
캐시: scripts/.translate-cache.json (이미 번역한 단어 재사용).

사용법:
  export ANTHROPIC_API_KEY=sk-ant-...
  .venv/bin/python scripts/expand-vocab.py [--limit N] [--dry-run]

병렬 번역은 하지 않고 순차 호출 (rate limit 안전), 50개 단위로 캐시/병합 저장.
중간에 끊겨도 다시 실행하면 캐시에서 이어서 진행.
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys, time
from pathlib import Path
from anthropic import Anthropic

ROOT = Path(__file__).resolve().parent.parent
SRC_VOCAB = ROOT / 'data' / 'n1_corpus_ko' / 'vocab.json'
CANDIDATES = ROOT / 'scripts' / '.vocab-candidates.json'
CACHE = ROOT / 'scripts' / '.translate-cache.json'
MODEL = 'claude-haiku-4-5-20251001'

SYS = (
    '당신은 일본어→한국어/영어 사전 편집자입니다. '
    '주어진 일본어 단어와 읽기를 보고 자연스러운 영어 의미와 한국어 의미를 한 줄씩 출력하세요. '
    '여러 의미가 있으면 콤마로 구분 (최대 2개). 다른 설명 없이 정확히 두 줄만 출력:\n'
    'EN: <english meaning>\n'
    'KO: <한국어 의미>'
)

def load_cache() -> dict:
    return json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}

def save_cache(c: dict):
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=0), encoding='utf-8')

def cache_key(w: str, r: str) -> str:
    return 'expand:' + hashlib.sha256(f'{MODEL}::{w}::{r}'.encode('utf-8')).hexdigest()[:24]

def parse_response(text: str) -> tuple[str, str]:
    en = ''
    ko = ''
    for line in text.splitlines():
        line = line.strip()
        if line.upper().startswith('EN:'):
            en = line[3:].strip()
        elif line.upper().startswith('KO:'):
            ko = line[3:].strip()
    # Strip trailing punctuation
    return en.rstrip('.。 '), ko.rstrip('.。 ')

def translate_one(client: Anthropic, w: str, r: str, cache: dict) -> tuple[str, str]:
    k = cache_key(w, r)
    if k in cache:
        return parse_response(cache[k])
    prompt = f'단어: {w}\n읽기: {r}'
    msg = client.messages.create(
        model=MODEL,
        max_tokens=200,
        system=SYS,
        messages=[{'role': 'user', 'content': prompt}],
    )
    text = msg.content[0].text.strip()
    cache[k] = text
    return parse_response(text)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=None, help='제한 개수 (테스트용)')
    ap.add_argument('--dry-run', action='store_true', help='API 호출 없이 캔디데이트만 미리보기')
    args = ap.parse_args()

    if not CANDIDATES.exists():
        print(f'ERROR: run extract-vocab-candidates.py first (no {CANDIDATES})'); sys.exit(1)
    candidates = json.loads(CANDIDATES.read_text(encoding='utf-8'))
    if args.limit is not None:
        candidates = candidates[:args.limit]

    print(f'candidates to translate: {len(candidates)}')
    if args.dry_run:
        for e in candidates[:30]:
            print(f"  {e['w']}  {e['r']}  ({e['src']}, freq={e['freq']})")
        print('  …')
        return

    if not os.environ.get('ANTHROPIC_API_KEY'):
        print('ERROR: ANTHROPIC_API_KEY not set'); sys.exit(1)

    vocab = json.loads(SRC_VOCAB.read_text(encoding='utf-8'))
    have = {e['w'] for e in vocab if e.get('w')}

    client = Anthropic()
    cache = load_cache()
    new_entries = []
    failed = 0

    started = time.time()
    try:
        for i, c in enumerate(candidates, 1):
            w = c['w']
            r = c['r']
            if w in have:
                continue
            try:
                en, ko = translate_one(client, w, r, cache)
                if not en and not ko:
                    failed += 1
                    continue
                new_entries.append({'w': w, 'r': r, 'm': en, 'm_ko': ko})
                have.add(w)
            except Exception as ex:
                print(f'  ! error on {w}: {ex}')
                failed += 1
            if i % 50 == 0:
                rate = i / max(time.time() - started, 1)
                eta = int((len(candidates) - i) / max(rate, 0.01))
                print(f'  {i}/{len(candidates)}  new={len(new_entries)}  failed={failed}  rate={rate:.1f}/s  eta={eta}s')
                save_cache(cache)
                # checkpoint: write merged vocab so far so we can resume safely
                merged = vocab + new_entries
                SRC_VOCAB.write_text(json.dumps(merged, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    finally:
        save_cache(cache)
        merged = vocab + new_entries
        SRC_VOCAB.write_text(json.dumps(merged, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'done. added {len(new_entries)} entries (failed={failed}). vocab.json -> {len(merged)} total')

if __name__ == '__main__':
    main()
