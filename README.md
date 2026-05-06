# JLPT N1 학습

본인 학습용 정적 N1 모의고사 풀이 SPA. 11회차 (2018 公式問題集 + 2020.12 ~ 2025.7) · 단어 클릭 → 한국어 의미 + 한자 뜻음.

> **Live**: https://coby5502.github.io/jlpt/

## 주요 기능

### 풀이
- **회차별 풀이** — 11개 회차 × 740문제 (청해 제외, 어휘·문법·독해)
- **영역별 모아풀기** — 13개 카테고리(한자읽기, 문맥규정, 유의표현, 용법, 문법형식, 문장만들기, 글의 문법, 단문/중간/장문 독해, 통합/주장 이해, 정보 검색)별로 11회차 문제를 모아서 풀이
- **섹션 / 직접 범위 지정** — 시험 시작 전 영역이나 1~N 범위로 좁혀서 풀이 가능
- **즉시 채점** — 정답 확인 버튼 → ✓/✗ + 한국어 해설 (정답·핵심·오답 분석·포인트 등 라벨별 블록)
- **키보드 단축키** — 1~4 (선지 선택), Enter (정답 확인), ←/→ (이전/다음)
- **후리가나 토글** — N1 한자에 히라가나 루비 ON/OFF
- **이어서 풀기** — 마지막 풀이 위치 자동 저장, 홈에서 한 클릭 재개

### 어휘 학습
- **단어 popover** — 본문/지문/선택지의 단어 클릭 → 읽기 + 한국어 의미 + 한자별 한국식 음·뜻 (예: 自=자(스스로), 分=분(나눌))
- **단어장 (Wordbook)** — popover의 ☆ 버튼으로 단어 저장, `/wordbook` 에서 정렬·관리
- **회차 단어 미리 학습** — 시험 시작 전 그 회차에 등장하는 단어를 영역/범위별로 미리 훑어보기. 출현 빈도, 영역별 단어 수 표시
- **vocab DB**: 3,863개 (N1 표준 어휘 + 사자성어 + 카타카나 외래어 + 시험 본문에서 추출한 합성어)
- **한자 뜻음 매핑**: 1,558자 한국식 음·뜻 (vocab의 모든 한자 100% 커버)

### UX
- 클릭/토글 시 페이지 새로고침 느낌 없음 — 모든 상태 변경은 in-place DOM 패치
- 모바일 반응형
- 학습 진도 / 정답률 / 단어장 카운트 메인 바에 표시

## Dev

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173/jlpt/` 열기.

```bash
npm run test          # vitest
npx tsc --noEmit      # 타입체크
npm run build         # production 빌드 (sync-data 포함)
```

## Tech

- Vite + 바닐라 TypeScript SPA, hash routing
- 데이터: `data/n1_corpus_ko/` (JSON) → `public/data/` (sync 스크립트로 복사) → fetch
- 단어 매칭: `src/lib/vocab-match.ts` — 첫 글자 인덱싱 + 가장 긴 매칭 우선 그리디
- 한자 뜻음: `data/n1_corpus_ko/kanji_ko.json` (35KB) — popover 첫 클릭 시 lazy load
- 상태: `localStorage` 키 `jlpt:progress`, `jlpt:last`, `jlpt:settings`, `jlpt:wordbook`, `jlpt:home-tab`

## 데이터 파이프라인

### 영문 원본 → 한국어 변환 (Claude Haiku)

```bash
.venv/bin/pip install -r scripts/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
.venv/bin/python scripts/translate.py
```

산출물은 `data/n1_corpus_ko/`. 실행 안 하면 sync가 자동으로 영문 원본으로 fallback.

### 어휘 enrichment (시험 본문에서 누락 단어 추출)

```bash
# 1) 후보 추출 — fugashi(MeCab)로 합성어/명사 추출
.venv/bin/python scripts/extract-vocab-candidates.py

# 2) 번역 + 머지 (Claude Haiku 자동) 또는 수동 작업
.venv/bin/python scripts/expand-vocab.py
.venv/bin/python scripts/merge-vocab.py
```

## Deploy

`main` 푸시 시 GitHub Actions가 `dist/`를 GitHub Pages로 자동 배포.

GitHub repo Settings → Pages → Source = "GitHub Actions" 설정 필요.

## 라우트

- `#/` — 홈 (회차별 / 영역별 모아풀기 탭)
- `#/wordbook` — 단어장
- `#/exam/<id>` — 회차 시작 화면 (섹션 선택 / 범위 지정 / 단어 미리보기)
- `#/exam/<id>/words?section=&from=&to=` — 단어 미리 학습
- `#/exam/<id>/q/<n>?from=&to=` — 문제 풀이

## 코드 구조

```
src/
  main.ts            # 라우트 디스패치
  router.ts          # hash 라우팅
  state.ts           # localStorage state (progress, last, settings, wordbook)
  types.ts           # Exam, Question, VocabEntry 타입
  views/
    home.ts          # 회차별 / 영역별 모아풀기
    exam.ts          # 시험 시작 화면 (섹션 선택)
    question.ts      # 문제 풀이 + 즉시 채점
    wordlist.ts      # 단어 미리 학습
    wordbook.ts      # 단어장
  lib/
    data.ts          # 데이터 로더 (caching)
    vocab-match.ts   # 단어 매칭 인덱스
    popover.ts       # 단어 popover (한자 뜻음 포함)
    furigana.ts      # 후리가나 렌더링
    categories.ts    # 13개 카테고리 메타
    html.ts          # escapeHtml
data/n1_corpus_ko/   # 한국어 변환된 데이터 (이게 실제 source of truth)
public/data/         # sync 스크립트가 자동 복사 (gitignored)
scripts/             # 데이터 파이프라인 (translate, extract, merge)
test/                # vitest (27 tests)
```
