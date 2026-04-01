---
name: atlas-execute
context: fork
description: Atlas Execute 단계 entry skill. task-{id}.json 기준으로 코드 생성/수정 후 Gate E를 통과시킨다. 태스크 하나를 처리하는 단일 실행 단위.
---

# Atlas Execute

이 스킬은 **하나의 태스크**를 처리하는 Execute 단계 entry skill이다.
오케스트레이터(또는 Execute 에이전트)가 태스크마다 이 스킬을 호출한다.

## 입력

- `ATLAS_RUN_DIR` — run 디렉토리 경로
- `ATLAS_TASK_ID` — 현재 태스크 ID (예: `task-001`)
- `task-{id}.json` — 태스크 정의 (AC, files, depends_on, source_tickets)
- `source.json` — 원본 티켓 합본 (참조용)

## 실행 흐름

```
1. atlas-implement-task   → 코드 생성/수정
2. atlas-select-conventions → 적용할 컨벤션 스킬 선택 → skill-manifest.json
3. Gate E-pre             → convention-check.sh + validate.sh
   ├── PASS → git commit → Gate E-post (cross-validate.sh)
   │   ├── PASS → 태스크 완료
   │   └── FAIL → RALP 재시도 (1번으로)
   └── FAIL → atlas-fix-from-validate → RALP 재시도 (3번으로)
```

### 1. 코드 생성 (`atlas-implement-task`)

- `task-{id}.json`의 `files[]`와 `acceptance_criteria`를 기준으로 코드를 생성/수정한다.
- `source_tickets`의 원본 티켓을 참조하여 상세 스펙을 확인한다.
- 타겟 프로젝트의 기존 코드 컨벤션을 따른다.

### 2. 컨벤션 선택 (`atlas-select-conventions`)

- 현재 태스크의 `files[]`와 타입을 분석하여 필요한 컨벤션 스킬을 선택한다.
- `skill-manifest.json`을 생성한다.

### 3. Gate E-pre

```bash
# convention-check.sh
bash .claude/skills/atlas/scripts/convention-check.sh \
  ${ATLAS_RUN_DIR}/tasks/task-${ATLAS_TASK_ID}.json \
  ${ATLAS_RUN_DIR}/evidence/execute/${ATLAS_TASK_ID}/

# validate.sh
bash .claude/skills/atlas/scripts/validate.sh \
  ${ATLAS_RUN_DIR}/tasks/task-${ATLAS_TASK_ID}.json \
  ${ATLAS_RUN_DIR}/evidence/execute/${ATLAS_TASK_ID}/
```

- 두 스크립트 모두 PASS여야 Gate E-pre 통과.
- FAIL이면 `atlas-fix-from-validate`로 수정 후 재검증.

### 4. git commit

Gate E-pre 통과 시 태스크 단위로 커밋한다.
- 커밋 메시지: `atlas(${ATLAS_TASK_ID}): ${task.title}`
- 커밋 대상: `task-{id}.json`의 `files[]`에 명시된 파일만

### 5. Gate E-post

```bash
bash .claude/skills/atlas/scripts/cross-validate.sh \
  ${ATLAS_RUN_DIR}/tasks/task-${ATLAS_TASK_ID}.json \
  ${ATLAS_RUN_DIR}/evidence/execute/${ATLAS_TASK_ID}/
```

- 태스크 정의 파일 ⊆ 커밋 파일 ⊆ 검사 파일 체인을 검증한다.
- FAIL이면 RALP 재시도.

## RALP (Retry-Adapt Loop Protocol)

- 최대 재시도: 3회
- Gate E-pre FAIL → `atlas-fix-from-validate`로 수정 후 Gate E-pre만 재실행
- Gate E-post FAIL → 전체 흐름(implement → validate) 재실행
- 3회 초과 시 태스크 FAIL로 보고하고 다음 태스크로 진행

## 출력

태스크별 증거 디렉토리: `${ATLAS_RUN_DIR}/evidence/execute/${ATLAS_TASK_ID}/`

| 파일 | 생성자 | 용도 |
|------|--------|------|
| `convention-check.json` | convention-check.sh | Gate E-pre 증거 |
| `validate.json` | validate.sh | Gate E-pre 증거 |
| `cross-validation.json` | cross-validate.sh | Gate E-post 증거 |
| `skill-manifest.json` | atlas-select-conventions | 기록 |
| `commit.json` | 스킬 자체 | 기록 |

## 완료 보고

오케스트레이터에게 반환:
- Gate E-pre 결과 (PASS/FAIL)
- Gate E-post 결과 (PASS/FAIL)
- 생성/수정된 파일 목록
- 커밋 해시
- RALP 재시도 횟수
