# Atlas 팀 설명서 (중학생도 이해하는 버전)

이 문서는 `/Users/rio/Documents/code/github/atlas-engine/.claude` 안에 있는 `atlas`를 팀원에게 설명하기 위한 가이드입니다.  
코드를 처음 보는 사람도 이해할 수 있게, 쉬운 말로 아주 자세히 적었습니다.

---

## 1. Atlas가 뭐야?

한 줄 정의:

`Atlas`는 "Jira 티켓을 읽고, 해야 할 개발 일을 쪼개고, 코드 수정과 검증을 안전하게 진행하게 도와주는 작업 도우미"입니다.

쉽게 비유하면:

- Jira 티켓 = 선생님이 준 수행평가 안내문
- Atlas = 안내문을 읽어서
  - 해야 할 일을 체크리스트로 만들고
  - 순서대로 실행하고
  - 결과를 기록해 주는 조장

---

## 2. 어디에 뭐가 있나? (폴더 지도)

### 2-1. 규칙/지침 문서 위치

- `.claude/skills/atlas/SKILL.md`
- `.claude/skills/atlas/ingest.md`
- `.claude/skills/atlas/analyze.md`
- `.claude/skills/atlas/plan.md`
- `.claude/skills/atlas/execute.md`
- `.claude/skills/atlas/verify.md`
- `.claude/skills/atlas/atlas.py` (실제 CLI 스크립트)

### 2-2. 실행 산출물 위치

- `.harness/.env` (환경설정)
- `.harness/ticket.json` (티켓 분석 입력으로 쓰이는 파일)
- `.harness/requirements.json` (요구사항 분석 결과)
- `.harness/risk.json` (위험도 분석 결과)
- `.harness/plan.json` (실행 계획)
- `.harness/tasks/T-*.json` (태스크별 실행 기록)
- `.harness/verify.json` (최종 회귀 검증 결과)
- `.harness/tickets/` (Jira 트리 내보낸 파일들)

중요:

- `atlas.py jira` 명령은 현재 코드 기준으로 `.harness/tickets/`를 생성합니다.
- 문서 일부에는 `.harness/ticket.json`을 입력으로 가정하는 내용이 섞여 있습니다.
- 즉, 팀에서 실제 운영 시 "tickets 폴더 출력"과 "ticket.json 입력" 연결 규칙을 명확히 정해야 합니다.

---

## 3. 전체 흐름 (큰 그림)

`SKILL.md` 기준 표준 파이프라인:

1. `ingest` (Jira 티켓 가져오기)
2. `analyze` (요구사항/리스크 분석)
3. `plan` (태스크 계획 만들기)
4. `execute` (태스크별 코드 작업 + 검증)
5. `verify` (전체 회귀 검증)

즉:

`티켓 수집 → 이해하기 → 작업쪼개기 → 코드수정 → 전체점검`

---

## 4. atlas.py가 하는 일 (코드 기준)

`atlas.py`는 4개의 서브 명령을 제공합니다.

## 4-1. `env`

명령:

```bash
python3 .claude/skills/atlas/atlas.py env --require=TARGET_PROJECT_DIR
```

역할:

- `.harness/.env` 파일이 있는지 확인
- 필수 키가 들어있는지 확인 (`--require=...`)
- `TARGET_PROJECT_DIR`가 실제 git 저장소인지 검사

실패 예시:

- `.env` 파일 없음
- 필수 환경변수 누락
- `TARGET_PROJECT_DIR`가 폴더가 아니거나 `.git` 없음

## 4-2. `jira <TICKET_KEY>`

명령:

```bash
python3 .claude/skills/atlas/atlas.py jira GRID-2
```

역할:

- Jira REST API v3로 티켓 트리를 BFS 방식으로 수집
- 부모/자식 이슈를 배치 JQL로 모아서 가져옴
- Jira description(ADF)을 Markdown 텍스트로 변환
- 결과를 `.harness/tickets/`에 트리 구조로 저장

출력 예:

- `.harness/tickets/tree.json`
- `.harness/tickets/GRID-2.json`
- `.harness/tickets/GRID-2/GRID-7.json` ...

필수 env:

- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`

## 4-3. `diff`

명령:

```bash
python3 .claude/skills/atlas/atlas.py diff --cwd=<TARGET_PROJECT_DIR>
```

역할:

- `git diff`를 읽어서 변경 파일 목록을 JSON으로 정리
- 파일별 추가/삭제 줄 수, 상태(create/modify/delete)까지 계산

## 4-4. `scope`

명령:

```bash
python3 .claude/skills/atlas/atlas.py scope --task=T-1 --cwd=<TARGET_PROJECT_DIR>
```

역할:

- `plan.json`의 `scope.editable_paths`, `scope.forbidden_paths`를 기준으로
- 지금 바꾼 파일이 허용 범위 안인지 검사

왜 중요?

- AI가 실수로 "금지 영역"을 건드리는 걸 막는 안전장치입니다.

---

## 5. 단계별 상세 설명

## 5-1. ingest (티켓 수집)

입력:

- Jira 티켓 키 (예: `GRID-2`)
- Jira 인증 정보(env)

하는 일:

- 루트 티켓부터 하위 티켓까지 모두 모음
- 티켓 설명/링크/부모관계/서브태스크를 구조화

출력:

- `.harness/tickets/` 트리

팀원이 확인할 것:

- root 키가 맞는지
- total 개수가 기대와 맞는지
- description이 깨지지 않았는지

## 5-2. analyze (요구사항 분석)

입력:

- 티켓 정보 (`ticket.json` 혹은 tickets 출력을 기반으로 생성한 입력)
- 프로젝트 코드 구조

하는 일:

- 인수 기준(AC) 뽑기
- 테스트 시나리오 만들기
- 구현 단계 정리
- 모호한 부분/누락 정보 정리
- 의존성 정리
- 위험도 평가

출력:

- `.harness/requirements.json`
- `.harness/risk.json`

현재 저장소 예시:

- AC 20개
- 테스트 시나리오 20개
- missing_info 4개
- risk level = `medium`

## 5-3. plan (실행 계획)

입력:

- `requirements.json`
- `risk.json`

하는 일:

- 작업을 `T-1`, `T-2`처럼 태스크로 분할
- 각 태스크가 수정 가능한 경로/금지 경로(scope) 지정
- 태스크별 검증 명령(`verify_cmd`) 설정
- 의존성(`deps`)과 실행 순서(`execution_order`) 확정

출력:

- `.harness/plan.json`

현재 저장소 예시:

- 태스크 13개 (`T-1` ~ `T-13`)
- 순차 실행 순서 정의 완료

## 5-4. execute (태스크 실행)

입력:

- `plan.json`

하는 일:

1. 태스크 설명 보고 코드 수정
2. `scope` 검사로 허용 범위 검증
3. `verify_cmd` 실행
4. 변경 내용을 `tasks/T-*.json`으로 기록
5. 통과 시 태스크 단위 커밋

출력:

- `.harness/tasks/T-*.json`
- 코드 변경 + 커밋

실패 처리:

- 스코프 위반: 위반 파일 되돌리고 재시도
- 검증 실패: 최대 3회 재시도 후 사용자 판단 요청

## 5-5. verify (최종 검증)

입력:

- `plan.json`
- `tasks/*.json`
- `VERIFY_CMD` (env)

하는 일:

- 전체 타입체크/테스트/빌드 실행
- 실패 시 원인 추적 후 최대 3회 수정 재시도

출력:

- `.harness/verify.json` (`pass` 또는 `fail`)

---

## 6. 실제 파일 예시로 이해하기

## 6-1. risk.json 예시 해석

현재 `.harness/risk.json`은 `medium`입니다.

이 뜻:

- 범위가 큼 (엔티티, API, 배치, 상태머신 포함)
- DB 마이그레이션/FK 관계가 복잡함
- 기존 테스트 계약과 충돌 가능성이 있음

즉, "빠르게 끝낼 수 있는 단순 작업"이 아니라, 순서와 검증이 꼭 필요한 작업입니다.

## 6-2. tasks/T-1.json ~ T-5.json 예시 해석

- `T-1`: SQL 마이그레이션 파일 생성 (완료)
- `T-2`: 포인트 엔티티/enum 구현 (완료)
- `T-3`: Repository 구현 (완료)
- `T-4`: 계산 도메인 서비스 구현 (완료)
- `T-5`: GrantService 구현 (완료)

중요 관찰:

- `T-1`은 `task_id`, `status`, `verification` 구조
- `T-2` 이후는 `taskId`, `title`, `filesCreated` 등 구조가 다름

즉, 현재 기록 JSON 포맷이 혼재되어 있습니다.  
팀에서 리포트 자동화를 하려면 단일 스키마로 통일해야 합니다.

---

## 7. 새 팀원이 바로 따라하는 실행 순서

## 7-1. 0단계: 환경 준비

1. `.harness/.env` 파일 생성
2. 최소 키 입력
   - `TARGET_PROJECT_DIR`
   - `JIRA_BASE_URL`
   - `JIRA_EMAIL`
   - `JIRA_API_TOKEN`
   - `VERIFY_CMD` (권장)
3. 검증:

```bash
python3 .claude/skills/atlas/atlas.py env --require=TARGET_PROJECT_DIR
```

## 7-2. 1단계: Jira 가져오기

```bash
python3 .claude/skills/atlas/atlas.py jira GRID-2
```

확인:

- `.harness/tickets/tree.json` 생성 여부
- total/계층 구조 정상 여부

## 7-3. 2단계 이후 (analyze → plan → execute → verify)

현재 문서 기준으로는 AI 에이전트가 각 md 지침을 따라 JSON을 생성/갱신합니다.

- analyze: `requirements.json`, `risk.json`
- plan: `plan.json`
- execute: `tasks/*.json` + 코드 변경
- verify: `verify.json`

---

## 8. 팀 운영 규칙 (실수 줄이기)

1. 스코프 밖 수정 금지  
`scope` 검사 없이 머지하지 않기

2. 태스크당 작은 변경 유지  
1~3개 파일 중심으로 쪼개기

3. verify_cmd를 태스크에 맞게 좁히기  
매번 전체 테스트 돌리지 말고 관련 테스트 우선

4. 태스크 기록(JSON) 스키마 통일  
`task_id` vs `taskId` 같은 불일치 제거

5. 최종 verify는 반드시 전체 범위로 1회 이상 실행  
부분 검증 통과와 전체 회귀 통과는 다름

---

## 9. 자주 묻는 질문 (FAQ)

Q1. 왜 `scope` 검사가 필요한가요?  
A1. AI가 편하게 고치다 보면 관련 없는 파일까지 만질 수 있습니다. `scope`는 "여기까지만 수정"이라는 안전 울타리입니다.

Q2. 왜 `tasks/*.json`을 남기나요?  
A2. "누가, 어떤 파일을, 어떤 근거로 바꿨는지"를 추적하기 위해서입니다. 문제 생겼을 때 원인 찾기가 쉬워집니다.

Q3. `risk.json`이 왜 필요하죠?  
A3. 위험도가 높으면 작업을 더 잘게 나누고, 테스트를 더 강하게 걸어야 합니다. 즉, 실패 확률을 줄이는 브레이크입니다.

Q4. 왜 ingest 결과와 analyze 입력 설명이 달라 보이나요?  
A4. 현재 문서/코드가 혼재되어 있어서 그렇습니다. 실제 운영 전에 `tickets/` 기반으로 analyze가 읽는 입력 형식을 팀에서 하나로 고정해야 합니다.

---

## 10. 지금 팀이 바로 정리하면 좋은 항목 (권장)

1. 입력 형식 통일  
`ingest` 출력을 `ticket.json`으로 쓸지, `tickets/`를 직접 읽을지 결정

2. 태스크 결과 스키마 통일  
`T-1` 형식과 `T-2~` 형식 중 하나로 통일

3. 실행 자동화 스크립트 추가  
`ingest → analyze → plan → execute → verify`를 한 번에 묶는 래퍼 스크립트

4. 실패 템플릿 통일  
검증 실패 시 사용자에게 보여줄 메시지 형식 고정

---

## 11. 한 줄 결론

Atlas는 "티켓 기반 개발을 안전하고 재현 가능하게 만드는 작업 파이프라인"입니다.  
핵심은 `작업 분해(plan) + 수정 범위 통제(scope) + 기록(tasks) + 최종 회귀(verify)` 네 가지입니다.
