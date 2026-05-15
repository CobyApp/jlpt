"""
JLPT N1 청해(听解) 섹션 스크래퍼.

기존 `data/n1_corpus/exams/n1_*.json` 파일의 `source_url`을 이용해
nihonez.com에서 청해 페이지 + admin-ajax 결과를 긁어와
`listening` 키를 채워 넣어 in-place 업데이트한다.

사용법:
    python3 scripts/scrape-listening.py            # 11회차 전체
    python3 scripts/scrape-listening.py n1_2025-07 # 특정 회차만

데이터 구조:
    exam["listening"] = {
      "section_url": "...?start=test&section_id=1",
      "title": "聴解",
      "subsections": [
        {
          "order": 1,
          "title": "問題１",
          "english_title": "Task-based Comprehension",
          "type": "task-based-comprehension",
          "intro_html": "<ruby>問題<rt>もんだい</rt></ruby>1では...",
          "audio_url": "https://nihonez.com/wp-content/uploads/.../...mp3",
          "questions": [
            {
              "id": "11440",
              "n": 1,
              "opts_html": ["<ruby>合宿<rt>がっしゅく</rt></ruby>の..."],
              "opts": ["合宿の申請書", ...],
              "correct": 0,
              "script_html": "<div class='jlpt-passages'>...",
              "translation_en": "At the university office...",
              "explanation_en": ""
            }
          ]
        }
      ]
    }
"""
from __future__ import annotations
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMS = ROOT / 'data' / 'n1_corpus' / 'exams'
AUDIO = ROOT / 'data' / 'n1_corpus' / 'audio'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def download_mp3(remote_url: str, dest: Path) -> int:
    """Download mp3 to dest (idempotent — skip if size matches HEAD content-length)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    # HEAD to get expected size
    req = urllib.request.Request(remote_url, method='HEAD', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        expected = int(r.headers.get('Content-Length', '0') or 0)
    if dest.exists() and expected and dest.stat().st_size == expected:
        return expected
    req = urllib.request.Request(remote_url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, 'wb') as f:
        total = 0
        while True:
            chunk = r.read(1024 * 64)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
    return total


def http_get(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8', errors='replace')


def http_post(url: str, data: dict[str, str]) -> bytes:
    body = urllib.parse.urlencode(data).encode('utf-8')
    req = urllib.request.Request(
        url, data=body,
        headers={'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded'},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def strip_html(s: str) -> str:
    """Remove all tags incl. <rt>...</rt> furigana — leaves only the surface text."""
    no_rt = re.sub(r'<rt>.*?</rt>', '', s, flags=re.S)
    no_tag = re.sub(r'<[^>]+>', '', no_rt)
    return re.sub(r'\s+', ' ', no_tag).strip()


def parse_listening_page(html: str) -> dict:
    """Extract test_id, nonce, sub-section structure (audio + intro + opts per question)."""
    m = re.search(r'id="test_id"[^>]*value="(\d+)"', html)
    if not m:
        raise RuntimeError('test_id not found')
    test_id = m.group(1)

    m = re.search(r'var\s+jlptTestData\s*=\s*({.*?});', html, re.S)
    if not m:
        raise RuntimeError('jlptTestData not found')
    jlpt = json.loads(m.group(1))
    nonce = jlpt['nonce']

    m = re.search(r'var\s+testData\s*=\s*', html)
    if not m:
        raise RuntimeError('testData not found')
    start = m.end()
    depth = 0
    i = start
    while i < len(html):
        c = html[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    test_data = json.loads(html[start:end])
    subsections_meta = test_data['sections'][0]['subsections']
    test_slug = test_data['test_slug_in_question_post_type']

    # Split the HTML by <div class="test-subsection" id="subsection-0-N">
    sub_re = re.compile(
        r'<div class="test-subsection" id="subsection-0-(\d+)">(.*?)(?=<div class="test-subsection" id="subsection-0-\d+">|<!-- Submit Wrapper -->|<div class="submit-test-container"|<div class="footer)',
        re.S,
    )
    subs = []
    for sm in sub_re.finditer(html):
        idx = int(sm.group(1))
        block = sm.group(2)

        # intro <h3>...</h3> (with ruby)
        intro_m = re.search(r'<h3>(.*?)</h3>', block, re.S)
        intro_html = intro_m.group(1).strip() if intro_m else ''

        # audio
        audio_m = re.search(r'<source\s+src="([^"]+\.mp3)"', block)
        audio_url = audio_m.group(1) if audio_m else None

        meta = subsections_meta[idx]
        type_slug = meta.get('question_type', '')
        eng_title = type_slug.replace('-', ' ').title()

        # Each question
        q_re = re.compile(
            r'<div class="question-container" id="question-(\d+)">(.*?)(?=<div class="question-container" id="question-\d+">|</div>\s*</div>\s*<div class="test-subsection|$)',
            re.S,
        )
        opt_re = re.compile(
            r'<label class="answer-choice"[^>]*for="question-\d+-choice-(\d+)"[^>]*>.*?<span class="answer-order">.*?</span>\s*<span class="choice-text-furigana">(.*?)</span>\s*</label>',
            re.S,
        )
        order_re = re.compile(r'<span class="question-order">(\d+)</span>')
        questions = []
        for qm in q_re.finditer(block):
            qid = qm.group(1)
            qblock = qm.group(2)
            order = order_re.search(qblock)
            n = int(order.group(1)) if order else len(questions) + 1
            opts_html = ['', '', '', '']
            for om in opt_re.finditer(qblock):
                ci = int(om.group(1))
                if 0 <= ci < 4:
                    opts_html[ci] = om.group(2).strip()
            opts = [strip_html(o) for o in opts_html]
            questions.append({
                'id': qid,
                'n': n,
                'opts_html': opts_html,
                'opts': opts,
            })

        subs.append({
            'order': idx + 1,
            'title': meta.get('title', f'問題 {idx + 1}'),
            'english_title': eng_title,
            'type': type_slug,
            'intro_html': intro_html,
            'audio_url': audio_url,
            'questions': questions,
        })

    return {
        'test_id': test_id,
        'nonce': nonce,
        'test_slug': test_slug,
        'subsections': subs,
    }


def fetch_answers(ajaxurl: str, nonce: str, test_id: str, test_slug: str) -> dict:
    """POST admin-ajax with empty answers → returns dict[question_id_str] = result."""
    data = http_post(ajaxurl, {
        'action': 'submit_jlpt_test',
        'security': nonce,
        'test_id': test_id,
        'answers': '{}',
        'test_slug_in_question_post_type': test_slug,
        'mode': 'practice',
        'time_spent': '1',
        'section_id': '1',
    })
    obj = json.loads(data)
    if not obj.get('success'):
        raise RuntimeError(f'admin-ajax failed: {obj}')
    return obj['data']['question_results']


def scrape_one(exam_path: Path) -> None:
    exam = json.loads(exam_path.read_text(encoding='utf-8'))
    exam_id = exam_path.stem
    source = exam['source_url']
    listen_url = source + ('&' if '?' in source else '?') + 'start=test&section_id=1'
    print(f'[{exam_id}] GET {listen_url}')
    html = http_get(listen_url)
    parsed = parse_listening_page(html)

    print(f'[{exam_id}] subsections={len(parsed["subsections"])}, '
          f'questions={sum(len(s["questions"]) for s in parsed["subsections"])}')

    # Download mp3s
    for sub in parsed['subsections']:
        if not sub.get('audio_url'):
            continue
        remote = sub['audio_url']
        local = AUDIO / exam_id / f'{sub["type"]}.mp3'
        size = download_mp3(remote, local)
        sub['audio_source_url'] = remote
        sub['audio_url'] = f'audio/{exam_id}/{sub["type"]}.mp3'
        print(f'  mp3 {local.relative_to(ROOT)} ({size / 1024 / 1024:.1f} MB)')

    results = fetch_answers(
        'https://nihonez.com/wp-admin/admin-ajax.php',
        parsed['nonce'], parsed['test_id'], parsed['test_slug'],
    )

    # Merge answers/script/translation into each question
    for sub in parsed['subsections']:
        for q in sub['questions']:
            r = results.get(q['id'])
            if not r:
                print(f'  WARN: no result for {q["id"]}')
                continue
            try:
                # admin-ajax returns 1-based correct_answer for listening; normalize to 0-based.
                correct_idx = int(r['correct_answer']) - 1
            except (TypeError, ValueError):
                correct_idx = -1
            q['correct'] = correct_idx
            q['script_html'] = r.get('listening_script') or ''
            q['translation_en'] = r.get('listening_script_translation') or ''
            q['explanation_en'] = r.get('explaination') or ''
            q['points'] = r.get('possible_points')

    exam['listening'] = {
        'section_url': listen_url,
        'title': '聴解',
        'subsections': [
            {k: v for k, v in s.items()} for s in parsed['subsections']
        ],
    }
    exam_path.write_text(
        json.dumps(exam, ensure_ascii=False),
        encoding='utf-8',
    )
    print(f'[{exam_id}] wrote listening to {exam_path.name}')


def main():
    targets = sys.argv[1:]
    files = sorted(EXAMS.glob('n1_*.json'))
    if targets:
        files = [f for f in files if f.stem in targets]
    print(f'targets: {[f.stem for f in files]}')
    for f in files:
        try:
            scrape_one(f)
        except Exception as e:
            print(f'ERROR {f.stem}: {e}', file=sys.stderr)
            raise
        time.sleep(1)


if __name__ == '__main__':
    main()
