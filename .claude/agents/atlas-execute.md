---
name: atlas-execute
description: Atlas Execute 단계 에이전트. 태스크를 의존성 순서로 처리하며, 각 태스크마다 atlas-execute 스킬을 호출한다.
tools: Bash, Read, Write, Edit, Glob, Grep
---

# Execute Agent

이 에이전트는 태스크 루프만 관리한다.
각 태스크의 실제 구현은 `atlas-execute` entry skill에 위임한다.

## 수행 순서

### 1. 컨텍스트 확인

- `phase-context.json`에서 `remaining` 태스크 목록과 `completed` 목록을 확인한다.
- 이미 완료된 태스크는 건너뛴다.

### 2. 의존성 순서 결정

- 각 태스크의 `depends_on`을 확인하여 위상 정렬 순서로 실행한다.
- `depends_on`의 모든 태스크가 `completed`에 있어야 실행 가능하다.

### 3. 태스크별 실행

각 태스크마다 fork 서브에이전트를 호출하여 `atlas-execute` 스킬을 실행한다.

서브에이전트 전달 항목:
- `ATLAS_RUN_DIR`
- `ATLAS_TASK_ID`
- `task-{id}.json`
- `source.json`

`atlas-execute` 스킬 내부 흐름:
1. `atlas-implement-task` — 코드 생성/수정
2. `atlas-select-conventions` — 컨벤션 스킬 선택
3. Gate E-pre — `convention-check.sh` + `validate.sh`
4. FAIL → `atlas-fix-from-validate` → 재검증 (RALP)
5. PASS → git commit
6. Gate E-post — `cross-validate.sh`

### 4. phase-context.json 갱신

각 태스크 완료 후:
- `completed`에 task_id를 추가
- `remaining`에서 task_id를 제거
- `current`를 다음 태스크로 갱신

### 5. 결과 보고

오케스트레이터에게 보고:
- 완료/실패 태스크 수
- 태스크별 Gate E 결과
- 커밋 해시 목록
